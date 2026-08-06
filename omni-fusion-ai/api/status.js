import { sendJson } from '../server/lib/http.js';
import { providerDefinitions, configuredProviders } from '../server/providers/runtime.js';
import { getOpenRouterCatalog, openRouterAllowPaid, primeFreeRecommendations, scoreOpenRouterModel } from '../server/providers/openrouter.js';
import { integrationCatalog } from '../server/providers/catalog.js';

function compactModel(model, allowPaid) {
  return {
    id: model.id,
    name: model.name,
    author: model.author,
    authorName: model.authorName,
    contextLength: model.contextLength,
    free: model.free,
    usable: model.free || allowPaid,
    strengths: model.strengths,
    inputModalities: model.inputModalities,
    supportedParameters: model.supportedParameters,
    primeScore: Math.round(scoreOpenRouterModel(model, { taskRole: 'lead', allowPaid: false }))
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Use GET.' });
  const configured = configuredProviders();
  const configuredIds = new Set(configured.map((item) => item.id));
  const models = Object.fromEntries(configured.map((item) => [item.id, item.model]));
  const definitions = providerDefinitions();
  const allowPaid = openRouterAllowPaid();

  let openRouter = {
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    allowPaid,
    modelCount: 0,
    usableModelCount: 0,
    freeModelCount: 0,
    imageModelCount: 0,
    videoModelCount: 0,
    models: [],
    imageModels: [],
    videoModels: [],
    families: [],
    primeFree: { recommendations: {}, strategy: 'capability-role-performance' },
    error: null
  };

  if (process.env.OPENROUTER_API_KEY) {
    const catalog = await getOpenRouterCatalog();
    const chatModels = (catalog.models || []).filter((model) => model.canChat);
    const compact = chatModels.map((model) => compactModel(model, allowPaid));
    openRouter = {
      ...openRouter,
      modelCount: compact.length,
      usableModelCount: compact.filter((model) => model.usable).length,
      freeModelCount: compact.filter((model) => model.free).length,
      imageModelCount: (catalog.imageModels || []).length,
      videoModelCount: (catalog.videoModels || []).length,
      models: compact.sort((a, b) => Number(b.free) - Number(a.free) || (b.primeScore || 0) - (a.primeScore || 0) || a.author.localeCompare(b.author) || a.name.localeCompare(b.name)),
      imageModels: (catalog.imageModels || []).map((model) => ({ id: model.id, name: model.name, author: model.author })),
      videoModels: (catalog.videoModels || []).map((model) => ({ id: model.id, name: model.name, author: model.author, price: model.price })),
      families: [...new Set([
        ...compact.map((model) => model.author),
        ...(catalog.imageModels || []).map((model) => model.author),
        ...(catalog.videoModels || []).map((model) => model.author)
      ])].sort(),
      primeFree: {
        recommendations: primeFreeRecommendations(catalog.models || [], { perRole: 5 }),
        strategy: 'capability-role-performance-ranked',
        paidModelsAllowed: allowPaid
      },
      error: catalog.error || null
    };
  }

  return sendJson(res, 200, {
    appName: process.env.APP_NAME || 'OmniFusion Motion Studio V17',
    passwordRequired: Boolean(process.env.APP_PASSWORD),
    textProviders: definitions.map((item) => ({
      id: item.id,
      name: item.name,
      configured: configuredIds.has(item.id),
      model: configuredIds.has(item.id) ? models[item.id] : null,
      strengths: item.strengths || []
    })),
    openRouter,
    media: {
      image: Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || (process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_IMAGE_VERSION) || process.env.MEDIA_WEBHOOK_URL),
      speech: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
      video: Boolean(process.env.OPENROUTER_API_KEY),
      webhook: Boolean(process.env.MEDIA_WEBHOOK_URL)
    },
    integrations: integrationCatalog
  });
  } catch (error) {
    return sendJson(res, 500, { error: error?.message || 'Could not load provider status.' });
  }
}
