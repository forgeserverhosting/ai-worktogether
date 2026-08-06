# OmniFusion Website Genius V16

OmniFusion V16 is a compact, website-first AI studio designed to produce better finished websites through specialization, persistent project memory, multiple free OpenRouter models, actual files, rendered review, precise repairs, and deterministic release checks.

The interface stays simple:

```text
Projects | Chat | Preview | Files | Team | Download
```

The advanced intelligence remains behind the chat and inside **More → Intelligence**.

## V16 website-intelligence upgrades

### 1. Performance-learned free-model ladder

OpenRouter's free catalog is still the model source, but V16 no longer relies only on advertised capabilities. The browser stores role-specific evidence for each actual model returned by OpenRouter:

- successful and failed runs
- strict-contract success
- average quality evidence
- response latency
- Lead, Builder, Reviewer, Creative, and Vision performance

That evidence is sent back to the server on later project steps. The router blends catalog capability scoring with the model's real local track record. New models start from capability ranking; proven models move upward for the role where they performed well.

The final `openrouter/free` router remains an emergency fallback.

### 2. Specialized Website Lead

The Prime Lead receives the exact business identity, verified facts, approved concept, source evidence, image findings, previous mistakes, current files, and unfinished tasks. It produces one decisive implementation brief rather than asking the Builder to infer the whole project again.

### 3. Original website-pattern library

V16 includes an internal library of buildable composition systems, including:

- editorial split heroes
- project-canvas heroes
- field-journal storytelling
- before/after stages
- service pathways
- availability rails
- local-proof maps
- cinematic chapters
- process timelines
- estimate composers
- trust ledgers
- type-led service indexes

The library does not paste complete templates. The Creative Director and Developer receive a small project-specific selection and must transform the patterns around the approved design DNA.

### 4. Three rendered concept directions

The three creative directions are now shown as actual miniature website compositions inside the normal chat. They use the locked business name and proposed conversion action so the user is choosing between visibly different layouts—not three color swatches.

### 5. GPT-5.6 senior-review bridge

Your ChatGPT subscription cannot be used as OmniFusion's free API backend, but V16 adds a manual bridge that uses the subscription you already have.

Open **More → Intelligence**:

- **Export review pack** creates a ZIP containing:
  - the original project brief
  - verified facts and source evidence
  - design DNA
  - actual website files
  - browser-interaction audit
  - validation report
  - benchmark snapshot
  - visible AI-team transcript
  - a ready-to-paste senior-review prompt
- Upload that ZIP to ChatGPT and request a review.
- Copy the complete correction report.
- Press **Import expert review** in OmniFusion.
- OmniFusion converts the report into the smallest safe file patches, renders the result, validates it again, and saves a new version.

No extra API key or paid API call is used for this bridge.

### 6. Precise repair workflow

Expert reviews, section edits, Team notes, and Project Doctor repairs attempt exact search-and-replace patches first. A constrained complete-project repair is used only when a safe exact patch cannot be applied.

Every revision records:

- files changed
- actual model used
- before/after version
- validation status
- Team evidence

### 7. Browser interaction and release evidence

The generated static website is loaded in the real preview iframe at desktop, tablet, and mobile widths. The local interaction harness checks:

- runtime errors
- horizontal overflow
- broken images
- section links
- duplicate IDs
- heading hierarchy
- missing accessible labels
- tiny text and touch targets
- fixed-element collisions
- unsafe new-tab behavior
- form wiring
- mobile-menu behavior

This is a real in-browser audit. It does not pretend to be a remote Playwright or Lighthouse service. No paid external browser service is required.

### 8. Existing Prime Intelligence retained

V16 retains:

- adaptive questions inside the normal chat
- an obvious custom-answer choice
- exact-name locking
- user-authorized source-material handling
- supplied-URL research and import protection
- one-time image analysis reused by the team
- actual model IDs and provider attempts in Team
- resumable build checkpoints
- strict structured agent contracts
- Project Brain memory
- precise chat-based edits
- click-to-edit preview sections
- Brand Memory
- originality checks
- Project Doctor
- security auditing
- real contact-method validation
- quality scoring
- benchmark history
- project backup/import
- production support files
- final ZIP release gate

## Free setup

Required Vercel environment variable:

```text
OPENROUTER_API_KEY=your_key
```

Recommended final fallback:

```text
OPENROUTER_MODEL=openrouter/free
```

No paid database, model subscription, or Vercel upgrade is required. Free models can be slow or temporarily unavailable; V16 preserves completed stages, retries short steps, cools down failing models, and continues from checkpoints.

## GitHub update

1. Extract the release ZIP.
2. Open the existing `omni-fusion-ai` directory in GitHub.
3. Upload everything **inside** the extracted `omni-fusion-ai` folder.
4. Replace matching files.
5. Commit to `main`.
6. Let the existing Vercel project redeploy.
7. Hard refresh the production page with `Ctrl + Shift + R`.

Do not delete the existing GitHub directory first.

## Recommended website workflow

1. Paste the real business information into Chat.
2. Add business photos, reference screenshots, or a public source URL when available.
3. Answer only the missing questions.
4. Choose one of the three rendered concepts.
5. Open Team when you want to watch the actual model handoffs.
6. Let the Builder, Reviewer, Fixer, and Validator finish.
7. Run Project Doctor.
8. Export the GPT review pack for a final GPT-5.6 senior review.
9. Import the corrections.
10. Download the validated client ZIP.

## Honest limitations

- Free models will not consistently match a frontier paid model's raw reasoning.
- More models do not automatically mean a better result.
- OmniFusion's advantage is website specialization, persistent project context, file tools, rendering, testing, repair loops, and evidence—not a claim that every individual free model is stronger than GPT-5.6.
- Name-only web research is not silently performed because reliable live search can require paid tools. Supplied public URLs can be imported and inspected.
- The GPT review bridge is manual because ChatGPT subscription usage cannot be transferred into a custom website as free API usage.

## Local verification

```bash
npm test
npm run check
```

V16 uses nine files in `/api`, remaining within the Vercel Hobby function limit used by this project.
