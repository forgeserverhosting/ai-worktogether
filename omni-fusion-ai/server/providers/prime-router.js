import { inferIntent } from '../lib/routing.js';
import { configuredProviders } from './runtime.js';
import {
  getOpenRouterCatalog,
  openRouterAllowPaid,
  openRouterFallbackProvider,
  openRouterVirtualProvider,
  selectOpenRouterModels
} from './openrouter.js';

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function directOpenRouterProvider(modelId) {
  const id = String(modelId || '').replace(/^or:/, '').trim();
  if (!id || !process.env.OPENROUTER_API_KEY) return null;
  return {
    id: `or:${id}`,
    name: id === 'openrouter/free' ? 'OpenRouter Free Router' : id,
    key: process.env.OPENROUTER_API_KEY,
    model: id,
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    gateway: 'openrouter',
    free: id.endsWith(':free') || id === 'openrouter/free',
    strengths: ['general', 'creative', 'reasoning', 'code', 'research', 'writing'],
    supportedParameters: []
  };
}

function dedupe(providers) {
  const seen = new Set();
  return providers.filter((provider) => {
    if (!provider) return false;
    const key = `${provider.id}:${provider.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolvePrimeProviders({
  modelIds = [],
  taskRole = 'general',
  prompt = '',
  desiredCount = 4,
  excludeIds = [],
  performanceHints = {}
} = {}) {
  const requested = unique(modelIds.map((id) => String(id || '').trim())).slice(0, 12);
  const directProviders = configuredProviders().filter((provider) => provider.id !== 'openrouter');
  const allowPaid = openRouterAllowPaid();
  const resolved = [];

  if (process.env.OPENROUTER_API_KEY) {
    const catalog = await getOpenRouterCatalog();
    const candidateModels = taskRole === 'vision'
      ? (catalog.models || []).filter((model) => model.inputModalities?.includes('image'))
      : (catalog.models || []);
    const selected = selectOpenRouterModels(candidateModels, {
      intent: inferIntent(prompt),
      taskRole,
      count: Math.max(2, desiredCount),
      selectedIds: requested,
      allowPaid,
      excludeIds,
      performanceHints
    });
    resolved.push(...selected.map(openRouterVirtualProvider));

    // Catalog fetches can fail temporarily. Preserve exact manual selections even then.
    if (requested.length && !selected.length) {
      resolved.push(...requested.map(directOpenRouterProvider).filter(Boolean));
    }
  }

  const selectedDirect = requested.filter((id) => !String(id).startsWith('or:'));
  if (selectedDirect.length) resolved.push(...directProviders.filter((provider) => selectedDirect.includes(provider.id)));
  else resolved.push(...directProviders);

  if (process.env.OPENROUTER_API_KEY) resolved.push(openRouterFallbackProvider());
  return dedupe(resolved);
}

export function providersForPrimeStep(roster, slot = 0) {
  if (!roster.length) return [];
  const primaryIndex = Math.abs(Number(slot) || 0) % Math.max(1, roster.length - (roster.at(-1)?.id === 'openrouter' ? 1 : 0));
  const primary = roster[primaryIndex] || roster[0];
  const fallback = roster.find((provider) => provider.id === 'openrouter' && provider !== primary);
  const alternate = roster.find((provider, index) => index !== primaryIndex && provider !== fallback);
  return dedupe([primary, alternate, fallback]).slice(0, 3);
}
