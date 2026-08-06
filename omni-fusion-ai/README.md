# OmniFusion Website Studio V8

A website-first, transparent multi-model AI development studio. One OpenRouter key can route the team through the models available in your OpenRouter account.

## What V8 adds

- **Website Architect wizard** with one question at a time
- Three large answer cards plus a custom answer for every question
- Adaptive questions for business sites, landing pages, and stores
- AI-generated **three-concept design DNA** selection
- Select one concept, blend two, or use **Surprise me**
- Anti-generic design rules built into the Creative Director, Developer, QA, and Fixer prompts
- **Manual collaboration mode** that pauses before every real model request
- Live Team Room with model IDs, providers, latency, handoffs, file actions, and failures
- Full auditable transcript modal with copy support
- Real generated files, responsive preview, code editor, QA repair rounds, validation, and ZIP download
- General-project mode remains available for non-website tasks

## AI agency workflow

1. Website Architect captures creative preferences.
2. Creative concept generator returns three distinct directions.
3. Website Strategist creates the factual and conversion plan.
4. Conversion Copywriter produces usable page copy.
5. Creative Director defines the visual system.
6. UX Architect defines responsive behavior and conversion flow.
7. Frontend Architect resolves the implementation.
8. Frontend Developer generates real files.
9. QA Reviewer inspects those files.
10. Fixer Developer patches the complete project.
11. Release Validator checks the final files.
12. Packager creates the downloadable ZIP.

Each later model receives the visible messages produced by earlier teammates. This is sequential collaboration, not a race.

## Update an existing GitHub deployment

1. Extract the ZIP.
2. Open the existing `omni-fusion-ai` directory in your GitHub repository.
3. Upload everything inside the extracted `omni-fusion-ai` directory.
4. Replace matching files and commit to `main`.
5. Vercel should redeploy automatically.

Keep the existing Vercel Root Directory and environment variables.

## Required environment variables

```env
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=openrouter/free
```

`OPENROUTER_MODEL` is optional because the studio can discover and select models from the catalog.

## Optional environment variables

See `.env.example` for direct providers, custom OpenAI-compatible endpoints, media providers, password protection, and rate limits.

## Manual collaboration

Open **Settings → Collaboration playback → Manual: approve each handoff**.

During a build, the Team Room pauses before each model request. You can type an optional human direction that is inserted into the shared transcript for the next AI to read. Press **Run next teammate** to execute exactly one step, or **Run remaining automatically** to finish the pipeline without further pauses.

## Local testing

```bash
npm test
npm run check
```

## Deployment model

- GitHub stores the code.
- Vercel runs the frontend and `/api` functions.
- API keys remain server-side in Vercel environment variables.
- Browser local storage keeps project history unless disabled.

## Limits

- Free OpenRouter models can be unavailable, rate-limited, or change over time.
- The site clearly records failed attempts and fallbacks.
- “Verified collaboration” appears only when the configured number of distinct model IDs actually complete work.
- Generated websites still require human review before client delivery.
