import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { json, readJson, readToken, hmac, mailer, mailFrom, esc } from "../lib/common.mjs";
import { FIELDS, CONSENSI, validate, fmtDate } from "../lib/fields.mjs";
import { buildPdf } from "../lib/pdf.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { error: "Metodo non consentito." });
  const body = await readJson(req);
  const tok = readToken(body?.token);
  if (!tok) return json(401, { error: "Verifica email scaduta o non valida. Ripeti la verifica." });

  const { data, error } = validate(body?.fields);
  if (error) return json(400, { error });

  // Ogni verifica OTP vale per un solo invio
  const used = getStore({ name: "used-tokens", consistency: "strong" });
  const tokKey = hmac(`used:${tok.n}`);
  if (await used.get(tokKey)) return json(409, { error: "Questo modulo è già stato inviato." });
  await used.set(tokKey, "1");

  const submittedAt = Date.now();
  const id = `DEL-${new Date(submittedAt).toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const record = {
    id, email: tok.e, ...data,
    verifiedAt: new Date(tok.v).toISOString(),
    submittedAt: new Date(submittedAt).toISOString(),
    ip: context?.ip || req.headers.get("x-nf-client-connection-ip") || "",
    userAgent: (req.headers.get("user-agent") || "").slice(0, 300),
  };
  record.dataHash = crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");

  let pdfBytes;
  try {
    pdfBytes = await buildPdf(data, { ...record, verifiedAt: tok.v, submittedAt });
  } catch (err) {
    console.error("Generazione PDF fallita:", err);
    await used.delete(tokKey);
    return json(500, { error: "Errore nella generazione del documento. Riprova." });
  }
  record.pdfSha256 = crypto.createHash("sha256").update(pdfBytes).digest("hex");

  const store = getStore("deleghe");
  await store.setJSON(`${id}.json`, record);
  await store.set(`${id}.pdf`, new Blob([pdfBytes], { type: "application/pdf" }));

  const filename = `Delega_FP_CGIL_${data.cognome}_${data.nome}_${id}.pdf`.replace(/[^\w.\-]+/g, "_");
  const attachment = { filename, content: Buffer.from(pdfBytes), contentType: "application/pdf" };
  const rows = [
    ["Riferimento", id],
    ["Email (verificata con OTP)", tok.e],
    ...FIELDS.map((f) => [f.label, (f.date ? fmtDate(data[f.name]) : data[f.name]) || "—"]),
    ...CONSENSI.map((c, i) => [`Consenso ${i + 1}`, data.consensi[i] === "si" ? "Prestato" : "Negato"]),
    ["Impronta SHA-256 PDF", record.pdfSha256],
  ];
  const table = `<table cellpadding="5" style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="border:1px solid #ddd;background:#f7f7f7"><b>${esc(k)}</b></td><td style="border:1px solid #ddd">${esc(v)}</td></tr>`)
    .join("")}</table>`;

  try {
    if (process.env.NOTIFY_TO) {
      await mailer().sendMail({
        from: mailFrom(),
        to: process.env.NOTIFY_TO,
        replyTo: tok.e,
        subject: `Nuova delega: ${data.cognome} ${data.nome} — ${data.amministrazione} [${id}]`,
        text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
        html: `<h2>Nuova delega sindacale online</h2>${table}<p>In allegato il modulo compilato con l'attestazione di verifica.</p>`,
        attachments: [attachment],
      });
    }
    await mailer().sendMail({
      from: mailFrom(),
      to: tok.e,
      subject: `FP CGIL Nord Sardegna — la tua delega è stata ricevuta [${id}]`,
      text: `Gentile ${data.nome} ${data.cognome},\nabbiamo ricevuto la tua delega sindacale (rif. ${id}). In allegato trovi copia del modulo compilato.\nGrazie per aver scelto la FP CGIL.\n\nFP CGIL Nord Sardegna`,
      html: `<p>Gentile ${esc(data.nome)} ${esc(data.cognome)},</p><p>abbiamo ricevuto la tua delega sindacale (rif. <b>${esc(id)}</b>). In allegato trovi copia del modulo compilato.</p><p>Grazie per aver scelto la FP CGIL.</p><p>FP CGIL Nord Sardegna</p>`,
      attachments: [attachment],
    });
  } catch (err) {
    // La delega è comunque salvata su Netlify Blobs
    console.error("Email non inviata:", err);
  }

  return json(200, { ok: true, id });
};

export const config = { path: "/api/submit" };
