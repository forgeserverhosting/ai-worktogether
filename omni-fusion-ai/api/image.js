import { sendJson, readJsonBody, fetchWithTimeout, jsonOrText, providerError } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString } from '../server/lib/security.js';
import { getOpenRouterCatalog } from '../server/providers/openrouter.js';

export const config = { maxDuration: 180 };

async function openRouterImage(prompt, requestedModel) {
  const catalog = await getOpenRouterCatalog();
  const model = requestedModel || process.env.OPENROUTER_IMAGE_MODEL || catalog.imageModels?.[0]?.id;
  if (!model) throw new Error('OpenRouter has no image model available for this account.');
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://github.com',
      'X-Title': process.env.APP_NAME || 'OmniFusion AI'
    },
    body: JSON.stringify({ model, prompt, size: '1024x1024', output_format: 'png', n: 1 })
  }, 150000);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError('OpenRouter Images', response, data);
  const item = data?.data?.[0];
  if (item?.b64_json) {
    const mediaType = item.media_type || 'image/png';
    return { dataUrl: `data:${mediaType};base64,${item.b64_json}`, provider: `OpenRouter · ${model}`, model, usage: data.usage || null };
  }
  if (item?.url) return { url: item.url, provider: `OpenRouter · ${model}`, model, usage: data.usage || null };
  throw new Error('OpenRouter Images returned no image.');
}

async function openAIImage(prompt) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024', n: 1 })
  }, 110000);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError('OpenAI Images', response, data);
  const item = data?.data?.[0];
  if (item?.url) return { url: item.url, provider: 'OpenAI Images' };
  if (item?.b64_json) return { dataUrl: `data:image/png;base64,${item.b64_json}`, provider: 'OpenAI Images' };
  throw new Error('OpenAI Images returned no image.');
}

async function replicateImage(prompt) {
  const response = await fetchWithTimeout('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ version: process.env.REPLICATE_IMAGE_VERSION, input: { prompt } })
  }, 70000);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError('Replicate', response, data);
  let prediction = data;
  for (let attempt = 0; attempt < 8 && ['starting', 'processing'].includes(prediction?.status) && prediction?.urls?.get; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const poll = await fetchWithTimeout(prediction.urls.get, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
    }, 20000);
    prediction = await jsonOrText(poll);
    if (!poll.ok) throw providerError('Replicate', poll, prediction);
  }
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof output === 'string') return { url: output, provider: 'Replicate' };
  if (prediction?.status === 'failed') throw new Error(`Replicate: ${prediction.error || 'generation failed.'}`);
  if (prediction?.urls?.web) return { pending: true, dashboardUrl: prediction.urls.web, provider: 'Replicate' };
  throw new Error('Replicate returned no image output.');
}

async function webhookImage(prompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MEDIA_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.MEDIA_WEBHOOK_TOKEN}`;
  const response = await fetchWithTimeout(process.env.MEDIA_WEBHOOK_URL, {
    method: 'POST', headers, body: JSON.stringify({ type: 'image', prompt })
  }, 90000);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError('Media webhook', response, data);
  const url = data.url || data.output || data.imageUrl;
  if (!url) throw new Error('Media webhook returned no image URL.');
  return { url, provider: data.provider || 'Media webhook' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const access = authorize(req); if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const limiter = rateLimit(req); if (!limiter.ok) return sendJson(res, limiter.status, { error: limiter.error });
  const body = await readJsonBody(req);
  const prompt = cleanString(body.prompt, 4000);
  const requestedModel = cleanString(body.model, 180);
  if (!prompt) return sendJson(res, 400, { error: 'Enter an image prompt.' });

  const attempts = [];
  if (process.env.OPENROUTER_API_KEY) attempts.push(() => openRouterImage(prompt, requestedModel));
  if (process.env.OPENAI_API_KEY) attempts.push(() => openAIImage(prompt));
  if (process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_IMAGE_VERSION) attempts.push(() => replicateImage(prompt));
  if (process.env.MEDIA_WEBHOOK_URL) attempts.push(() => webhookImage(prompt));
  if (!attempts.length) return sendJson(res, 503, { error: 'No image provider is configured.' });

  const errors = [];
  for (const attempt of attempts) {
    try { return sendJson(res, 200, await attempt()); }
    catch (error) { errors.push(error.message); }
  }
  return sendJson(res, 500, { error: errors.join(' | ') });
}
