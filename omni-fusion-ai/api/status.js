import { sendJson } from './lib/http.js';
import { providerDefinitions, configuredProviders } from './providers/runtime.js';
import { integrationCatalog } from './providers/catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Use GET.' });
  const configured = configuredProviders();
  const configuredIds = new Set(configured.map((item) => item.id));
  const models = Object.fromEntries(configured.map((item) => [item.id, item.model]));
  const definitions = providerDefinitions();

  return sendJson(res, 200, {
    appName: process.env.APP_NAME || 'OmniFusion AI',
    passwordRequired: Boolean(process.env.APP_PASSWORD),
    textProviders: definitions.map((item) => ({
      id: item.id,
      name: item.name,
      configured: configuredIds.has(item.id),
      model: configuredIds.has(item.id) ? models[item.id] : null,
      strengths: item.strengths || []
    })),
    media: {
      image: Boolean(process.env.OPENAI_API_KEY || (process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_IMAGE_VERSION) || process.env.MEDIA_WEBHOOK_URL),
      speech: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
      webhook: Boolean(process.env.MEDIA_WEBHOOK_URL)
    },
    integrations: integrationCatalog
  });
}
