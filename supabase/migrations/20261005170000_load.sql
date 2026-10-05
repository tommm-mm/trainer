-- Step L · Load = volume × intensity.
-- 1. activities: HR histogram per run / bike / swim (seconds at each bpm), so
--    time in zones re-bins when a test changes the zones.
-- 2. season_weeks.load_target: planned load (sRPE AU); null = the estimate.
-- 3. athlete_settings: one row per user with the HR anchors, the threshold HR
--    from a test and the planned-load calibration. The sync keeps rest/max and
--    the calibration fresh; only you set the threshold (in the app).
-- 4. create_season_proposal writes load_target.
-- 5. Read-only views for the app and Cowork: session_loads, weekly_load,
--    weekly_zones, season_week_load. Same formulas as src/lib/metrics.ts,
--    src/lib/zones.ts and src/lib/load.ts.

-- ============================================================ 1. HR histogram
-- hr_hist[i] = seconds at (hr_hist_min + i - 1) bpm. '{}' = the stream had no HR
-- (so the sync doesn't fetch it again); null = not fetched yet.
alter table public.activities
  add column hr_hist_min smallint check (hr_hist_min between 30 and 250),
  add column hr_hist integer[];

-- ============================================================ 2. planned load
alter table public.season_weeks
  add column load_target integer check (load_target between 0 and 20000);

-- ============================================================ 3. settings
create table public.athlete_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  rest_hr           smallint not null default 46 check (rest_hr between 25 and 120),
  max_hr            smallint not null default 195 check (max_hr between 120 and 250),
  rest_source       text not null default 'default',
  max_source        text not null default 'default',
  -- From a threshold test (avg HR of the last 20′ of a 30′ effort); re-centres the zones.
  threshold_hr      smallint check (threshold_hr between 100 and 230),
  threshold_date    date,
  -- LoadCalibration (src/lib/load.ts): easy_min_per_km, easy_rpe, gym_min,
  -- gym_rpe, cross_min, cross_rpe, hiit_week, weeks.
  load_calibration  jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  check (rest_hr < max_hr)
);

alter table public.athlete_settings enable row level security;
create policy "owner full access" on public.athlete_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================ 4. write contract
-- Same as in 20261001090000_season_model.sql, plus weeks[].load_target.
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
        long_run_km, runs, quality_sessions, gym_sessions, cross_sessions, load_target, key_session, milestone, notes)
      values (v_user, v_season, v_block, (w->>'week_start')::date,
        coalesce((w->>'is_deload')::boolean, false),
        (w->>'run_km')::numeric, (w->>'long_run_km')::numeric,
        (w->>'runs')::smallint, (w->>'quality_sessions')::smallint, (w->>'gym_sessions')::smallint,
        (w->>'cross_sessions')::smallint, round((w->>'load_target')::numeric)::integer,
        w->>'key_session', w->>'milestone', w->>'notes');
    end loop;
  end loop;

  return v_season;
end $$;

-- ============================================================ 5. views
-- security_invoker: the views see what the caller's RLS lets them see.

-- Anchors and zone cut-offs per user (defaults until the first sync).
-- Cuts = lower bpm of easy, marathon, threshold, VO₂ (65 / 75 / 84 / 90% HRR),
-- every edge scaled so 84% lands on a measured threshold HR (src/lib/zones.ts).
create view public.hr_zone_cuts with (security_invoker = true) as
select s.user_id, s.rest_hr, s.max_hr, s.threshold_hr, s.threshold_date,
       round(s.rest_hr + least(1, 0.65 * k) * (s.max_hr - s.rest_hr))::int as easy_from,
       round(s.rest_hr + least(1, 0.75 * k) * (s.max_hr - s.rest_hr))::int as marathon_from,
       round(s.rest_hr + least(1, 0.84 * k) * (s.max_hr - s.rest_hr))::int as threshold_from,
       round(s.rest_hr + least(1, 0.90 * k) * (s.max_hr - s.rest_hr))::int as vo2_from
from public.athlete_settings s
cross join lateral (
  select case when s.threshold_hr > s.rest_hr and s.threshold_hr < s.max_hr
              then (s.threshold_hr - s.rest_hr)::numeric / (s.max_hr - s.rest_hr) / 0.84
              else 1::numeric end as k
) z;

-- Load per session: Garmin activities plus logged workouts not linked to one.
-- RPE when missing: runs and bike/swim from HR (15 × HRR − 6), else your
-- median entered RPE for the type (all history), else 5.
create view public.session_loads with (security_invoker = true) as
with src as (
  select a.user_id, a.id, a.date, a.type, a.name, a.duration_min::numeric as minutes, a.avg_hr, a.rpe::numeric as rpe
  from public.activities a
  where a.duration_min > 0
  union all
  select w.user_id, w.id, w.date, 'gym', 'Logged workout',
         round(extract(epoch from (w.finished_at - w.started_at)) / 60)::numeric, null, w.session_rpe::numeric
  from public.workouts w
  where w.status = 'completed' and w.activity_id is null and w.finished_at > w.started_at
),
medians as (
  select user_id, type, percentile_cont(0.5) within group (order by rpe)::numeric as rpe
  from src where rpe is not null group by user_id, type
),
rated as (
  select src.*,
    case
      when src.rpe is not null then src.rpe
      when src.type in ('run', 'cross') and src.avg_hr is not null then
        greatest(1, least(10, round(15 * greatest(0, least(1,
          (src.avg_hr - coalesce(s.rest_hr, 46))::numeric / (coalesce(s.max_hr, 195) - coalesce(s.rest_hr, 46))
        )) - 6)))
      when m.rpe is not null then m.rpe
      else 5
    end as session_rpe,
    case
      when src.rpe is not null then 'entered'
      when src.type in ('run', 'cross') and src.avg_hr is not null then 'hr'
      when m.rpe is not null then 'median'
      else 'default'
    end as rpe_source
  from src
  left join public.athlete_settings s on s.user_id = src.user_id
  left join medians m on m.user_id = src.user_id and m.type = src.type
)
select user_id, id, date, date_trunc('week', date)::date as week_start, type,
       case type when 'run' then 'run' when 'cardio' then 'hiit' when 'cross' then 'cross' else 'gym' end as load_type,
       name, minutes, session_rpe as rpe, rpe_source, minutes * session_rpe as load
from rated;

-- Load per ISO week by type (AU). estimated_share = load whose RPE was estimated.
create view public.weekly_load with (security_invoker = true) as
select user_id, week_start,
       round(coalesce(sum(load) filter (where load_type = 'run'), 0))::int as run,
       round(coalesce(sum(load) filter (where load_type = 'gym'), 0))::int as gym,
       round(coalesce(sum(load) filter (where load_type = 'hiit'), 0))::int as hiit,
       round(coalesce(sum(load) filter (where load_type = 'cross'), 0))::int as cross_training,
       round(sum(load))::int as total,
       round(coalesce(sum(load) filter (where rpe_source <> 'entered'), 0) / nullif(sum(load), 0), 2) as estimated_share
from public.session_loads
group by user_id, week_start;

-- Minutes in each HR zone per ISO week (runs + bike/swim), the three 80/20
-- bands and the easy share. missing = sessions without an HR stream yet.
create view public.weekly_zones with (security_invoker = true) as
with acts as (
  select a.user_id, a.id, date_trunc('week', a.date)::date as week_start, a.hr_hist_min, a.hr_hist
  from public.activities a
  where a.type in ('run', 'cross')
),
secs as (
  select a.user_id, a.week_start,
         (bpm >= c.easy_from)::int + (bpm >= c.marathon_from)::int
           + (bpm >= c.threshold_from)::int + (bpm >= c.vo2_from)::int as zone,
         h.s
  from acts a
  join public.hr_zone_cuts c on c.user_id = a.user_id
  cross join lateral unnest(a.hr_hist) with ordinality as h(s, i)
  cross join lateral (select a.hr_hist_min + h.i::int - 1 as bpm) b
  where a.hr_hist_min is not null
),
z as (
  select user_id, week_start,
         coalesce(sum(s) filter (where zone = 0), 0) as z0,
         coalesce(sum(s) filter (where zone = 1), 0) as z1,
         coalesce(sum(s) filter (where zone = 2), 0) as z2,
         coalesce(sum(s) filter (where zone = 3), 0) as z3,
         coalesce(sum(s) filter (where zone = 4), 0) as z4
  from secs group by user_id, week_start
),
weeks as (
  select user_id, week_start,
         count(*) filter (where hr_hist_min is null or coalesce(cardinality(hr_hist), 0) = 0) as missing
  from acts group by user_id, week_start
)
select w.user_id, w.week_start,
       round(coalesce(z.z0, 0) / 60.0, 1) as recovery_min,
       round(coalesce(z.z1, 0) / 60.0, 1) as easy_min,
       round(coalesce(z.z2, 0) / 60.0, 1) as marathon_min,
       round(coalesce(z.z3, 0) / 60.0, 1) as threshold_min,
       round(coalesce(z.z4, 0) / 60.0, 1) as vo2_min,
       round(coalesce(z.z0 + z.z1, 0) / 60.0, 1) as band_easy_min,
       round(coalesce(z.z2, 0) / 60.0, 1) as band_moderate_min,
       round(coalesce(z.z3 + z.z4, 0) / 60.0, 1) as band_hard_min,
       round((z.z0 + z.z1)::numeric / nullif(z.z0 + z.z1 + z.z2 + z.z3 + z.z4, 0), 3) as easy_share,
       w.missing
from weeks w
left join z on z.user_id = w.user_id and z.week_start = w.week_start;

-- Planned load per season week: the estimate from the targets and your
-- calibration (src/lib/load.ts), the coach's load_target, and what counts.
create view public.season_week_load with (security_invoker = true) as
with c as (
  select s.user_id,
         coalesce((s.load_calibration->>'easy_min_per_km')::numeric, 6.3) as easy_min_per_km,
         coalesce((s.load_calibration->>'easy_rpe')::numeric, 4) as easy_rpe,
         coalesce((s.load_calibration->>'gym_min')::numeric, 70) as gym_min,
         coalesce((s.load_calibration->>'gym_rpe')::numeric, 6) as gym_rpe,
         coalesce((s.load_calibration->>'cross_min')::numeric, 40) as cross_min,
         coalesce((s.load_calibration->>'cross_rpe')::numeric, 3) as cross_rpe,
         coalesce((s.load_calibration->>'hiit_week')::numeric, 0) as hiit_week
  from public.athlete_settings s
),
e as (
  select w.id, w.user_id, w.season_id, w.week_start, w.is_deload, w.load_target,
    round(coalesce(w.run_km, 0) * c.easy_min_per_km * c.easy_rpe
          + coalesce(w.quality_sessions, 0) * 25 * greatest(0, 7 - c.easy_rpe))::int as run,
    round(coalesce(w.gym_sessions, 0) * c.gym_min * c.gym_rpe * case when w.is_deload then 0.6 else 1 end)::int as gym,
    round(case when coalesce(w.gym_sessions, 0) > 0
               then c.hiit_week * case when w.is_deload then 0.5 else 1 end else 0 end)::int as hiit,
    round(coalesce(w.cross_sessions, 0) * c.cross_min * c.cross_rpe)::int as cross_training
  from public.season_weeks w
  join c on c.user_id = w.user_id
)
select e.id as season_week_id, e.user_id, e.season_id, s.status as season_status, e.week_start, e.is_deload,
       e.run, e.gym, e.hiit, e.cross_training,
       e.run + e.gym + e.hiit + e.cross_training as estimate,
       e.load_target,
       coalesce(e.load_target, e.run + e.gym + e.hiit + e.cross_training) as planned,
       case when e.load_target is null then 'estimate' else 'target' end as planned_source
from e
join public.seasons s on s.id = e.season_id;

alter publication supabase_realtime add table public.athlete_settings;
