import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import {
  json, readJson, normEmail, isEmail, hmac, keyFor, mailer, mailFrom,
  OTP_TTL_MS, RESEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, withErrors,
} from "../lib/common.mjs";

export default withErrors(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Metodo non consentito." });
  const body = await readJson(req);
  const email = normEmail(body?.email);
  if (!isEmail(email)) return json(400, { error: "Indirizzo email non valido." });

  const store = getStore({ name: "otp", consistency: "strong" });
  const key = keyFor(email);
  const prev = await store.get(key, { type: "json" });
  const now = Date.now();

  if (prev && now - prev.sentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - prev.sentAt)) / 1000);
    return json(429, { error: `Attendi ${wait} secondi prima di richiedere un nuovo codice.`, wait });
  }
  const sameWindow = prev && now - prev.windowStart < 3600_000;
  const sends = sameWindow ? prev.sends + 1 : 1;
  if (sends > MAX_SENDS_PER_HOUR) {
    return json(429, { error: "Hai richiesto troppi codici. Riprova tra un'ora." });
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await store.setJSON(key, {
    hash: hmac(`otp:${email}:${code}`),
    exp: now + OTP_TTL_MS,
    attempts: 0,
    sentAt: now,
    windowStart: sameWindow ? prev.windowStart : now,
    sends,
  });

  const minutes = OTP_TTL_MS / 60000;
  try {
    await mailer().sendMail({
      from: mailFrom(),
      to: email,
      subject: `Il tuo codice di verifica: ${code}`,
      text: `Il tuo codice di verifica è ${code}.\nÈ valido per ${minutes} minuti.\n\nSe non hai richiesto tu questo codice, ignora questa email.`,
      html: `<p>Il tuo codice di verifica è:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;font-family:monospace">${code}</p>
<p>È valido per ${minutes} minuti.</p>
<p style="color:#666">Se non hai richiesto tu questo codice, ignora questa email.</p>`,
    });
  } catch (err) {
    console.error("Invio email fallito:", err);
    await store.delete(key);
    const m = `${err?.code || ""} ${err?.responseCode || ""} ${err?.message || ""}`;
    let why = "Riprova più tardi.";
    if (/EAUTH|535|534|Invalid login|Username and Password/i.test(m)) why = "Credenziali SMTP rifiutate (controlla SMTP_USER e SMTP_PASS: per Gmail serve la password per le app).";
    else if (/ETIMEDOUT|ECONNECTION|ESOCKET|ENOTFOUND|ECONNREFUSED|timeout/i.test(m)) why = "Server SMTP non raggiungibile (controlla SMTP_HOST e SMTP_PORT).";
    else if (/EENVELOPE|553|550|sender/i.test(m)) why = "Mittente rifiutato (MAIL_FROM deve coincidere con l'account SMTP).";
    return json(502, { error: `Impossibile inviare l'email. ${why}` });
  }

  return json(200, { ok: true, ttl: OTP_TTL_MS / 1000, cooldown: RESEND_COOLDOWN_MS / 1000 });
});

export const config = { path: "/api/send-otp" };
