import crypto from 'node:crypto';

const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 14;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function authorize(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { ok: true };
  const supplied = req.headers['x-app-password'];
  return safeEqual(supplied, expected)
    ? { ok: true }
    : { ok: false, status: 401, error: 'Incorrect app password.' };
}

export function rateLimit(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = forwarded || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.started > WINDOW_MS) {
    buckets.set(key, { started: now, count: 1 });
    return { ok: true };
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    return { ok: false, status: 429, error: 'Too many requests. Try again in a minute.' };
  }
  return { ok: true };
}

export function cleanString(value, max = 12000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
