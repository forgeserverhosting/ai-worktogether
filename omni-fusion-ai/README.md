# OmniFusion AI 6.0 — Resilient Collaborative Team Room

A GitHub + Vercel AI workspace that uses one OpenRouter key to let multiple AI models **share work, reply to one another, review a common draft, revise it, and produce one final deliverable**.

## Required Vercel variables

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/free
```

No additional provider keys are required for models available through OpenRouter.

## What changed in V6

V5 ran an entire collaboration inside one long-lived Vercel function. A complex request could outlive that stream and leave the browser without the final event.

V6 uses a **resumable step-by-step workflow**:

- Planner request
- Team-lead request
- Sequential specialist requests
- Reviewer request
- Revision request
- Optional second review/revision loop
- Final-integrator request

Each step is a separate short Vercel invocation. The browser preserves the shared transcript between steps and passes it to the next teammate. If one step fails, completed team messages remain visible and the remaining team can continue.

## What users can inspect

- Live AI Team Room
- Exact sender and recipient for every handoff
- Exact provider-returned model ID
- Provider attempts and fallbacks
- Response duration for every teammate
- Shared plan, contributions, review, revision, and final integration
- Verified collaboration badge only after a real review and revision occurred
- Verified multi-model badge only when at least two distinct model IDs completed calls

The Team Room displays visible work products, decisions, questions, edits, reviews, and handoffs. It does not expose private hidden chain-of-thought.

## Modes

| Mode | Behavior |
|---|---|
| Quick | One model answers directly |
| Team | Lead, two specialists, reviewer, one revision loop, final integrator |
| Deep Team | Lead, three specialists, reviewer, two revision loops, final integrator |

## Actual collaboration flow

```text
User request
  ↓
Planner assigns connected roles
  ↓
Team lead posts plan + acceptance criteria
  ↓
Specialist 1 reads lead → contributes → hands to Specialist 2
  ↓
Specialist 2 reads all earlier messages → contributes → hands to Reviewer
  ↓
Reviewer reads all work → sends exact corrections to Team Lead
  ↓
Team Lead reads review → replies and revises
  ↓
Final Integrator reads the complete transcript → delivers result
```

The specialists run sequentially—not as a race—so every later teammate receives the actual earlier transcript.

## Update the existing GitHub repository

1. Extract the ZIP.
2. Open the existing `omni-fusion-ai` folder in the GitHub repository.
3. Upload everything inside the new extracted `omni-fusion-ai` folder.
4. Allow GitHub to replace matching files.
5. Commit the changes.
6. Vercel redeploys automatically.

Keep the same Vercel project, Root Directory, and environment variables.

## Main structure

```text
omni-fusion-ai/
├── index.html
├── styles.css
├── app.js
├── api/
│   ├── team-step.js       # resilient collaboration steps
│   ├── orchestrate.js     # legacy compatibility endpoint
│   ├── status.js
│   ├── image.js
│   ├── speech.js
│   ├── providers/
│   └── lib/
├── tests/
├── .env.example
├── package.json
└── vercel.json
```

## Compatibility

One OpenRouter key covers models available through OpenRouter. Consumer apps without compatible public APIs—such as CapCut or Canva—remain external workflows rather than fake integrations.

## Local checks

```bash
npm install
npm run check
npm test
```

The included test suite validates provider routing, OpenRouter one-key operation, streaming compatibility, and the new multi-request collaboration workflow.

## License

MIT. This is an original interface and implementation. Provider names and trademarks belong to their owners.
