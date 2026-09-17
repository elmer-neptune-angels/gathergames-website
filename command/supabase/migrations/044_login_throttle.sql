-- Login rate limiting for the command center.
--
-- WHY IT IS IN THE DATABASE. Vercel runs this app as serverless functions
-- across many short-lived instances, so an in-process counter is bypassed
-- by anything that opens parallel connections: each new instance starts
-- at zero failures. The limiter has to share state, and the app already
-- holds one shared store. (The app keeps an in-process fallback for when
-- this table is absent or unreachable -- see src/lib/login-throttle.ts --
-- but that fallback is a courtesy, not the control.)
--
-- WHY THE POLICY IS IN SQL. Read-modify-write from the app would race:
-- two simultaneous guesses both read "4 failures" and both write 5. The
-- upsert below increments inside a single statement, so concurrent
-- attempts serialize on the row lock and every guess is counted.
--
-- POLICY. Per bucket (one client address), 5 failures inside a 15 minute
-- window starts a lockout. The lockout doubles with each further failure,
-- from 1 minute up to a 1 hour ceiling. A window that elapses without a
-- failure resets the count. A successful sign-in clears the row.
--
-- NO SECRETS AND NO PII. A row holds a bucket key, a count and two
-- timestamps. It never holds a password, a guess, or any part of one.
-- The bucket is derived from the client address; if you would rather not
-- retain addresses at all, hash the bucket in clientBucket() before it
-- reaches here -- the policy does not care what the string is.

create table if not exists public.gather_command_login_attempts (
  bucket text primary key check (char_length(bucket) between 1 and 100),
  failures integer not null default 0 check (failures >= 0),
  first_failure_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists gather_command_login_attempts_locked_idx
  on public.gather_command_login_attempts (locked_until)
  where locked_until is not null;

alter table public.gather_command_login_attempts enable row level security;
revoke all on public.gather_command_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.gather_command_login_attempts to service_role;

-- Count one failed attempt and return the resulting state. Atomic: the
-- upsert takes the row lock, so parallel guesses cannot share a count.
create or replace function public.gather_command_login_record_failure(
  p_bucket text
)
returns table (failures integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window   constant interval := interval '15 minutes';
  v_threshold constant integer := 5;
  v_base     constant interval := interval '1 minute';
  v_ceiling  constant interval := interval '1 hour';
  v_failures integer;
  v_lock     timestamptz;
  v_steps    integer;
begin
  insert into public.gather_command_login_attempts as a (
    bucket, failures, first_failure_at, locked_until, updated_at
  )
  values (p_bucket, 1, now(), null, now())
  on conflict (bucket) do update set
    -- A stale window starts over rather than accumulating forever.
    failures = case
      when a.first_failure_at is null or a.first_failure_at < now() - v_window
        then 1
      else a.failures + 1
    end,
    first_failure_at = case
      when a.first_failure_at is null or a.first_failure_at < now() - v_window
        then now()
      else a.first_failure_at
    end,
    locked_until = case
      when a.first_failure_at is null or a.first_failure_at < now() - v_window
        then null
      else a.locked_until
    end,
    updated_at = now()
  returning a.failures into v_failures;

  if v_failures >= v_threshold then
    -- Clamped so a long-running attack cannot overflow the exponent.
    v_steps := least(v_failures - v_threshold, 20);
    v_lock := now() + least(v_ceiling, v_base * (2 ^ v_steps));
    update public.gather_command_login_attempts
      set locked_until = v_lock, updated_at = now()
      where bucket = p_bucket;
  end if;

  return query select v_failures, v_lock;
end;
$$;

revoke all on function public.gather_command_login_record_failure(text)
  from public, anon, authenticated;
grant execute on function public.gather_command_login_record_failure(text)
  to service_role;

-- A correct password clears the bucket immediately.
create or replace function public.gather_command_login_reset(p_bucket text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.gather_command_login_attempts where bucket = p_bucket;
$$;

revoke all on function public.gather_command_login_reset(text)
  from public, anon, authenticated;
grant execute on function public.gather_command_login_reset(text) to service_role;
