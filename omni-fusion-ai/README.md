# OmniFusion AI

A polished multi-provider AI orchestration workspace designed for **GitHub + Vercel**.

One short prompt can be routed to several AI providers. Specialist agents work independently, a final judge combines the strongest ideas, and automatic fallback keeps the request alive when a provider times out or rejects the call.

## What is already built

- Responsive SaaS-style interface
- Quick, Council, and Deep modes
- Automatic task classification and provider routing
- Provider selection controls
- Parallel specialist agents
- Final judge/synthesizer
- Automatic provider fallback
- Visible provider/model trace
- Searchable AI integration library
- Local browser history
- Copy and Markdown download
- Optional OpenAI/Replicate image generation
- Optional ElevenLabs voice generation
- Generic media webhook support
- Optional password protection
- Server-side API-key security
- Rate limiting, request limits, timeouts, and security headers
- Zero required npm runtime dependencies

## Direct text-provider adapters

OmniFusion can call these providers directly when their environment variables are configured:

- OpenRouter
- OpenAI
- Anthropic / Claude
- Google Gemini
- xAI / Grok
- Perplexity
- Mistral
- Groq
- DeepSeek
- Hugging Face Inference Providers
- Cloudflare Workers AI
- Ollama
- Custom OpenAI-compatible providers

OpenRouter, Hugging Face, Groq, Cloudflare, and Ollama can also expose model families such as **Meta Llama, Qwen, Mistral, DeepSeek, Stable Diffusion-related services, and other open models**, depending on the selected host and model.

The interface also lists the other AI products discussed—Canva, CapCut, Firefly, Ideogram, Recraft, Pika, Kling, Luma, Hailuo, PixVerse, Suno, Udio, Gamma, Grammarly, DeepL, research tools, coding assistants, and more. Products without a stable public automation API are shown honestly as external workflows or webhook targets rather than fake connections.

# Easiest deployment: GitHub website + Vercel

## 1. Create the GitHub repository

1. Extract the ZIP file on your computer.
2. Sign in to GitHub.
3. Click **New repository**.
4. Name it `omni-fusion-ai`.
5. Choose **Private** while you are setting it up.
6. Do not add a README, `.gitignore`, or license on GitHub because they are already included.
7. Create the repository.
8. Click **uploading an existing file**.
9. Upload the **contents inside the extracted `omni-fusion-ai` folder**. Do not upload only the ZIP.
10. Commit the files.

Your GitHub repository should show `index.html`, `styles.css`, `app.js`, `api`, `package.json`, and `vercel.json` at the top level.

## 2. Deploy through Vercel

1. Sign in to Vercel with GitHub.
2. Click **Add New → Project**.
3. Import the `omni-fusion-ai` repository.
4. Leave the framework preset as **Other**.
5. Do not change the root directory.
6. Add environment variables before deploying.
7. Click **Deploy**.

Vercel will host the website and the secure `/api/*` server functions.

# Minimum setup

The easiest first setup uses OpenRouter:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/free
```

This lets the app run before you add direct provider accounts. Free models can be busy or rate-limited, so adding more provider keys improves reliability.

# Recommended setup

Start with:

```env
APP_PASSWORD=choose-a-private-password
APP_NAME=OmniFusion AI
PUBLIC_SITE_URL=https://your-project.vercel.app

OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/free

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash

PERPLEXITY_API_KEY=...
PERPLEXITY_MODEL=sonar
```

Then add OpenAI, Claude, Grok, DeepSeek, Mistral, Groq, Hugging Face, Cloudflare, or Ollama as desired. Every variable is documented in `.env.example`.

## Important model note

Model IDs change over time. If a provider reports that a model does not exist or has been retired, update that provider's `*_MODEL` variable in Vercel to a currently supported model ID. You do not need to edit the application code.

# Adding environment variables in Vercel

1. Open your Vercel project.
2. Go to **Settings → Environment Variables**.
3. Enter a variable name exactly as shown in `.env.example`.
4. Paste the value.
5. Enable it for Production, Preview, and Development if appropriate.
6. Save it.
7. Open **Deployments**, select the latest deployment, and choose **Redeploy**.

Never place API keys inside `app.js`, `index.html`, GitHub commits, screenshots, or browser code.

# Media setup

## Image generation with OpenAI

```env
OPENAI_API_KEY=...
OPENAI_IMAGE_MODEL=gpt-image-1
```

## Image generation with Replicate

```env
REPLICATE_API_TOKEN=...
REPLICATE_IMAGE_VERSION=owner/model:version-hash
```

The exact Replicate version determines the image model and accepted input fields. This project sends a standard `prompt` input.

## Voice generation with ElevenLabs

```env
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL=eleven_multilingual_v2
```

## Custom media webhook

This is the future-proof bridge for an authorized ComfyUI deployment, private video workflow, music service, or another API:

```env
MEDIA_WEBHOOK_URL=https://your-automation.example.com/generate
MEDIA_WEBHOOK_TOKEN=optional-secret
```

The app sends:

```json
{
  "type": "image",
  "prompt": "the user's prompt"
}
```

Return JSON containing `url`, `imageUrl`, or `output`.

# Custom OpenAI-compatible providers

Create an environment variable holding the key, then define the provider in `CUSTOM_PROVIDERS_JSON`:

```env
MY_PROVIDER_KEY=...
CUSTOM_PROVIDERS_JSON=[{"id":"my-ai","name":"My AI","baseUrl":"https://api.example.com/v1","apiKeyEnv":"MY_PROVIDER_KEY","model":"model-name","strengths":["general","code"]}]
```

The base URL must expose `/chat/completions` using the OpenAI Chat Completions request format.

# Ollama

A Vercel deployment cannot normally reach Ollama running only on your home computer at `localhost`. `OLLAMA_BASE_URL` must point to an Ollama server that is securely reachable from Vercel, or you should run the entire project locally.

```env
OLLAMA_BASE_URL=https://your-secure-ollama-server.example.com
OLLAMA_MODEL=llama3.2
OLLAMA_API_KEY=optional_remote_key
```

Do not expose an unprotected Ollama server directly to the public internet.

# Local testing

Install Node.js 20 or newer, then:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Run checks:

```bash
npm run check
npm test
```

# How routing works

1. The app identifies the prompt's likely intent: research, coding, creative work, reasoning, writing, or media.
2. Configured providers are ranked by specialty, user selection, and fallback priority.
3. Council modes create complementary specialist roles.
4. Specialists run in parallel and are distributed across different providers when possible.
5. Failed providers automatically fall back to another configured provider.
6. A final judge synthesizes the council into one answer.

The app does **not** send every prompt to every service. That would be slower, more expensive, and less reliable. It selects the smallest useful team.

# Security decisions

- API keys exist only in server environment variables.
- The browser receives provider names and configured/not-configured status, never secret values.
- Optional `APP_PASSWORD` protects generation routes.
- Basic per-IP request throttling is included.
- Prompt and output lengths are capped.
- Provider calls have timeouts.
- HTML output is escaped before Markdown formatting.
- Consumer websites are not scraped or automated through stored usernames and passwords.
- The app never autonomously publishes, purchases, emails, deletes, or changes accounts.

For a public high-traffic product, add a real database, user authentication, durable rate limiting, usage metering, billing, abuse monitoring, and a job queue.

# Main files

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
│   ├── health.js
│   ├── lib/
│   └── providers/
├── tests/
├── docs/
├── .env.example
├── package.json
└── vercel.json
```

## License

MIT. Provider names and trademarks belong to their respective owners. This repository is an independent integration project and is not endorsed by those providers.
