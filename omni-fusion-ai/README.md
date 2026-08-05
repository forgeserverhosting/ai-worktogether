# OmniFusion AI 5.0 — Collaborative Team Room

A GitHub + Vercel AI workspace that uses one OpenRouter key to let multiple AI models **share work, review each other, reply to feedback, revise a common deliverable, and produce one final result**.

## Required Vercel variables

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/free
```

No additional provider keys are required for the OpenRouter model network.

## What changed in V5

- Removed the model-race concept from the main workflow
- Added a live **AI Team Room**
- Agents send visible messages to named teammates
- Team lead creates the project plan and acceptance criteria
- Specialists build on the lead's shared plan
- Reviewer reads all prior contributions and sends concrete revision requests
- Lead replies to the reviewer and revises the shared deliverable
- Final integrator reads the complete team transcript and delivers the result
- Settings option for one or two review/revision loops
- Separate tabs for **Team chat** and **Execution proof**
- Exact provider and model IDs on every team message
- Provider failures and fallbacks remain visible
- Saved conversations retain their team transcript locally

The Team Room displays work notes, decisions, questions, handoffs, reviews, and revisions intentionally written for collaboration. It does not display private hidden chain-of-thought.

## Modes

| Mode | Behavior |
|---|---|
| Quick | One model answers directly |
| Team | Lead, specialists, reviewer, revision loop, and final integrator |
| Deep Team | More specialists and two review/revision loops |

## Actual collaboration flow

```text
User request
  ↓
Team planner assigns connected roles
  ↓
Team lead posts plan + constraints
  ↓
Specialists read the plan and add work artifacts
  ↓
Reviewer reads all shared work and sends corrections
  ↓
Lead replies and revises the deliverable
  ↓
Optional second review/revision loop
  ↓
Final integrator uses the full transcript
```

Each later API call receives the real earlier team transcript. The models are not simply answering the same prompt independently.

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
│   ├── orchestrate.js
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

## Live events

The browser opens a streamed connection to `/api/orchestrate`. The server emits real events while the collaboration happens:

```text
run_start
route_complete
planner_start
planner_complete
collaboration_start
round_start
team_message_start
team_message
round_complete
provider_failure
finalizer_start
finalizer_complete
run_complete
```

A collaborative run is verified only when the transcript contains actual review and revision messages. A multi-model collaborative badge additionally requires at least two distinct provider-returned model IDs.

## Compatibility

One OpenRouter key covers models available through OpenRouter. Consumer apps without compatible public APIs—such as CapCut or Canva—remain external workflows rather than fake integrations.

## Local checks

```bash
npm install
npm run check
npm test
```

## License

MIT. This is an original interface and implementation. Provider names and trademarks belong to their owners.
