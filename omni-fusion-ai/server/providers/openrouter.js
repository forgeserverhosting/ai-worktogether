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
    created: Number(item?.created || 0),
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

const COMPLEX_ROLES = new Set(['lead', 'builder', 'reviewer', 'creative', 'vision']);

function parameterScale(text = '') {
  const values = [...String(text).toLowerCase().matchAll(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*b(?:[^a-z]|$)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function roleIntent(taskRole = 'general', intent = {}) {
  if (taskRole === 'builder') return 'code';
  if (taskRole === 'reviewer' || taskRole === 'lead') return 'reasoning';
  if (taskRole === 'creative') return 'creative';
  if (taskRole === 'vision') return 'multimodal';
  return intent?.primary || 'general';
}

export function scoreOpenRouterModel(model, { intent = { primary: 'general' }, taskRole = 'general', allowPaid = openRouterAllowPaid(), performanceHints = {} } = {}) {
  if (!model?.canChat || (!allowPaid && !model.free)) return Number.NEGATIVE_INFINITY;
  const target = roleIntent(taskRole, intent);
  const text = `${model.id} ${model.name} ${model.description || ''}`.toLowerCase();
  const params = new Set(model.supportedParameters || []);
  const modalities = new Set(model.inputModalities || []);
  const size = parameterScale(text);
  let score = model.free ? 120 : 0;

  if (model.strengths?.includes(target)) score += 44;
  if (target === 'multimodal' && modalities.has('image')) score += 72;
  if (target !== 'multimodal' && modalities.has('text')) score += 4;
  if (model.strengths?.includes('reasoning')) score += ['lead', 'reviewer'].includes(taskRole) ? 30 : 8;
  if (model.strengths?.includes('code')) score += taskRole === 'builder' ? 38 : 5;
  if (model.strengths?.includes('creative')) score += taskRole === 'creative' ? 28 : 3;
  if (model.strengths?.includes('writing')) score += taskRole === 'creative' ? 15 : 2;
  if (modalities.has('image')) score += taskRole === 'vision' ? 34 : 1;

  if (params.has('structured_outputs')) score += ['builder', 'reviewer', 'lead'].includes(taskRole) ? 18 : 5;
  if (params.has('response_format')) score += ['builder', 'reviewer'].includes(taskRole) ? 10 : 3;
  if (params.has('reasoning')) score += ['lead', 'reviewer'].includes(taskRole) ? 16 : 4;
  if (params.has('tools')) score += taskRole === 'lead' ? 10 : 4;
  if (params.has('temperature')) score += 2;
  if (params.has('max_tokens')) score += 3;

  if (model.contextLength >= 64000) score += 7;
  if (model.contextLength >= 128000) score += 8;
  if (model.contextLength >= 256000) score += 5;
  if (model.contextLength >= 1000000) score += 4;

  if (size >= 100) score += 20;
  else if (size >= 70) score += 16;
  else if (size >= 30) score += 10;
  else if (size >= 14) score += 5;
  else if (size && size <= 9 && COMPLEX_ROLES.has(taskRole)) score -= 14;

  if (/ultra|frontier|max\b|large\b|pro\b|super\b|reasoner|deepseek-r1|gpt-oss-120b/.test(text)) score += COMPLEX_ROLES.has(taskRole) ? 14 : 4;
  if (/coder|code|devstral|software|programming/.test(text)) score += taskRole === 'builder' ? 22 : 2;
  if (/vision|vl\b|multimodal/.test(text)) score += taskRole === 'vision' ? 20 : 0;
  if (/flash|fast|turbo|mini|nano|lite|small/.test(text)) score += taskRole === 'quick' ? 18 : -5;
  if (/alpha|experimental|cloaked|trial use|under development/.test(text)) score -= ['lead', 'reviewer'].includes(taskRole) ? 10 : 4;
  if (/deprecated|legacy|preview-old/.test(text)) score -= 60;

  const hint = performanceHints?.[model.id] || performanceHints?.[`or:${model.id}`] || {};
  const roleHint = hint?.roles?.[taskRole] || hint?.[taskRole] || hint;
  const samples = Math.max(0, Number(roleHint?.samples || roleHint?.runs || 0));
  if (samples > 0) {
    const successRate = Math.max(0, Math.min(1, Number(roleHint?.successRate ?? ((Number(roleHint?.successes || 0)) / Math.max(1, Number(roleHint?.successes || 0) + Number(roleHint?.failures || 0))))));
    const artifactRate = Math.max(0, Math.min(1, Number(roleHint?.artifactRate || roleHint?.validArtifactRate || 0)));
    const contractRate = Math.max(0, Math.min(1, Number(roleHint?.contractRate || roleHint?.contractSuccessRate || 0)));
    const quality = Math.max(0, Math.min(100, Number(roleHint?.quality || roleHint?.averageQuality || 0)));
    const latency = Math.max(0, Number(roleHint?.averageLatencyMs || roleHint?.latencyMs || 0));
    const confidence = Math.min(1, samples / 8);
    score += confidence * ((successRate - 0.5) * 48 + artifactRate * 26 + contractRate * 18 + (quality - 50) * 0.32 - Math.min(18, latency / 12000));
  }

  const ageDays = model.created ? Math.max(0, (Date.now() / 1000 - model.created) / 86400) : null;
  if (ageDays !== null && ageDays < 365) score += 3;
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

export function rankOpenRouterModels(models, options = {}) {
  return models
    .filter((model) => model?.canChat && ((options.allowPaid ?? openRouterAllowPaid()) || model.free))
    .map((model) => ({ model, score: scoreOpenRouterModel(model, options) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || b.model.contextLength - a.model.contextLength || a.model.id.localeCompare(b.model.id));
}

export function selectOpenRouterModels(models, { intent, taskRole = 'general', count = 5, selectedIds = [], allowPaid = openRouterAllowPaid(), excludeIds = [], performanceHints = {} } = {}) {
  const excluded = new Set((excludeIds || []).map((id) => String(id || '').replace(/^or:/, '')));
  const selectedSlugs = selectedIds
    .map((id) => String(id || '').replace(/^or:/, ''))
    .filter(Boolean);

  if (selectedSlugs.length) {
    const byId = new Map(models.filter((model) => model.canChat).map((model) => [model.id, model]));
    return uniqueById(selectedSlugs.map((id) => byId.get(id)).filter((model) => model && !excluded.has(model.id) && (allowPaid || model.free))).slice(0, 12);
  }

  const ranked = rankOpenRouterModels(models, { intent, taskRole, allowPaid, performanceHints })
    .map((item) => item.model)
    .filter((model) => !excluded.has(model.id));
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

export function primeFreeRecommendations(models, { perRole = 4 } = {}) {
  const roles = ['lead', 'builder', 'reviewer', 'vision', 'creative', 'quick'];
  return Object.fromEntries(roles.map((taskRole) => [taskRole, rankOpenRouterModels(models, {
    intent: { primary: roleIntent(taskRole, { primary: 'general' }) },
    taskRole,
    allowPaid: false
  }).slice(0, perRole).map(({ model, score }) => ({
    id: model.id,
    name: model.name,
    author: model.author,
    score: Math.round(score),
    contextLength: model.contextLength,
    inputModalities: model.inputModalities,
    supportedParameters: model.supportedParameters
  }))]));
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
    contextLength: model.contextLength || 0,
    supportedParameters: model.supportedParameters || []
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
