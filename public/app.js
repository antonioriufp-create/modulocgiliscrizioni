const $ = (id) => document.getElementById(id);
const form = $("form"), email = $("email"), code = $("code");
const sendBtn = $("sendBtn"), submitBtn = $("submitBtn"), msgEl = $("msg");
const TEXT_FIELDS = ["amministrazione", "cognome", "nome", "indirizzo", "citta", "cap", "cellulare", "codiceFiscale",
  "matricola", "postoLavoro", "sedeLavoro", "datoreLavoro", "qualifica", "livello", "dataAssunzione", "tipoRapporto",
  "rapportoDal", "rapportoAl", "ccnl", "luogo"];
let token = null, verifiedEmail = null, timer = null;

function msg(text, type = "") { msgEl.textContent = text; msgEl.className = `msg ${type}`; }

async function api(path, payload) {
  const res = await fetch(`/api/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Errore imprevisto, riprova."), data);
  return data;
}

// Controllo codice fiscale (stesso algoritmo del server)
const CF_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
function isCodiceFiscale(cf) {
  cf = cf.toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i], n = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? CF_ODD[n] : n;
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}
const cfInput = form.elements.codiceFiscale;
cfInput.addEventListener("input", () => {
  cfInput.value = cfInput.value.toUpperCase().replace(/\s/g, "");
  cfInput.setCustomValidity(cfInput.value.length === 16 && !isCodiceFiscale(cfInput.value) ? "Codice fiscale non valido" : "");
});

const tipo = form.elements.tipoRapporto, al = form.elements.rapportoAl;
const syncAl = () => { al.required = /determinato/i.test(tipo.value) && !/indeterminato/i.test(tipo.value); };
tipo.addEventListener("input", syncAl);

function checkForm() {
  syncAl();
  cfInput.setCustomValidity(cfInput.value && !isCodiceFiscale(cfInput.value) ? "Codice fiscale non valido" : "");
  const rd = form.elements.rapportoDal.value;
  al.setCustomValidity(rd && al.value && al.value < rd ? "La data di fine è precedente a quella di inizio" : "");
  for (const el of form.elements) {
    if (el === code || !el.willValidate) continue;
    if (!el.checkValidity()) {
      el.closest("details")?.setAttribute("open", "");
      el.reportValidity();
      return false;
    }
  }
  return true;
}

function collect() {
  const fields = {};
  for (const k of TEXT_FIELDS) fields[k] = form.elements[k].value;
  fields.consensi = [0, 1, 2, 3].map((i) => form.elements[`c${i}`].value);
  fields.autorizzo = form.elements.autorizzo.checked;
  fields.informativa = form.elements.informativa.checked;
  return fields;
}

function cooldown(sec) {
  clearInterval(timer);
  sendBtn.disabled = true;
  const tick = () => {
    if (sec <= 0) { clearInterval(timer); sendBtn.disabled = false; sendBtn.textContent = "Invia di nuovo"; return; }
    sendBtn.textContent = `Reinvia (${sec--}s)`;
  };
  tick(); timer = setInterval(tick, 1000);
}

sendBtn.addEventListener("click", async () => {
  if (!checkForm()) { msg("Completa prima tutti i campi obbligatori del modulo.", "err"); return; }
  sendBtn.disabled = true;
  msg("Invio del codice in corso…");
  try {
    const r = await api("send-otp", { email: email.value });
    $("otpBox").hidden = false;
    code.value = ""; code.focus();
    msg(`Codice inviato a ${email.value}. Controlla anche la cartella spam. È valido ${r.ttl / 60} minuti.`, "ok");
    cooldown(r.cooldown);
  } catch (e) {
    msg(e.message, "err");
    e.wait ? cooldown(e.wait) : (sendBtn.disabled = false);
  }
});

// Se l'email cambia, la verifica precedente non vale più
email.addEventListener("input", () => { if (verifiedEmail && email.value !== verifiedEmail) { token = null; verifiedEmail = null; } });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!checkForm()) return;
  submitBtn.disabled = true;
  try {
    if (!token) {
      if (!/^\d{6}$/.test(code.value.trim())) { msg("Inserisci il codice di 6 cifre ricevuto via email.", "err"); submitBtn.disabled = false; code.focus(); return; }
      msg("Verifica del codice…");
      const v = await api("verify-otp", { email: email.value, code: code.value.trim() });
      token = v.token; verifiedEmail = email.value;
    }
    msg("Firma e invio della delega in corso…");
    const r = await api("submit", { token, fields: collect() });
    form.hidden = true;
    $("refId").textContent = r.id;
    $("done").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    if (err.message.includes("Verifica email scaduta")) { token = null; verifiedEmail = null; }
    msg(err.message, "err");
    submitBtn.disabled = false;
  }
});

code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 6); });
