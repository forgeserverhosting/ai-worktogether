# OmniFusion AI 3.0 — One-Key Network

A polished multi-model AI orchestration website for **GitHub + Vercel**.

The main setup now requires only **one OpenRouter API key**. The server securely downloads OpenRouter's current model catalog, exposes the supported models inside the AI picker, selects a diverse team automatically, and runs the models as independent specialists before a final judge assembles the answer.

## What changed in 3.0

- One OpenRouter key loads the live OpenRouter model catalog
- GPT, Claude, Gemini, Llama, DeepSeek, Qwen, Mistral and other supported model families appear automatically
- Searchable AI/model picker
- Free-model filter enabled by default
- Automatic selection favors different model families instead of repeatedly using one model
- Up to 12 models can be selected manually
- Paid models can be enabled with one setting; no extra provider keys are needed
- Automatic fallback to `openrouter/free` if catalog discovery is temporarily unavailable
- OpenRouter image-model discovery and image generation use the same key
- Direct provider keys remain optional fallbacks, not requirements

## The only required Vercel variable

```env
OPENROUTER_API_KEY=your_key_here
```

Your existing `OPENROUTER_MODEL=openrouter/free` variable can stay. It is used as an emergency fallback.

### Free-only behavior

By default, automatic routing and manual selection use free OpenRouter models:

```env
OPENROUTER_ALLOW_PAID=false
```

To make paid OpenRouter models selectable later, change it to:

```env
OPENROUTER_ALLOW_PAID=true
```

That still uses the **same OpenRouter key**. It may consume OpenRouter credits.

## How the model network works

1. `/api/status` securely requests the current OpenRouter model catalog.
2. The browser receives model names and capabilities, never the secret key.
3. Automatic mode scores models for coding, reasoning, research, creative work, writing and multimodal capability.
4. Council mode chooses models from different authors when possible.
5. Each specialist runs independently.
6. A final judge combines the strongest work.
7. If a specific model fails, the request moves through the fallback chain and finally to `openrouter/free`.

## Important scope

One OpenRouter key connects every **model and media endpoint supported by OpenRouter**. It does not turn consumer websites such as Canva, CapCut, Suno or Grammarly into programmable APIs. Those remain external workflows or optional webhooks unless they provide a compatible API.

## Updating your existing GitHub repository

1. Download and extract the new ZIP.
2. Open your existing GitHub repository.
3. Upload the contents of the extracted `omni-fusion-ai` folder.
4. Allow GitHub to replace files with the same names.
5. Commit the update.
6. Vercel should automatically redeploy.

Do not create a second Vercel project. Keep the same repository, Root Directory and environment variables.

## Main files

```text
omni-fusion-ai/
├── index.html
├── styles.css
├── app.js
├── api/
│   ├── orchestrate.js
│   ├── status.js
│   ├── image.js
│   ├── speech.js
│   ├── providers/
│   │   ├── openrouter.js
│   │   ├── runtime.js
│   │   └── catalog.js
│   └── lib/
├── tests/
├── .env.example
├── package.json
└── vercel.json
```

## Optional direct providers

OpenAI, Anthropic, Gemini, xAI, Perplexity, Mistral, Groq, DeepSeek, Hugging Face, Cloudflare, Ollama and custom OpenAI-compatible endpoints are still supported. They are optional and can be used as additional fallbacks.

## Local checks

```bash
npm install
npm run check
npm test
```

## Security

- API keys stay in Vercel environment variables
- The browser only receives model metadata
- Optional app password protection remains available
- Requests are rate-limited and size-limited
- Provider calls use timeouts and fallback handling
- The project does not scrape consumer AI websites

## License

MIT. Provider names and trademarks belong to their owners. This independent project is not endorsed by those providers.
