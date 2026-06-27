-- Prevent clients from self-updating subscription plan via public.users.
-- Plan changes must go through service_role (Stripe/RC webhooks) only.

drop policy if exists "users_update_own" on public.users;

-- Optional: allow users to update only display fields (not plan) via a future RPC.
-- For now, no authenticated UPDATE on users.
