# Updating the existing GitHub + Vercel website

1. Extract the update ZIP.
2. Open the existing GitHub repository.
3. Open the existing `omni-fusion-ai` folder in the repository.
4. Click **Add file → Upload files**.
5. Drag everything from inside the new extracted `omni-fusion-ai` folder onto that GitHub upload page.
6. Commit the changes.
7. Vercel automatically redeploys from the same repository.

Keep the current Vercel Root Directory set to `omni-fusion-ai`.

The only required environment variable remains:

```env
OPENROUTER_API_KEY=your_key_here
```

No additional provider keys are required for the OpenRouter model network.
