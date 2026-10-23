// Campi della delega. Se li modifichi, aggiorna anche public/index.html e netlify/lib/pdf.mjs
export const FIELDS = [
  { name: "amministrazione", label: "All'Amministrazione / Azienda", required: true, max: 120 },
  { name: "cognome", label: "Cognome", required: true, max: 60 },
  { name: "nome", label: "Nome", required: true, max: 60 },
  { name: "indirizzo", label: "Abitante in (indirizzo)", required: true, max: 100 },
  { name: "citta", label: "Città", required: true, max: 60 },
  { name: "cap", label: "CAP", required: true, max: 5, pattern: /^\d{5}$/ },
  { name: "cellulare", label: "Cellulare", required: true, max: 20, pattern: /^\+?[\d\s.\-/]{6,20}$/ },
  { name: "codiceFiscale", label: "Codice fiscale", required: true, max: 16 },
  { name: "matricola", label: "N. matricola stipendiale", required: false, max: 30 },
  { name: "postoLavoro", label: "Posto di lavoro", required: true, max: 100 },
  { name: "sedeLavoro", label: "Indirizzo sede di lavoro", required: false, max: 120 },
  { name: "datoreLavoro", label: "Datore di lavoro", required: true, max: 120 },
  { name: "qualifica", label: "Qualifica", required: true, max: 60 },
  { name: "livello", label: "Livello", required: false, max: 12 },
  { name: "dataAssunzione", label: "Data assunzione", required: false, date: true },
  { name: "tipoRapporto", label: "Tipo rapporto di lavoro", required: true, max: 80 },
  { name: "rapportoDal", label: "Rapporto dal", required: false, date: true },
  { name: "rapportoAl", label: "Rapporto al", required: false, date: true },
  { name: "ccnl", label: "CCNL applicato", required: false, max: 120 },
  { name: "luogo", label: "Luogo di sottoscrizione", required: true, max: 60 },
];

export const CONSENSI = [
  "Comunicazione dei dati ai soggetti indicati nell'informativa (datore di lavoro, enti previdenziali e assistenziali, enti bilaterali, enti paritetici contrattuali, enti pubblici)",
  "Comunicazione e trattamento dei dati a Patronato Inca, CAAF CGIL, Sunia, Auser, Federconsumatori ed enti collegati per attività promozionale",
  "Comunicazione e trattamento dei dati a Patronato Inca, CAAF CGIL, Sunia, Auser, Federconsumatori ed enti collegati per adempiere a mandati o incarichi conferiti",
  "Profilazione dei dati personali per l'individuazione di benefici",
];

const CF_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
export function isCodiceFiscale(cf) {
  cf = String(cf).toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i];
    const n = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? CF_ODD[n] : n;
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Restituisce { data } oppure { error }
export function validate(input) {
  const data = {};
  for (const f of FIELDS) {
    let v = String(input?.[f.name] ?? "").trim().replace(/\s+/g, " ");
    if (f.required && !v) return { error: `Il campo "${f.label}" è obbligatorio.` };
    if (v && f.date && !isDate(v)) return { error: `Il campo "${f.label}" non è una data valida.` };
    if (v && f.max && v.length > f.max) return { error: `Il campo "${f.label}" è troppo lungo.` };
    if (v && f.pattern && !f.pattern.test(v)) return { error: `Il campo "${f.label}" non è valido.` };
    data[f.name] = v;
  }
  data.codiceFiscale = data.codiceFiscale.toUpperCase();
  if (!isCodiceFiscale(data.codiceFiscale)) return { error: "Il codice fiscale non è valido." };
  if (data.rapportoDal && data.rapportoAl && data.rapportoAl < data.rapportoDal) {
    return { error: "La data di fine rapporto è precedente a quella di inizio." };
  }

  const consensi = input?.consensi;
  if (!Array.isArray(consensi) || consensi.length !== CONSENSI.length || !consensi.every((c) => c === "si" || c === "no")) {
    return { error: "Indica se presti o neghi ciascuno dei 4 consensi." };
  }
  data.consensi = consensi;
  if (input?.autorizzo !== true) return { error: "È necessario confermare l'autorizzazione alla trattenuta." };
  if (input?.informativa !== true) return { error: "È necessario dichiarare di aver letto l'informativa." };
  return { data };
}

export const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
