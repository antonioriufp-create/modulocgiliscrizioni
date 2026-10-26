import { getStore } from "@netlify/blobs";
import { json, readJson, normEmail, isEmail, hmac, keyFor, safeEqual, signToken, MAX_ATTEMPTS, withErrors } from "../lib/common.mjs";

export default withErrors(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Metodo non consentito." });
  const body = await readJson(req);
  const email = normEmail(body?.email);
  const code = String(body?.code || "").trim();
  if (!isEmail(email) || !/^\d{6}$/.test(code)) return json(400, { error: "Dati non validi." });

  const store = getStore({ name: "otp", consistency: "strong" });
  const key = keyFor(email);
  const rec = await store.get(key, { type: "json" });

  if (!rec?.hash) return json(400, { error: "Nessun codice attivo per questa email. Richiedine uno nuovo." });
  if (Date.now() > rec.exp) return json(400, { error: "Il codice è scaduto. Richiedine uno nuovo." });
  if (rec.attempts >= MAX_ATTEMPTS) {
    return json(429, { error: "Troppi tentativi errati. Richiedi un nuovo codice." });
  }

  if (!safeEqual(rec.hash, hmac(`otp:${email}:${code}`))) {
    rec.attempts += 1;
    await store.setJSON(key, rec);
    const left = MAX_ATTEMPTS - rec.attempts;
    return json(400, {
      error: left > 0 ? `Codice errato. Tentativi rimasti: ${left}.` : "Troppi tentativi errati. Richiedi un nuovo codice.",
    });
  }

  // Codice corretto: lo invalido (resta solo l'informazione per il limite di invii)
  await store.setJSON(key, { ...rec, hash: null });
  return json(200, { ok: true, token: signToken(email) });
});

export const config = { path: "/api/verify-otp" };
