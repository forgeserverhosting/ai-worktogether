# OmniFusion Prime Intelligence V14

OmniFusion Prime Intelligence is a compact, website-first AI workspace for the same free Vercel + OpenRouter setup. The interface stays simple—Chat, Preview, Files, Team, Intelligence, and Download—while V14 adds stronger planning, verification, security, evidence, and self-evaluation behind the scenes.

## V14 intelligence upgrades

### Project Brain

Each project maintains a compact role-aware memory instead of repeatedly sending the entire conversation. It separates:

- verified business facts
- user preferences
- locked design and product decisions
- current files
- previous mistakes to avoid
- unfinished tasks
- latest user intent

Each teammate receives only the memory relevant to its role. This reduces repetition, improves consistency, and saves free-model requests and context.

### Strict agent contracts

Lead, Designer, Builder, Reviewer, Fixer, Validator, Doctor, and Team handoffs return structured contracts with:

- completion status
- usable payload
- evidence
- remaining issues
- files received or changed
- tests performed

A teammate cannot legitimately mark work completed when the required deliverable is missing. Legacy structured outputs remain supported as a fallback for free models that do not perfectly follow the envelope.

### Browser interaction tests

The live preview now runs a local browser harness at desktop, tablet, and mobile widths. It checks:

- runtime and console errors
- horizontal overflow
- broken images and section links
- missing accessible labels
- duplicate IDs and heading-level skips
- tiny text and small touch targets
- fixed-element collisions
- unsafe new-tab links
- unwired forms
- mobile-menu state changes

Results appear in Intelligence, Team evidence, and the quality report.

### Security and import protection

Imported webpages are treated as untrusted reference data, never as instructions. Suspicious prompt-injection lines and executable script blocks are removed before the content enters the project.

Generated projects are scanned for:

- unknown external scripts and frames
- forced redirects
- dynamic code execution
- suspicious obfuscation
- cryptocurrency-mining patterns
- hidden executable embeds
- unintended form or network destinations

High-severity security failures block release.

### Learning free-model router

OmniFusion continues to use the current free OpenRouter catalog, but it now also stores local role-specific performance evidence:

- success and failure history
- valid artifact production
- quality score
- response time
- retries

Models that perform well for Builder, Reviewer, Vision, Lead, or Creative work move up for that role. Repeatedly failing models cool down and move behind healthier options. Builder and Reviewer still prefer different actual models when possible.

### Evidence-based Team activity

Team entries show real work evidence rather than decorative conversation:

- sender and recipient
- requested role
- planned and actual model
- provider attempts
- duration and retry count
- files received
- files created or changed
- tests performed
- structured-contract status
- exact evidence supplied by the teammate

### Project Doctor

Use **Project Doctor** to inspect and repair the entire current website. It:

1. refreshes the Project Brain
2. runs browser tests
3. validates functionality, mobile layout, accessibility, originality, facts, SEO, forms, and security
4. creates an exact repair plan
5. applies targeted patches where possible
6. falls back to a constrained repair only when necessary
7. validates again
8. saves a version and benchmark result

### Production-ready packaging

The final ZIP includes or safely generates the expected production support files for static websites:

```text
index.html
styles.css
script.js
assets/
favicon.svg
robots.txt
sitemap.xml (when a valid site URL is known)
404.html
README.md
release-report.json
```

The client ZIP excludes design-reference images and development-only workspace data. High-severity release failures keep Download blocked.

### Request budgeting and benchmarks

Before and during work, Intelligence displays the estimated Lead, Vision, Builder, Reviewer, Repair, and validation request count. Saved analyses and unchanged files are reused.

The benchmark snapshot tracks measurable project results such as:

- valid files and preview
- browser-test score
- security score
- quality score
- unsupported claims
- model retries
- request count
- completion status

Benchmark history is saved with the project so later versions and repairs can be compared honestly.

## V13 capabilities retained

- resumable build checkpoints
- adaptive questions inside normal chat
- verified contact-form behavior
- precise patch-based editing
- model health recovery
- `.omnifusion` project backup and transfer
- transparent category quality scores
- website import
- business-photo and design-reference uploads
- one-time vision analysis reused by the team
- click-to-edit preview sections
- Brand Memory and verified-fact guardrails
- Originality Engine
- version history and restore
- actual generated files, preview, and ZIP download

## Free setup

Required Vercel environment variable:

```text
OPENROUTER_API_KEY=your_key
```

Recommended final fallback:

```text
OPENROUTER_MODEL=openrouter/free
```

No paid database, additional model subscription, or hosting upgrade is required. Free-model speed and availability can vary; checkpoints, retries, cooldowns, and local deterministic tools are designed around that limitation.

## GitHub update

1. Extract the release ZIP.
2. Open the existing `omni-fusion-ai` directory in GitHub.
3. Upload everything inside the extracted `omni-fusion-ai` folder.
4. Replace matching files.
5. Commit to `main`.
6. Let the connected Vercel project redeploy.
7. Hard refresh the production website.

Do not delete the existing GitHub directory first. Upload the replacement files into it.

## Local checks

```bash
npm test
npm run check
```

V14 still uses nine files in `/api`, remaining within the Vercel Hobby function limit used by this project.
