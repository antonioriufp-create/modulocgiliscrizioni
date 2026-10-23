import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import template from "./template.mjs";
import { FIELDS, CONSENSI, fmtDate } from "./fields.mjs";

const INK = rgb(0.05, 0.15, 0.45);

// Le font standard PDF supportano solo WinAnsi: sostituisco i caratteri non rappresentabili
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (s) =>
  [...String(s ?? "")].map((c) => (c.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.includes(c) ? c : "?")).join("");

// Scrive il testo riducendo il corpo finché entra nella larghezza disponibile
function put(page, font, text, x, y, maxW, size = 10) {
  text = clean(text);
  if (!text) return;
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  while (text.length > 1 && font.widthOfTextAtSize(text, size) > maxW) text = text.slice(0, -1);
  page.drawText(text, { x, y, size, font, color: INK });
}

const romeTime = (ms) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(ms));

const romeDateParts = (ms) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value])
  );
  return [p.day, p.month, p.year];
};

/**
 * Compila il modulo originale e aggiunge la pagina di attestazione della verifica.
 * d = dati validati; meta = { id, email, verifiedAt, submittedAt, ip, userAgent, dataHash }
 */
export async function buildPdf(d, meta) {
  const pdf = await PDFDocument.load(Buffer.from(template, "base64"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [p1, p2] = pdf.getPages();
  const H1 = p1.getHeight();
  const y1 = (yMax) => H1 - yMax + 2.5; // da coordinate "dall'alto" a baseline PDF

  put(p1, font, d.amministrazione, 205, y1(218), 330);
  put(p1, font, d.cognome, 108, y1(240), 195);
  put(p1, font, d.nome, 341, y1(240), 194);
  put(p1, font, d.indirizzo, 115, y1(262), 200);
  put(p1, font, d.citta, 85, y1(284), 192);
  put(p1, font, d.cap, 80, y1(306), 64);
  put(p1, font, meta.email, 172, y1(306), 183);
  put(p1, font, d.cellulare, 384, y1(306), 152);

  const cfX = [127, 142, 157, 171, 186, 201, 215, 230, 245, 259, 274, 289, 303, 318, 333, 347];
  [...d.codiceFiscale].forEach((c, i) => {
    const w = bold.widthOfTextAtSize(c, 10);
    p1.drawText(c, { x: cfX[i] + 6 - w / 2, y: y1(327), size: 10, font: bold, color: INK });
  });

  put(p1, font, d.matricola, 82, y1(350), 105);
  put(p1, font, d.postoLavoro, 268, y1(350), 266);
  put(p1, font, d.sedeLavoro, 161, y1(372), 374);
  put(p1, font, d.datoreLavoro, 130, y1(394), 404);
  put(p1, font, d.qualifica, 104, y1(416), 142);
  put(p1, font, d.livello, 284, y1(416), 34);
  put(p1, font, fmtDate(d.dataAssunzione), 403, y1(416), 134);
  put(p1, font, d.tipoRapporto, 173, y1(438), 243);
  put(p1, font, fmtDate(d.rapportoDal), 436, y1(438), 99);
  put(p1, font, fmtDate(d.rapportoAl), 70, y1(460), 105);
  put(p1, font, d.ccnl, 251, y1(460), 285);

  const [dd, mm, yyyy] = romeDateParts(meta.submittedAt);
  put(p1, font, dd, 90, y1(782), 20);
  put(p1, font, mm, 124, y1(782), 22);
  put(p1, font, yyyy, 178, y1(782), 60);
  const firma = `${d.nome} ${d.cognome} - firmato elettronicamente (OTP) - rif. ${meta.id}`;
  put(p1, font, firma, 276, y1(782), 260, 8);

  // Pagina 2: consensi
  const H2 = p2.getHeight();
  [397, 448, 493, 537].forEach((yMax, i) => {
    const x = d.consensi[i] === "si" ? 193.4 : 345.4;
    p2.drawText("X", { x: x + 0.6, y: H2 - yMax + 1.2, size: 9, font: bold, color: INK });
  });
  put(p2, font, `${d.luogo}, ${dd}/${mm}/${yyyy}`, 84, H2 - 558 + 2.5, 80, 8);
  put(p2, font, `${d.nome} ${d.cognome} - firma elettronica (OTP)`, 205, H2 - 558 + 2.5, 122, 7);

  // Pagina 3: attestazione
  const p3 = pdf.addPage([595.28, 841.89]);
  let y = 780;
  const line = (label, value, size = 10) => {
    p3.drawText(clean(label), { x: 56, y, size, font: bold });
    const lines = wrap(clean(value), font, size, 330);
    lines.forEach((l, i) => p3.drawText(l, { x: 210, y: y - i * (size + 3), size, font }));
    y -= Math.max(1, lines.length) * (size + 3) + 7;
  };
  p3.drawText("ATTESTAZIONE DI SOTTOSCRIZIONE ELETTRONICA", { x: 56, y, size: 14, font: bold });
  y -= 22;
  const intro =
    "Il presente modulo è stato compilato online e sottoscritto dall'interessato con firma elettronica, " +
    "previa verifica del possesso dell'indirizzo email indicato mediante codice monouso (OTP) inviato a tale indirizzo. " +
    "Di seguito i dati che associano il documento al firmatario.";
  wrap(clean(intro), font, 10, 483).forEach((l) => { p3.drawText(l, { x: 56, y, size: 10, font }); y -= 14; });
  y -= 12;

  line("Riferimento pratica", meta.id);
  line("Firmatario", `${d.nome} ${d.cognome}`);
  line("Codice fiscale", d.codiceFiscale);
  line("Email verificata (OTP)", meta.email);
  line("Verifica OTP superata il", `${romeTime(meta.verifiedAt)} (ora italiana)`);
  line("Modulo inviato il", `${romeTime(meta.submittedAt)} (ora italiana)`);
  line("Indirizzo IP", meta.ip || "n.d.");
  line("Browser", meta.userAgent || "n.d.", 8);
  line("Impronta SHA-256 dei dati", meta.dataHash, 8);
  y -= 6;
  p3.drawText("Dichiarazioni rese", { x: 56, y, size: 11, font: bold });
  y -= 18;
  const dich = [
    "[X] Autorizzo la trattenuta mensile dell'1% dello stipendio tabellare a favore della FP CGIL e dichiaro quanto riportato al punto 1) della delega.",
    "[X] Dichiaro di aver letto l'informativa sul trattamento dei dati personali.",
    ...CONSENSI.map((c, i) => `${i + 1}. ${c}: ${d.consensi[i] === "si" ? "PRESTO IL CONSENSO" : "NEGO IL CONSENSO"}`),
  ];
  for (const t of dich) {
    wrap(clean(t), font, 9, 483).forEach((l) => { p3.drawText(l, { x: 56, y, size: 9, font }); y -= 12; });
    y -= 4;
  }
  y -= 8;
  p3.drawText("Riepilogo dei dati inseriti", { x: 56, y, size: 11, font: bold });
  y -= 16;
  for (const f of FIELDS) {
    const v = f.date ? fmtDate(d[f.name]) : d[f.name];
    p3.drawText(clean(`${f.label}: `), { x: 56, y, size: 8, font: bold });
    p3.drawText(clean(v || "-"), { x: 210, y, size: 8, font });
    y -= 11;
  }

  pdf.setTitle(`Delega FP CGIL - ${d.cognome} ${d.nome}`);
  pdf.setSubject(`Rif. ${meta.id}`);
  pdf.setProducer("Modulo online FP CGIL Nord Sardegna");
  return pdf.save();
}

function wrap(text, font, size, maxW) {
  const out = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const t = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
    else {
      if (cur) out.push(cur);
      cur = word;
      while (font.widthOfTextAtSize(cur, size) > maxW) {
        let i = cur.length;
        while (i > 1 && font.widthOfTextAtSize(cur.slice(0, i), size) > maxW) i--;
        out.push(cur.slice(0, i));
        cur = cur.slice(i);
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}
