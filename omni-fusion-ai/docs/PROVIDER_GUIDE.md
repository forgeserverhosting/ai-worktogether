# Provider compatibility guide

| Provider | Adapter | Environment variables | Recommended use |
|---|---|---|---|
| OpenRouter | OpenAI-compatible Chat Completions | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Broad model access and fallback |
| OpenAI | Responses API | `OPENAI_API_KEY`, `OPENAI_MODEL` | General reasoning, coding, final judge |
| Anthropic | Messages API | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Writing, documents, reasoning |
| Gemini | `generateContent` | `GEMINI_API_KEY`, `GEMINI_MODEL` | General and multimodal-capable models |
| xAI | OpenAI-compatible Chat Completions | `XAI_API_KEY`, `XAI_MODEL` | Reasoning and general work |
| Perplexity | OpenAI-compatible Sonar interface | `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` | Current research and citations |
| Mistral | OpenAI-compatible Chat Completions | `MISTRAL_API_KEY`, `MISTRAL_MODEL` | General and coding |
| Groq | OpenAI-compatible Chat Completions | `GROQ_API_KEY`, `GROQ_MODEL` | Fast open-model inference |
| DeepSeek | OpenAI-compatible Chat Completions | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Reasoning and coding |
| Hugging Face | Inference Providers OpenAI-compatible router | `HF_TOKEN`, `HF_MODEL` | Open models |
| Cloudflare | Workers AI REST | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_MODEL` | Hosted open models |
| Ollama | Native `/api/chat` | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Private/self-hosted models |

## Compatibility philosophy

The application uses provider adapters rather than provider-specific logic throughout the orchestrator. New OpenAI-compatible services can be added through `CUSTOM_PROVIDERS_JSON` without modifying the source.

Products that do not provide a stable developer API are kept in the visible integration catalog and can later be attached through a secure webhook. This is safer and more durable than browser scraping.
