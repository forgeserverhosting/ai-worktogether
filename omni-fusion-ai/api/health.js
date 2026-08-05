import { sendJson } from './lib/http.js';
export default async function handler(req, res) {
  return sendJson(res, 200, { ok: true, app: process.env.APP_NAME || 'OmniFusion AI', time: new Date().toISOString() });
}
