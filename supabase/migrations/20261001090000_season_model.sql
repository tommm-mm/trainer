-- Phase C1 — Season model: goal → season (macrocycle) → mesocycles → weeks.
-- Additive only. A season is versioned: every change from a coach (rules,
-- Claude, Cowork) is a new `proposed` version; nothing applies until you
-- approve it, which supersedes the previous approved version in one step.

-- ============================================================ seasons
create table public.seasons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  goal_id        uuid not null references public.goals(id) on delete cascade,
  version        smallint not null check (version >= 1),
  status         text not null default 'proposed'
                 check (status in ('proposed','approved','superseded','rejected')),
  -- Who wrote it. Only you can approve, whoever wrote it.
  source         text not null default 'manual'
                 check (source in ('manual','rules','claude_code','claude_api','cowork')),
  title          text not null check (length(trim(title)) between 1 and 80),
  rationale      text,
  -- Your caps, checked by the guardrails: max_runs_per_week, max_week_km,
  -- max_long_run_km, max_gym_per_week.
  limits         jsonb not null default '{}'::jsonb,
  supersedes_id  uuid references public.seasons(id) on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  unique (goal_id, version)
);
-- One approved and at most one open proposal per goal.
create unique index seasons_one_approved on public.seasons (goal_id) where status = 'approved';
create unique index seasons_one_proposed on public.seasons (goal_id) where status = 'proposed';

-- ============================================================ mesocycles (blocks)
create table public.mesocycles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  season_id     uuid not null references public.seasons(id) on delete cascade,
  position      smallint not null,
  name          text not null check (length(trim(name)) between 1 and 40),
  -- Periodization vocabulary that works for any goal (race, strength, body comp).
  focus         text not null
                check (focus in ('base','build','specific','peak','taper','recovery','transition')),
  gym_focus     text check (gym_focus in ('hypertrophy','strength','power','maintenance','off')),
  purpose       text,
  key_sessions  text,
  unique (season_id, position)
);

-- ============================================================ weekly targets
-- What the week generator (C2) and the Week View read. Dates of a block are
-- the span of its weeks.
create table public.season_weeks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  season_id         uuid not null references public.seasons(id) on delete cascade,
  mesocycle_id      uuid not null references public.mesocycles(id) on delete cascade,
  week_start        date not null check (extract(isodow from week_start) = 1),
  is_deload         boolean not null default false,
  run_km            numeric(5,1) check (run_km between 0 and 300),
  long_run_km       numeric(4,1) check (long_run_km between 0 and 100),
  runs              smallint check (runs between 0 and 14),
  quality_sessions  smallint check (quality_sessions between 0 and 7),
  gym_sessions      smallint check (gym_sessions between 0 and 14),
  -- Easy aerobic time off your feet (exercise bike, swim), for recovery.
  cross_sessions    smallint check (cross_sessions between 0 and 14),
  key_session       text,
  -- A test or race inside the plan ("5 km time trial · Sat 31 Oct").
  milestone         text,
  notes             text,
  unique (season_id, week_start),
  check (long_run_km is null or run_km is null or long_run_km <= run_km)
);
create index on public.season_weeks (mesocycle_id);

do $$
declare t text;
begin
  foreach t in array array['seasons','mesocycles','season_weeks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ============================================================ write contract
-- The only way a coach writes a season: one JSON draft, inserted atomically as
-- the next `proposed` version. An older open proposal is superseded.
-- Rows take their owner from the goal, so a coach connected with the service
-- role (Cowork via the Supabase connector) writes the same proposal the app
-- would; from the app, RLS only lets you see (and so propose for) your goals.
-- Draft: { title, source, rationale?, limits?, blocks: [{ name, focus,
--   gym_focus?, purpose?, key_sessions?, weeks: [{ week_start, is_deload?,
--   run_km?, long_run_km?, runs?, quality_sessions?, gym_sessions?,
--   key_session?, milestone?, notes? }] }] }
-- Guardrails (ramp, deloads, ACWR, caps) run in the app before this call.
create or replace function public.create_season_proposal(p_goal_id uuid, p_draft jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season uuid;
  v_block uuid;
  v_user uuid;
  v_version smallint;
  v_approved uuid;
  b jsonb;
  w jsonb;
  b_pos int;
begin
  -- Serialize writers for this goal (RLS: only your own goal is visible).
  select user_id into v_user from public.goals where id = p_goal_id for update;
  if not found then raise exception 'Goal not found'; end if;
  if jsonb_array_length(coalesce(p_draft->'blocks', '[]'::jsonb)) = 0 then
    raise exception 'A season needs at least one block';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.seasons where goal_id = p_goal_id;
  select id into v_approved from public.seasons where goal_id = p_goal_id and status = 'approved';

  update public.seasons set status = 'superseded', decided_at = now()
   where goal_id = p_goal_id and status = 'proposed';

  insert into public.seasons (user_id, goal_id, version, status, source, title, rationale, limits, supersedes_id)
  values (v_user, p_goal_id, v_version, 'proposed',
          coalesce(p_draft->>'source', 'manual'),
          p_draft->>'title',
          p_draft->>'rationale',
          coalesce(p_draft->'limits', '{}'::jsonb),
          v_approved)
  returning id into v_season;

  for b, b_pos in select value, ordinality from jsonb_array_elements(p_draft->'blocks') with ordinality loop
    if jsonb_array_length(coalesce(b->'weeks', '[]'::jsonb)) = 0 then
      raise exception 'Block % has no weeks', b->>'name';
    end if;
    insert into public.mesocycles (user_id, season_id, position, name, focus, gym_focus, purpose, key_sessions)
    values (v_user, v_season, b_pos, b->>'name', b->>'focus', b->>'gym_focus', b->>'purpose', b->>'key_sessions')
    returning id into v_block;

    for w in select value from jsonb_array_elements(b->'weeks') loop
      insert into public.season_weeks (user_id, season_id, mesocycle_id, week_start, is_deload, run_km,
        long_run_km, runs, quality_sessions, gym_sessions, cross_sessions, key_session, milestone, notes)
      values (v_user, v_season, v_block, (w->>'week_start')::date,
        coalesce((w->>'is_deload')::boolean, false),
        (w->>'run_km')::numeric, (w->>'long_run_km')::numeric,
        (w->>'runs')::smallint, (w->>'quality_sessions')::smallint, (w->>'gym_sessions')::smallint,
        (w->>'cross_sessions')::smallint, w->>'key_session', w->>'milestone', w->>'notes');
    end loop;
  end loop;

  return v_season;
end $$;

-- Approving swaps versions in one transaction: the old approved version
-- becomes `superseded` (kept for history), the proposal becomes `approved`.
create or replace function public.approve_season(p_season_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_goal uuid;
begin
  select goal_id into v_goal from public.seasons
   where id = p_season_id and status = 'proposed' for update;
  if not found then raise exception 'Only a proposed season can be approved'; end if;

  update public.seasons set status = 'superseded', decided_at = now()
   where goal_id = v_goal and status = 'approved';
  update public.seasons set status = 'approved', decided_at = now()
   where id = p_season_id;
end $$;

alter publication supabase_realtime add table public.seasons, public.season_weeks;

-- ============================================================ cross-training
-- Garmin rides (incl. indoor bike) and swims were skipped by the sync; they
-- now land as `cross`: load counts, run km doesn't.
alter table public.activities drop constraint activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('run','gym','cardio','cross'));
