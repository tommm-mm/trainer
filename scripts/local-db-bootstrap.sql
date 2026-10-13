-- Local stand-in for Supabase (scripts/local-db.sh): roles, auth, vault, cron, net
-- + the base tables that predate the first migration, without the columns migrations add.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth; create schema vault; create schema cron; create schema net; create schema extensions;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table vault.secrets (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true);
create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, start_time timestamptz);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
create table net._http_response (id bigserial primary key, status_code int, created timestamptz default now());
create function net.http_get(url text, headers jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
grant usage on schema public, auth to anon, authenticated;

create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), date date not null, type text not null constraint activities_type_check check (type in ('run','gym','cardio','cross','other')), distance_km numeric, duration_min numeric, avg_pace text, avg_hr smallint, max_hr smallint, elevation_m numeric, rpe smallint, source text not null default 'manual', external_id text, created_at timestamptz not null default now(), name text, feeling_score smallint, feedback_notes text, feedback_at timestamptz, unique (user_id, external_id));
create table public.body_metrics (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), date date not null, weight_kg numeric, body_fat_pct numeric, notes text, created_at timestamptz not null default now());
create table public.checkins (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), date date not null, feeling_text text, feeling_score smallint, sleep_hours numeric, soreness smallint, stress smallint, notes text, created_at timestamptz not null default now());
create table public.flags (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), date date not null, type text not null, description text not null, resolved boolean not null default false, created_at timestamptz not null default now());
create table public.goals (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), goal_type text not null default 'marathon', title text not null default 'Goal',  -- defaults: stub only (scripts/sql-parity.mjs inserts bare goals)
  target_date date, status text not null default 'active', phase text, build_week_number integer, deload_week boolean not null default false, params jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.weekly_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), week_start_date date not null, day date not null, session_type text not null, target_distance_km numeric, target_sets smallint, notes text, status text not null default 'proposed', created_at timestamptz not null default now(), goal_id uuid references public.goals(id));
create table public.gym_sessions (id uuid primary key);

-- Supabase's default grants (RLS does the real gating).
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
