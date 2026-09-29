# delete-account

Authenticated Edge Function used by **Profil → Moje dane i prawa → Usuń konto i dane**.
It validates the caller's JWT with `auth.getUser` and deletes that exact Auth user.
Related database rows whose foreign keys use `ON DELETE CASCADE` are removed by
the database; verify this for the complete current schema, including Lab results.

Apply repository migrations in order, select the intended project, then deploy:

```sh
export BALLWISE_PROJECT_REF='YOUR_PROJECT_REF'
supabase functions deploy delete-account --project-ref "$BALLWISE_PROJECT_REF"
```

The handler requires server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
Confirm they are available in the hosted runtime. Never put the service-role key
in Vite variables or client code. The repository uses gateway JWT verification
and validates the user again inside the handler.
[Supabase deployment guidance](https://supabase.com/docs/guides/functions/deploy).

Before release, test missing/invalid authorization, deletion of the correct user,
cascaded rows, old sessions and account switching on the selected backend. This
function does not delete Storage objects or process backups. Old Vision Lab
objects have a [separate one-time cleanup](../../../docs/VISION-LAB-CLEANUP.md).
The application invokes local-data cleanup after success, but newer caches and
export completeness have [open verification/remediation items](../../../docs/RELEASE-CHECKLIST.md).
Do not claim that deleting an account cancels a future Apple subscription.
