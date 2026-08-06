import { readJsonBody, fetchWithTimeout, jsonOrText, providerError, sendJson } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString } from '../server/lib/security.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const access = authorize(req); if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const limiter = rateLimit(req); if (!limiter.ok) return sendJson(res, limiter.status, { error: limiter.error });
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    return sendJson(res, 503, { error: 'ElevenLabs is not configured.' });
  }
  const body = await readJsonBody(req);
  const text = cleanString(body.text, 4800);
  if (!text) return sendJson(res, 400, { error: 'No text to speak.' });

  const voice = encodeURIComponent(process.env.ELEVENLABS_VOICE_ID);
  const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' })
  }, 48000);

  if (!response.ok) {
    const data = await jsonOrText(response);
    return sendJson(res, response.status, { error: providerError('ElevenLabs', response, data).message });
  }
  const audio = Buffer.from(await response.arrayBuffer());
  res.status(200);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.end(audio);
}
