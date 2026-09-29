# analyze-fuel-photo

Authenticated, one-shot meal photo analysis. **Available backend capability,
currently not connected to the Fuel UI.** The current UI instead decodes barcode
images locally, looks up products in Open Food Facts, and optionally uses browser
speech recognition.

## Configuration and deployment

Choose the target project explicitly; do not copy the repository's existing
project ID into an unrelated deployment. Apply the repository migrations in order,
including `20260916200000_secure_fuel_photo_and_health_notes.sql`, which supplies
`consume_fuel_photo_quota` and its service-role-only permissions. The quota is
8 attempts per user per 10-minute bucket; checks occur before image validation
and the provider call, so failed attempts can consume quota too.

The function expects runtime `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY` (or its coded fallback `SUPABASE_PUBLISHABLE_KEY`). Confirm
these names are available in the selected runtime. These are server values,
never `VITE_*` variables. Custom secrets are:

- `OPENAI_API_KEY`: required for provider calls.
- `OPENAI_FUEL_MODEL`: optional; code default is `gpt-4.1-mini`.
- `FUEL_ALLOWED_ORIGINS`: comma-separated exact allowed origins, including scheme
  and port where applicable. Empty configuration rejects all requests carrying
  an `Origin`; requests without one still require valid user authorization.

Prepare an ignored `.fuel-function.local` file with the custom secrets. Use
only intended deployment origins, not `*`. Then, with the Supabase CLI installed
and authenticated:

```sh
export BALLWISE_PROJECT_REF='YOUR_PROJECT_REF'
supabase secrets set --env-file .fuel-function.local --project-ref "$BALLWISE_PROJECT_REF"
supabase functions deploy analyze-fuel-photo --project-ref "$BALLWISE_PROJECT_REF"
```

The repository keeps `verify_jwt = true`; the handler additionally validates the
caller with `auth.getUser`. Confirm JWT compatibility in the selected project
rather than disabling verification to bypass an error.
[Supabase deployment](https://supabase.com/docs/guides/functions/deploy) and
[secret configuration](https://supabase.com/docs/guides/functions/secrets).

## Request and storage behavior

`POST` JSON accepts `imageDataUrl` (base64 JPEG/PNG/WebP) plus optional `session`
context (`kind`, `intensity`, `durationMin`). Image size is estimated from base64
and limited to 4 MiB; a declared Content-Length above 6 MiB is rejected. The
function sanitizes session context, calls the OpenAI Responses API with
`store: false`, and returns structured estimates or an error.

The function does not persist the image or analysis result in Storage/Postgres.
It does persist per-user quota metadata; old quota buckets are pruned when that
user consumes quota again. `store: false` is a request setting, not proof of the
provider's full retention behavior. Before exposing this feature in UI, confirm
data terms and implement the appropriate user-facing transmission information.

## Verification on the selected backend

Run `supabase/verification/20260916_secure_fuel_photo_and_health_notes.sql` after
migrations. Check missing/invalid JWT (401), disallowed origin (403), invalid
method/type/image, oversized input, missing configuration (503), quota exhaustion
(429), and upstream failure (502). Verify a successful response and absence of
stored image/result content. Deployment, provider access and these integration
checks remain pending until performed against the selected environment.
