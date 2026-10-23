import crypto from "node:crypto";
import nodemailer from "nodemailer";

export const OTP_TTL_MS = 10 * 60 * 1000;      // validità codice: 10 minuti
export const RESEND_COOLDOWN_MS = 60 * 1000;   // attesa tra due invii
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;                 // tentativi errati per codice
export const VERIFIED_TTL_MS = 30 * 60 * 1000; // tempo per inviare il modulo dopo la verifica

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const readJson = async (req) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const isEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function secret() {
  const s = process.env.OTP_SECRET;
  if (!s || s.length < 32) throw new Error("OTP_SECRET mancante o più corto di 32 caratteri");
  return s;
}

export const hmac = (data) => crypto.createHmac("sha256", secret()).update(data).digest("hex");

// Chiave del blob derivata dall'email, così l'indirizzo non compare in chiaro nelle chiavi
export const keyFor = (email) => hmac(`key:${email}`);

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// Token firmato che attesta "questa email è stata verificata"
export function signToken(email) {
  const payload = Buffer.from(
    JSON.stringify({ e: email, v: Date.now(), x: Date.now() + VERIFIED_TTL_MS, n: crypto.randomUUID() })
  ).toString("base64url");
  return `${payload}.${hmac(`tok:${payload}`)}`;
}

export function readToken(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(`tok:${payload}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.x > Date.now() ? data : null;
  } catch {
    return null;
  }
}

let transporter;
export function mailer() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export const mailFrom = () => process.env.MAIL_FROM || process.env.SMTP_USER;

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
