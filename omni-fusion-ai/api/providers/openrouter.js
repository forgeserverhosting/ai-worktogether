import { fetchWithTimeout, jsonOrText, providerError } from '../lib/http.js';

const CATALOG_TTL_MS = 15 * 60 * 1000;
const MAX_CATALOG_PAGES = 4;
const MAX_MODELS_PER_PAGE = 500;

let catalogCache = {
  expiresAt: 0,
  models: [],
  imageModels: [],
  videoModels: [],
  error: null
};

function siteHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://github.com',
    'X-Title': process.env.APP_NAME || 'OmniFusion AI'
  };
}

function numericPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isZero(value) {
  const parsed = numericPrice(value);
  return parsed !== null && parsed === 0;
}

function titleCase(value) {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferStrengths(model) {
  const text = `${model.id} ${model.name} ${model.description || ''}`.toLowerCase();
  const strengths = new Set(['general']);
  if (/code|coder|codex|devstral|program|software|agent/.test(text)) strengths.add('code');
  if (/reason|thinking|r1|o1|o3|o4|math|logic|analysis/.test(text)) strengths.add('reasoning');
  if (/search|sonar|research|online|web/.test(text)) strengths.add('research');
  if (/creative|story|roleplay|writer|vision|multimodal|gemini|claude|gpt/.test(text)) strengths.add('creative');
  if (/translate|language|writer|summary|instruct/.test(text)) strengths.add('writing');
  if ((model.inputModalities || []).includes('image')) strengths.add('multimodal');
  if ((model.supportedParameters || []).includes('tools')) strengths.add('tools');
  return [...strengths];
}

function normalizeTextModel(item) {
  const id = String(item?.id || item?.canonical_slug || '').trim();
  if (!id) return null;
  const architecture = item?.architecture || {};
  const inputModalities = Array.isArray(architecture.input_modalities) ? architecture.input_modalities.map(String) : [];
  const outputModalities = Array.isArray(architecture.output_modalities) ? architecture.output_modalities.map(String) : [];
  const pricing = item?.pricing || {};
  const free = isZero(pricing.prompt) && isZero(pricing.completion);
  const author = id.includes('/') ? id.split('/')[0] : 'openrouter';
  const model = {
    id,
    name: String(item?.name || id),
    author,
    authorName: titleCase(author),
    description: String(item?.description || '').slice(0, 280),
    contextLength: Number(item?.context_length || item?.top_provider?.context_length || 0),
    inputModalities,
    outputModalities,
    supportedParameters: Array.isArray(item?.supported_parameters) ? item.supported_parameters.map(String) : [],
    promptPrice: numericPrice(pricing.prompt),
    completionPrice: numericPrice(pricing.completion),
    free,
    expired: Boolean(item?.expiration_date && Date.parse(item.expiration_date) <= Date.now())
  };
  model.canChat = !model.expired && (outputModalities.length === 0 || outputModalities.includes('text'));
  model.strengths = inferStrengths(model);
  return model;
}

function normalizeImageModel(item) {
  const id = String(item?.id || item?.canonical_slug || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(item?.name || id),
    author: id.includes('/') ? id.split('/')[0] : 'openrouter',
    description: String(item?.description || '').slice(0, 220),
    supportedParameters: item?.supported_parameters || {},
    supportsStreaming: Boolean(item?.supports_streaming)
  };
}

function normalizeVideoModel(item) {
  const id = String(item?.id || item?.canonical_slug || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(item?.name || id),
    author: id.includes('/') ? id.split('/')[0] : 'openrouter',
    description: String(item?.description || '').slice(0, 220),
    generateAudio: Boolean(item?.generate_audio),
    aspectRatios: Array.isArray(item?.supported_aspect_ratios) ? item.supported_aspect_ratios : [],
    durations: Array.isArray(item?.supported_durations) ? item.supported_durations : [],
    resolutions: Array.isArray(item?.supported_resolutions) ? item.supported_resolutions : [],
    price: numericPrice(item?.pricing_skus?.generate)
  };
}

async function fetchCatalogPages() {
  const models = [];
  let url = `https://openrouter.ai/api/v1/models?limit=${MAX_MODELS_PER_PAGE}`;
  for (let page = 0; page < MAX_CATALOG_PAGES && url; page += 1) {
    const response = await fetchWithTimeout(url, { headers: siteHeaders() }, 25000);
    const data = await jsonOrText(response);
    if (!response.ok) throw providerError('OpenRouter model catalog', response, data);
    if (Array.isArray(data?.data)) models.push(...data.data);
    const next = data?.links?.next;
    url = next ? new URL(next, 'https://openrouter.ai').toString() : '';
  }
  return models.map(normalizeTextModel).filter(Boolean);
}

async function fetchSpecialCatalog(path, normalizer) {
  const response = await fetchWithTimeout(`https://openrouter.ai/api/v1/${path}`, { headers: siteHeaders() }, 25000);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(`OpenRouter ${path} catalog`, response, data);
  return Array.isArray(data?.data) ? data.data.map(normalizer).filter(Boolean) : [];
}

export function openRouterAllowPaid() {
  return String(process.env.OPENROUTER_ALLOW_PAID || '').toLowerCase() === 'true';
}

export async function getOpenRouterCatalog({ force = false } = {}) {
  if (!process.env.OPENROUTER_API_KEY) {
    return { models: [], imageModels: [], videoModels: [], error: null, cached: false };
  }
  if (!force && catalogCache.expiresAt > Date.now() && catalogCache.models.length) {
    return { ...catalogCache, cached: true };
  }

  try {
    const [models, imageModels, videoModels] = await Promise.all([
      fetchCatalogPages(),
      fetchSpecialCatalog('images/models', normalizeImageModel).catch(() => []),
      fetchSpecialCatalog('videos/models', normalizeVideoModel).catch(() => [])
    ]);
    catalogCache = {
      expiresAt: Date.now() + CATALOG_TTL_MS,
      models,
      imageModels,
      videoModels,
      error: null
    };
  } catch (error) {
    catalogCache = {
      expiresAt: Date.now() + 60_000,
      models: [],
      imageModels: [],
      videoModels: [],
      error: error?.message || 'Could not load the OpenRouter model catalog.'
    };
  }
  return { ...catalogCache, cached: false };
}

function modelScore(model, intent, allowPaid) {
  let score = 0;
  if (model.free) score += allowPaid ? 8 : 80;
  if (model.strengths.includes(intent?.primary || 'general')) score += 44;
  if (model.strengths.includes('reasoning')) score += intent?.primary === 'reasoning' ? 28 : 4;
  if (model.strengths.includes('code')) score += intent?.primary === 'code' ? 30 : 2;
  if (model.strengths.includes('research')) score += intent?.primary === 'research' ? 32 : 0;
  if (model.strengths.includes('creative')) score += intent?.primary === 'creative' ? 24 : 1;
  if (model.contextLength >= 100000) score += 9;
  if (model.contextLength >= 200000) score += 5;
  if (model.supportedParameters.includes('tools')) score += 5;
  if (model.inputModalities.includes('image')) score += 2;
  const text = `${model.id} ${model.name}`.toLowerCase();
  if (/mini|flash|small|fast|lite|nano/.test(text)) score += 5;
  if (/deprecated|legacy|preview-old/.test(text)) score -= 40;
  return score;
}

function uniqueById(models) {
  const seen = new Set();
  return models.filter((model) => {
    if (!model || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export function selectOpenRouterModels(models, { intent, count = 5, selectedIds = [], allowPaid = openRouterAllowPaid() } = {}) {
  const chatModels = models.filter((model) => model.canChat && (allowPaid || model.free));
  const selectedSlugs = selectedIds
    .map((id) => String(id || '').replace(/^or:/, ''))
    .filter(Boolean);

  if (selectedSlugs.length) {
    const byId = new Map(models.filter((model) => model.canChat).map((model) => [model.id, model]));
    return uniqueById(selectedSlugs.map((id) => byId.get(id)).filter((model) => model && (allowPaid || model.free))).slice(0, 12);
  }

  const ranked = [...chatModels].sort((a, b) => modelScore(b, intent, allowPaid) - modelScore(a, intent, allowPaid));
  const chosen = [];
  const authors = new Set();
  for (const model of ranked) {
    if (chosen.length >= count) break;
    if (authors.has(model.author)) continue;
    chosen.push(model);
    authors.add(model.author);
  }
  for (const model of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.some((item) => item.id === model.id)) chosen.push(model);
  }
  return chosen;
}

export function openRouterVirtualProvider(model) {
  return {
    id: `or:${model.id}`,
    name: model.name,
    env: 'OPENROUTER_API_KEY',
    key: process.env.OPENROUTER_API_KEY,
    model: model.id,
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    strengths: model.strengths || ['general'],
    priority: model.free ? 11 : 9,
    gateway: 'openrouter',
    author: model.author,
    free: model.free,
    contextLength: model.contextLength || 0
  };
}

export function openRouterFallbackProvider() {
  return {
    id: 'openrouter',
    name: 'OpenRouter Fallback Router',
    env: 'OPENROUTER_API_KEY',
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    strengths: ['general', 'creative', 'reasoning', 'code', 'research'],
    priority: 4,
    gateway: 'openrouter',
    free: true
  };
}
