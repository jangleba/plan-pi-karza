# delete-account

Authenticated Edge Function used by the in-app **Usuń konto i dane** action.
It validates the caller's JWT server-side and deletes that exact Auth user.
All user-owned database rows are then removed through `ON DELETE CASCADE`.

Deploy after applying the release migration:

```sh
supabase functions deploy delete-account --project-ref bdfatyynxbzspjzkrjgg
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to hosted Supabase
functions. Never place the service-role key in Vite variables or client code.
