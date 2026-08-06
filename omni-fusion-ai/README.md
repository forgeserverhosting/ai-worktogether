# OmniFusion V9 — Compact Website Builder

OmniFusion is now a website-first AI chat instead of a setup-heavy dashboard.

## Main flow

1. Paste the business information into the normal chat.
2. OmniFusion reads it and asks four short creative questions inside the same conversation.
3. Each question shows three choices plus a custom answer.
4. The Creative Director produces three different design directions.
5. Select one direction and start the build.
6. The AI team creates real files, reviews them, repairs problems, validates the result, and packages a downloadable ZIP.

There is no separate Website Architect wizard before the chat.

## Compact interface

- Simple ChatGPT-style center conversation
- Small project sidebar
- Chat, Preview, and Files as the main tabs
- Code, Changes, Validation, and Models under **More**
- Disabled ZIP controls remain hidden until files exist
- General AI mode remains available

## Watching the AI team

Press **Team** in the top-right corner to open the live collaboration drawer.

The drawer shows:

- Which teammate sent each handoff
- The receiving teammate
- Actual model and provider
- Latency and provider failures
- File creation, review, repair, and validation events
- Full transcript access

Enable **Pause before each handoff** inside the Team drawer to manually advance the collaboration one AI at a time and add a direction before the next request.

## Website workflow

1. Website Strategist
2. Conversion Copywriter
3. Creative Director
4. UX Architect
5. Frontend Architect
6. Frontend Developer
7. QA Reviewer
8. Fixer Developer
9. Release Validator
10. ZIP Packager

Each later AI receives the visible work produced by earlier teammates. The system is sequential collaboration, not a model race.

## Update the existing deployment

1. Extract the ZIP.
2. Open the existing `omni-fusion-ai` folder in GitHub.
3. Upload everything inside the extracted `omni-fusion-ai` folder.
4. Replace matching files and commit to `main`.
5. Vercel should deploy the commit automatically.

Keep the existing Vercel project, Root Directory, and environment variables.

## Environment variables

```env
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=openrouter/free
```

The model variable is optional because OmniFusion can use the OpenRouter catalog.

## Validation

```bash
npm test
npm run check
```

The V9 package contains eight actual Vercel API functions, staying below the Hobby-plan function limit.
