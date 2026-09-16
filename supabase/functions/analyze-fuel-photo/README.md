# analyze-fuel-photo

Authenticated, one-shot meal photo analysis for Fuel.

Required secret:

```bash
supabase secrets set OPENAI_API_KEY=...
```

Optional model override:

```bash
supabase secrets set OPENAI_FUEL_MODEL=gpt-4.1-mini
```

The function accepts a compressed JPEG/PNG/WebP data URL, sends it to the
OpenAI Responses API with `store: false`, returns structured JSON, and never
writes the image or result to Storage or Postgres.
