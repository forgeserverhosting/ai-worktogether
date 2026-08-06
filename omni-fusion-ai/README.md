# OmniFusion V10 — Compact Vision Website Studio

OmniFusion is a website-first multi-AI chat. Paste the business information, optionally attach real pictures, answer a few short questions inside the same conversation, and let the visible AI team build actual website files.

## Main flow

1. Paste the business information into the normal chat.
2. Attach up to four JPG, PNG, WebP, or GIF pictures with **+ Picture** or drag them onto the composer.
3. A Vision Analyst inspects the images.
4. A second Visual Brand Reviewer checks the first analysis and recommends exact website usage.
5. OmniFusion asks four short creative questions inside the same chat.
6. The Creative Director presents three distinct website directions.
7. Select one and start the build.
8. The team creates real files, reviews them, repairs problems, validates the result, and packages a ZIP that includes the uploaded pictures.

There is no separate setup wizard before the chat.

## Picture understanding

Uploaded pictures are compressed in the browser before they are sent. Compatible OpenRouter vision models receive the real image data through multimodal chat messages.

The visible Team drawer records:

- Vision Analyst findings
- Visual Brand Reviewer corrections
- The actual model and provider used
- Latency and failed provider attempts
- The image asset paths passed to the Developer
- File creation, review, repair, and validation activity

The Developer receives stable image tokens such as `omnifusion://image/...`. OmniFusion replaces those tokens with real `assets/...` paths, previews the images locally, validates that the files reference them, and includes the original compressed image bytes in the ZIP.

## Timeout-resistant execution

V10 does not keep one giant AI request open. Every teammate, build, review, repair, and validation action runs as a separate short function invocation.

- Server-side model-call budgets stop before the Vercel function ceiling.
- Build/review/repair/validation steps automatically retry once through a new invocation and a different model slot.
- Completed messages and files remain available when a later step fails.
- All configured functions use a maximum duration of 60 seconds for compatibility with Hobby deployments that do not have extended Fluid Compute limits enabled.

## Compact interface

- ChatGPT-style center conversation
- Small project sidebar
- Chat, Preview, and Files as the primary tabs
- Code, Changes, Validation, and Models under **More**
- One paperclip-style picture control
- Team communication in a slide-out drawer
- ZIP button appears only after real files exist

## Watching the AIs communicate

Press **Team** in the upper-right corner.

Enable **Pause before each handoff** to advance the collaboration manually. You can type a direction before running the next teammate, and that direction becomes part of the shared transcript.

## Website team

1. Vision Analyst, when pictures are attached
2. Visual Brand Reviewer, when pictures are attached
3. Website Strategist
4. Conversion Copywriter
5. Creative Director
6. UX Architect
7. Frontend Architect
8. Frontend Developer
9. QA Reviewer
10. Fixer Developer
11. Release Validator
12. ZIP Packager

The later teammates receive the visible work produced earlier. It is sequential collaboration, not a race.

## Update the existing deployment

1. Extract the ZIP.
2. Open the existing `omni-fusion-ai` folder in GitHub.
3. Upload everything inside the extracted folder.
4. Replace matching files and commit to `main`.
5. Vercel should deploy the commit automatically.

Keep the existing Vercel project, Root Directory, and environment variables.

## Environment variables

```env
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=openrouter/free
```

`OPENROUTER_MODEL` is optional. OmniFusion can load the OpenRouter catalog and choose compatible text and vision models automatically.

## Validation

```bash
npm test
npm run check
```

V10 contains eight actual Vercel API functions. The release passes 24 automated tests plus JavaScript syntax validation.
