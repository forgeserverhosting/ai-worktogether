import { fetchWithTimeout, jsonOrText, providerError } from '../lib/http.js';
import { textProviderDefinitions } from './catalog.js';
import { getOpenRouterCatalog, openRouterAllowPaid, openRouterFallbackProvider, openRouterVirtualProvider, selectOpenRouterModels } from './openrouter.js';

function normalizeContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || '').filter(Boolean).join('\n').trim();
  }
  return content ? JSON.stringify(content) : '';
}

function parseCustomProviders() {
  try {
    const raw = JSON.parse(process.env.CUSTOM_PROVIDERS_JSON || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item, index) => {
      if (!item || !item.baseUrl || !item.model || !item.apiKeyEnv) return [];
      return [{
        id: String(item.id || `custom-${index + 1}`).slice(0, 40),
        name: String(item.name || `Custom ${index + 1}`).slice(0, 80),
        env: String(item.apiKeyEnv),
        model: String(item.model),
        modelEnv: '',
        type: 'openai',
        baseUrl: String(item.baseUrl).replace(/\/$/, ''),
        strengths: Array.isArray(item.strengths) ? item.strengths.map(String) : ['general'],
        priority: Number(item.priority || 4),
        custom: true
      }];
    });
  } catch {
    return [];
  }
}

export function providerDefinitions() {
  return [...textProviderDefinitions, ...parseCustomProviders()];
}

export function configuredProviders() {
  return providerDefinitions().flatMap((definition) => {
    const key = process.env[definition.env];
    if (!key) return [];
    if (definition.id === 'cloudflare' && !process.env.CLOUDFLARE_ACCOUNT_ID) return [];
    const model = definition.modelEnv && process.env[definition.modelEnv]
      ? process.env[definition.modelEnv]
      : definition.model;
    return [{ ...definition, key, model }];
  });
}


export async function resolveProviders({ intent, requestedIds = [], desiredCount = 5 } = {}) {
  const configured = configuredProviders();
  const direct = configured.filter((provider) => provider.id !== 'openrouter');
  const requested = new Set(requestedIds.map(String));
  const selectedOpenRouterIds = [...requested].filter((id) => id.startsWith('or:'));
  const selectedDirectIds = [...requested].filter((id) => !id.startsWith('or:'));
  const resolved = [];

  if (process.env.OPENROUTER_API_KEY) {
    const catalog = await getOpenRouterCatalog();
    const selectedModels = selectOpenRouterModels(catalog.models || [], {
      intent,
      count: Math.max(desiredCount, selectedOpenRouterIds.length),
      selectedIds: selectedOpenRouterIds,
      allowPaid: openRouterAllowPaid()
    });
    resolved.push(...selectedModels.map(openRouterVirtualProvider));
    resolved.push(openRouterFallbackProvider());
  }

  if (requestedIds.length) {
    resolved.push(...direct.filter((provider) => selectedDirectIds.includes(provider.id)));
  } else {
    resolved.push(...direct);
  }

  const seen = new Set();
  return resolved.filter((provider) => {
    if (!provider?.id || seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}

async function callOpenAICompatible(provider, messages, options) {
  const headers = {
    Authorization: `Bearer ${provider.key}`,
    'Content-Type': 'application/json'
  };
  if (provider.id === 'openrouter' || provider.gateway === 'openrouter') {
    headers['HTTP-Referer'] = process.env.PUBLIC_SITE_URL || 'https://github.com';
    headers['X-Title'] = process.env.APP_NAME || 'OmniFusion AI';
  }

  const response = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(provider.name, response, data);
  const content = normalizeContent(data?.choices?.[0]?.message?.content);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: data.model || provider.model, citations: data.citations || [] };
}


async function callOpenAIResponses(provider, messages, options) {
  const response = await fetchWithTimeout(`${provider.baseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      input: messages,
      max_output_tokens: options.maxTokens,
      store: false
    })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(provider.name, response, data);
  const parts = Array.isArray(data?.output)
    ? data.output.flatMap((item) => Array.isArray(item?.content) ? item.content.map((part) => part?.text || '') : [])
    : [];
  const content = normalizeContent(data?.output_text || parts);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: data.model || provider.model, citations: [] };
}

async function callAnthropic(provider, messages, options) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const conversation = messages.filter((m) => m.role !== 'system');
  const response = await fetchWithTimeout(`${provider.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': provider.key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system,
      messages: conversation
    })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(provider.name, response, data);
  const content = normalizeContent(data?.content);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: data.model || provider.model, citations: [] };
}

async function callGemini(provider, messages, options) {
  const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const url = `${provider.baseUrl}/models/${encodeURIComponent(provider.model)}:generateContent`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': provider.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens
      }
    })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(provider.name, response, data);
  const content = normalizeContent(data?.candidates?.[0]?.content?.parts);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: provider.model, citations: [] };
}

async function callCloudflare(provider, messages, options) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const response = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${provider.model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: options.maxTokens, temperature: options.temperature })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok || data?.success === false) throw providerError(provider.name, response, data);
  const content = normalizeContent(data?.result?.response || data?.result?.choices?.[0]?.message?.content);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: provider.model, citations: [] };
}

async function callOllama(provider, messages, options) {
  const base = provider.key.replace(/\/$/, '').replace(/\/api$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  const response = await fetchWithTimeout(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: provider.model, messages, stream: false, options: { temperature: options.temperature } })
  }, options.timeoutMs);
  const data = await jsonOrText(response);
  if (!response.ok) throw providerError(provider.name, response, data);
  const content = normalizeContent(data?.message?.content || data?.response);
  if (!content) throw new Error(`${provider.name}: empty response.`);
  return { content, model: data.model || provider.model, citations: [] };
}

export async function callProvider(provider, messages, options = {}) {
  const started = Date.now();
  const normalized = {
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.35,
    maxTokens: Number.isFinite(options.maxTokens) ? options.maxTokens : 1400,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 55000
  };
  let result;
  if (provider.type === 'openai-responses') result = await callOpenAIResponses(provider, messages, normalized);
  else if (provider.type === 'anthropic') result = await callAnthropic(provider, messages, normalized);
  else if (provider.type === 'gemini') result = await callGemini(provider, messages, normalized);
  else if (provider.type === 'cloudflare') result = await callCloudflare(provider, messages, normalized);
  else if (provider.type === 'ollama') result = await callOllama(provider, messages, normalized);
  else result = await callOpenAICompatible(provider, messages, normalized);
  return { ...result, providerId: provider.id, providerName: provider.name, latencyMs: Date.now() - started };
}

export async function callWithFallback(providers, messages, options = {}) {
  const errors = [];
  for (const provider of providers) {
    try {
      return await callProvider(provider, messages, options);
    } catch (error) {
      errors.push({ provider: provider.name, message: error?.message || 'Unknown provider error' });
    }
  }
  const summary = errors.map((item) => `${item.provider}: ${item.message}`).join(' | ');
  throw new Error(`No provider completed the request. ${summary}`);
}
