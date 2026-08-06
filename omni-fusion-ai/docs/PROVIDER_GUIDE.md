# Provider compatibility guide

## Main one-key network

| Connection | Environment variables | What it enables |
|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` | Live model catalog, automatic multi-model councils, model search, free-model routing, supported image models and gateway fallback |

Optional controls:

```env
OPENROUTER_MODEL=openrouter/free
OPENROUTER_ALLOW_PAID=false
OPENROUTER_IMAGE_MODEL=
```

`OPENROUTER_ALLOW_PAID=false` keeps automatic and manual model selection on free models. Set it to `true` to make paid models selectable with the same key and OpenRouter credits.

## Optional direct fallbacks

| Provider | Adapter | Environment variables |
|---|---|---|
| OpenAI | Responses API | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Anthropic | Messages API | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Gemini | `generateContent` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| xAI | OpenAI-compatible | `XAI_API_KEY`, `XAI_MODEL` |
| Perplexity | OpenAI-compatible | `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` |
| Mistral | OpenAI-compatible | `MISTRAL_API_KEY`, `MISTRAL_MODEL` |
| Groq | OpenAI-compatible | `GROQ_API_KEY`, `GROQ_MODEL` |
| DeepSeek | OpenAI-compatible | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` |
| Hugging Face | OpenAI-compatible router | `HF_TOKEN`, `HF_MODEL` |
| Cloudflare | Workers AI REST | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_MODEL` |
| Ollama | Native `/api/chat` | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

These direct keys are optional. The application works with only OpenRouter.

Consumer products without a stable programmable endpoint remain external workflows or webhook targets; the app does not scrape their websites.
