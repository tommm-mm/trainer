-- Draft checks for coaches: the app's season guardrails and week checks as
-- SQL functions, so a coach that only has SQL (Cowork) can check a draft
-- BEFORE proposing it. Read-only (stable, security invoker): nothing is written.
--
--   select check_season_draft('<goal id>', '<SeasonDraft JSON>'::jsonb);
--     → { errors: [..], warnings: [{ week_start, code, message }] }
--   select check_week('<Monday>');
--     → [{ severity, code, days, message }] for that week's weekly_plans
--       (every status, proposed included, plus 2 days either side)
--   select check_week('<Monday>', '[{ "day": .., "session_type": .., "target_distance_km": .., "template_id": .. }]');
--     → the same for a draft week: saved non-proposed plans + the draft, nothing written
--
-- SAME RULES AS THE APP: src/lib/season/model.ts (validateSeasonDraft,
-- guardrails), src/lib/load.ts (planned load), src/lib/week-checks.ts.
-- Change one, change the other: the shared cases in
-- src/lib/checks.fixtures.json are asserted against the TS in vitest
-- (checks-parity.test.ts) and against this SQL by scripts/sql-parity.mjs.
-- Differences: load history comes from the weekly_load view (median RPE over
-- all history; the app uses the last 16 weeks).

-- A YYYY-MM-DD date or null (never an error), like isISODate().
create or replace function public.try_date(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end $$;

-- sessionKind() in src/lib/sessions.ts
create or replace function public.session_kind(t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when t in ('easy_run', 'long_run', 'tempo', 'intervals', 'recovery_run', 'race') then 'run'
    when t in ('gym_lower', 'gym_upper', 'gym_full') then 'gym'
    when t in ('bike_easy', 'swim') then 'cross'
    when t in ('mobility', 'rest') then 'other'
    when t ~* '(gym|strength|lift|weights|squat|deadlift|bench)' then 'gym'
    when t ~* '(bike|ride|cycl|spin|swim|row)' then 'cross'
    when t ~* '(run|tempo|interval|fartlek|threshold|stride|race|hill)' then 'run'
    else 'other'
  end
$$;

create or replace function public.is_quality_run(t text) returns boolean
language sql immutable set search_path = '' as $$
  select public.session_kind(t) = 'run'
     and t ~* '(tempo|interval|threshold|fartlek|vo2|race|marathon.?pace|\ymp\y)'
$$;

create or replace function public.is_long_run(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~* 'long' and public.session_kind(t) = 'run'
$$;

-- The draft's weeks, flattened in order (flattenWeeks in model.ts).
create or replace function public.draft_weeks(p_draft jsonb)
returns table (n bigint, week_start text, focus text, is_deload boolean, run_km numeric, long_run_km numeric,
               runs numeric, quality_sessions numeric, gym_sessions numeric, cross_sessions numeric,
               load_target numeric, raw jsonb)
language sql immutable set search_path = '' as $$
  select row_number() over (order by bo, wo), wk->>'week_start', bl->>'focus', coalesce((wk->>'is_deload')::boolean, false),
         case when jsonb_typeof(wk->'run_km') = 'number' then (wk->>'run_km')::numeric end,
         case when jsonb_typeof(wk->'long_run_km') = 'number' then (wk->>'long_run_km')::numeric end,
         case when jsonb_typeof(wk->'runs') = 'number' then (wk->>'runs')::numeric end,
         case when jsonb_typeof(wk->'quality_sessions') = 'number' then (wk->>'quality_sessions')::numeric end,
         case when jsonb_typeof(wk->'gym_sessions') = 'number' then (wk->>'gym_sessions')::numeric end,
         case when jsonb_typeof(wk->'cross_sessions') = 'number' then (wk->>'cross_sessions')::numeric end,
         case when jsonb_typeof(wk->'load_target') = 'number' then (wk->>'load_target')::numeric end,
         wk
  from jsonb_array_elements(case when jsonb_typeof(p_draft->'blocks') = 'array' then p_draft->'blocks' else '[]'::jsonb end)
         with ordinality as x(bl, bo),
       jsonb_array_elements(case when jsonb_typeof(bl->'weeks') = 'array' then bl->'weeks' else '[]'::jsonb end)
         with ordinality as y(wk, wo)
$$;

-- ============================================================ season draft

create or replace function public.check_season_draft(p_goal_id uuid, p_draft jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_errors text[] := '{}';
  v_warn jsonb := '[]'::jsonb;
  v_goal public.goals;
  v_limits jsonb := coalesce(p_draft->'limits', '{}'::jsonb);
  v_cal jsonb;
  b jsonb;
  w record;
  v_prev date;
  v_start date;
  v_races date[] := '{}';
  v_name text;
  v_key text;
  v_val numeric;
  v_ranges jsonb := '{"run_km":[0,300],"long_run_km":[0,100],"runs":[0,14],"quality_sessions":[0,7],
                     "gym_sessions":[0,14],"cross_sessions":[0,14],"load_target":[0,20000]}';
  -- running series (oldest first): km and load, with light / race marks
  s_km numeric[] := '{}';  s_light boolean[] := '{}';  s_race boolean[] := '{}';
  l_total numeric[] := '{}'; l_run numeric[] := '{}'; l_light boolean[] := '{}'; l_race boolean[] := '{}';
  v_streak int := 0;
  v_light boolean;
  v_race boolean;
  v_ref numeric;
  v_avg numeric;
  v_run numeric;
  v_total numeric;
  v_recent numeric[];
  i int;
  v_last date;
  c_easy_pace numeric; c_easy_rpe numeric; c_gym_min numeric; c_gym_rpe numeric;
  c_cross_min numeric; c_cross_rpe numeric; c_hiit numeric;
  v_cap record;
begin
  -- ---- structure (validateSeasonDraft)
  if coalesce(trim(p_draft->>'title'), '') = '' then v_errors := array_append(v_errors, 'The season needs a title.'); end if;
  if coalesce(p_draft->>'source', '') not in ('manual', 'rules', 'claude_code', 'claude_api', 'cowork') then
    v_errors := array_append(v_errors, format('Unknown source "%s".', p_draft->>'source'));
  end if;
  if jsonb_typeof(p_draft->'blocks') <> 'array' or jsonb_array_length(p_draft->'blocks') = 0 then
    v_errors := array_append(v_errors, 'A season needs at least one block.');
    return jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', '[]'::jsonb);
  end if;
  for b in select value from jsonb_array_elements(p_draft->'blocks') loop
    v_name := coalesce(nullif(trim(b->>'name'), ''), '(unnamed)');
    if coalesce(trim(b->>'name'), '') = '' or length(b->>'name') > 40 then
      v_errors := array_append(v_errors, format('Block "%s": name must be 1–40 characters.', v_name));
    end if;
    if coalesce(b->>'focus', '') not in ('base', 'build', 'specific', 'peak', 'taper', 'recovery', 'transition') then
      v_errors := array_append(v_errors, format('Block "%s": unknown focus "%s".', v_name, b->>'focus'));
    end if;
    if b->>'gym_focus' is not null and b->>'gym_focus' not in ('hypertrophy', 'strength', 'power', 'maintenance', 'off') then
      v_errors := array_append(v_errors, format('Block "%s": unknown gym focus "%s".', v_name, b->>'gym_focus'));
    end if;
    if jsonb_typeof(b->'weeks') <> 'array' or jsonb_array_length(b->'weeks') not between 1 and 8 then
      v_errors := array_append(v_errors, format('Block "%s": needs 1–8 weeks.', v_name));
    end if;
  end loop;

  for w in select * from public.draft_weeks(p_draft) order by n loop
    if public.try_date(w.week_start) is null or extract(isodow from public.try_date(w.week_start)) <> 1 then
      v_errors := array_append(v_errors, format('Week %s: must be a Monday (YYYY-MM-DD).', w.week_start));
      v_prev := public.try_date(w.week_start);  -- a valid date still anchors the next gap check
      continue;
    end if;
    if v_prev is not null and w.week_start::date - v_prev <> 7 then
      v_errors := array_append(v_errors, format('Week %s: weeks must follow each other with no gaps or overlaps.', w.week_start));
    end if;
    v_prev := w.week_start::date;
    for v_key in select jsonb_object_keys(v_ranges) loop
      if w.raw ? v_key and jsonb_typeof(w.raw->v_key) <> 'null' then
        if jsonb_typeof(w.raw->v_key) <> 'number'
           or (w.raw->>v_key)::numeric < (v_ranges->v_key->>0)::numeric
           or (w.raw->>v_key)::numeric > (v_ranges->v_key->>1)::numeric then
          v_errors := array_append(v_errors, format('Week %s: %s must be %s–%s.', w.week_start, v_key, v_ranges->v_key->>0, v_ranges->v_key->>1));
        end if;
      end if;
    end loop;
    if w.long_run_km is not null and w.run_km is not null and w.long_run_km > w.run_km then
      v_errors := array_append(v_errors, format('Week %s: long run is longer than the whole week.', w.week_start));
    end if;
  end loop;

  if cardinality(v_errors) > 0 then
    return jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', '[]'::jsonb);
  end if;

  -- past weeks of the approved version can't change
  for w in
    select d.week_start from public.draft_weeks(p_draft) d
    join public.season_weeks sw on sw.week_start::text = d.week_start
    join public.seasons s on s.id = sw.season_id and s.goal_id = p_goal_id and s.status = 'approved'
    where d.week_start::date < date_trunc('week', current_date)::date
      and (sw.run_km is distinct from d.run_km or sw.long_run_km is distinct from d.long_run_km
        or sw.runs is distinct from d.runs or sw.quality_sessions is distinct from d.quality_sessions
        or sw.gym_sessions is distinct from d.gym_sessions or sw.cross_sessions is distinct from d.cross_sessions
        or sw.load_target is distinct from d.load_target or sw.is_deload is distinct from d.is_deload)
  loop
    v_errors := array_append(v_errors, format('Week %s is in the past and can''t change.', w.week_start));
  end loop;

  if cardinality(v_errors) > 0 then
    return jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', '[]'::jsonb);
  end if;

  -- ---- context (the Season page's GuardrailContext)
  select * into v_goal from public.goals where id = p_goal_id;
  select min(week_start::date) into v_start from public.draft_weeks(p_draft);
  select coalesce(array_agg(date_trunc('week', (r->>'date')::date)::date), '{}') into v_races
  from jsonb_array_elements(coalesce(v_goal.params->'tune_up_races', '[]'::jsonb)) r
  where r->>'date' ~ '^\d{4}-\d{2}-\d{2}$';
  if v_goal.target_date is not null then v_races := v_races || date_trunc('week', v_goal.target_date)::date; end if;

  select load_calibration into v_cal from public.athlete_settings where user_id = v_goal.user_id;
  c_easy_pace := coalesce((v_cal->>'easy_min_per_km')::numeric, 6.3);
  c_easy_rpe := coalesce((v_cal->>'easy_rpe')::numeric, 4);
  c_gym_min := coalesce((v_cal->>'gym_min')::numeric, 70);
  c_gym_rpe := coalesce((v_cal->>'gym_rpe')::numeric, 6);
  c_cross_min := coalesce((v_cal->>'cross_min')::numeric, 40);
  c_cross_rpe := coalesce((v_cal->>'cross_rpe')::numeric, 3);
  c_hiit := coalesce((v_cal->>'hiit_week')::numeric, 0);

  -- 4 weeks before the season: actual run km and actual load (seed the ramp and ACWR)
  for i in 0..3 loop
    select coalesce(round(sum(a.distance_km)::numeric, 1), 0) into v_val from public.activities a
    where a.type = 'run' and a.date >= v_start - 28 + 7 * i and a.date < v_start - 21 + 7 * i;
    s_km := s_km || v_val; s_light := s_light || false; s_race := s_race || false;
    select coalesce(sum(l.total), 0), coalesce(sum(l.run), 0) into v_total, v_run from public.weekly_load l
    where l.week_start = v_start - 28 + 7 * i;
    l_total := l_total || v_total; l_run := l_run || v_run; l_light := l_light || false; l_race := l_race || false;
  end loop;

  -- ---- guardrails, week by week (guardrails() in model.ts)
  for w in select * from public.draft_weeks(p_draft) order by n loop
    v_light := w.is_deload or w.focus in ('taper', 'recovery', 'transition');
    v_race := w.week_start::date = any(v_races);

    -- planned load (plannedLoad in load.ts)
    v_run := round(coalesce(w.run_km, 0) * c_easy_pace * c_easy_rpe
                   + coalesce(w.quality_sessions, 0) * 25 * greatest(0, 7 - c_easy_rpe));
    v_total := coalesce(w.load_target,
      v_run
      + round(coalesce(w.gym_sessions, 0) * c_gym_min * c_gym_rpe * case when w.is_deload then 0.6 else 1 end)
      + round(case when coalesce(w.gym_sessions, 0) > 0 then c_hiit * case when w.is_deload then 0.5 else 1 end else 0 end)
      + round(coalesce(w.cross_sessions, 0) * c_cross_min * c_cross_rpe));
    if not v_light and not v_race then
      select array_agg(x order by o) into v_recent from (
        select l_run[k] x, k o from generate_subscripts(l_run, 1) k where not l_light[k] and not l_race[k]
        order by k desc limit 3) t;
      select max(x) into v_ref from unnest(v_recent) x;
      if v_ref > 0 and v_run > v_ref * 1.1 and v_run - v_ref > 100 then
        v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'load_ramp',
          'message', format('Run load %s AU is +%s%% on your recent high of %s AU (guide ≤ 10%%).',
            round(v_run), round((v_run / v_ref - 1) * 100), round(v_ref)));
      end if;
      if cardinality(l_total) >= 4 then
        select avg(x) into v_avg from unnest(l_total[cardinality(l_total) - 3:cardinality(l_total)]) x;
        if v_avg >= 300 and v_total / v_avg > 1.3 then
          v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'load_acwr',
            'message', format('Projected load ACWR %s: %s AU vs an average week of %s AU (safe 0.8–1.3).',
              to_char(v_total / v_avg, 'FM0.00'), round(v_total), round(v_avg)));
        end if;
      end if;
    end if;
    l_total := l_total || v_total; l_run := l_run || v_run; l_light := l_light || v_light; l_race := l_race || v_race;

    if w.run_km is not null and not v_light and not v_race then
      select max(x) into v_ref from (
        select s_km[k] x from generate_subscripts(s_km, 1) k where not s_light[k] and not s_race[k]
        order by k desc limit 3) t;
      if v_ref > 0 and w.run_km > v_ref * 1.1 and w.run_km - v_ref > 3 then
        v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'ramp',
          'message', format('%s km is +%s%% on your recent high of %s km (guide ≤ 10%%).',
            round(w.run_km, 1), round((w.run_km / v_ref - 1) * 100), round(v_ref, 1)));
      end if;
      if cardinality(s_km) >= 4 then
        select avg(x) into v_avg from unnest(s_km[cardinality(s_km) - 3:cardinality(s_km)]) x;
        if v_avg >= 10 and w.run_km / v_avg > 1.3 then
          v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'acwr',
            'message', format('Projected ACWR %s (this week vs the 4 before; safe 0.8–1.3).', to_char(w.run_km / v_avg, 'FM0.00')));
        end if;
      end if;
    end if;

    v_streak := case when v_light then 0 else v_streak + 1 end;
    if v_streak = 5 then
      v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'deload',
        'message', format('%s build weeks in a row without a lighter week (guide: every 3rd–4th week).', v_streak));
    end if;

    if not v_race then
      if coalesce(w.run_km, 0) > 0 and w.long_run_km > 0 and w.long_run_km / w.run_km > 0.5 then
        v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'long_share',
          'message', format('Long run %s km is %s%% of the week (plan guide ≤ 50%%).',
            round(w.long_run_km, 1), round(w.long_run_km / w.run_km * 100)));
      end if;
      for v_cap in
        select * from (values
          (w.run_km, (v_limits->>'max_week_km')::numeric, 'Weekly km'),
          (w.long_run_km, (v_limits->>'max_long_run_km')::numeric, 'Long run'),
          (w.runs, (v_limits->>'max_runs_per_week')::numeric, 'Runs'),
          (w.gym_sessions, (v_limits->>'max_gym_per_week')::numeric, 'Gym sessions')) c(val, cap, label)
        where val is not null and cap is not null and val > cap
      loop
        v_warn := v_warn || jsonb_build_object('week_start', w.week_start, 'code', 'cap',
          'message', format('%s %s is above your cap of %s.', v_cap.label, v_cap.val, v_cap.cap));
      end loop;
    end if;

    s_km := s_km || coalesce(w.run_km, 0); s_light := s_light || v_light; s_race := s_race || v_race;
  end loop;

  select max(week_start::date) into v_last from public.draft_weeks(p_draft);
  if v_goal.target_date is not null and date_trunc('week', v_goal.target_date)::date <> v_last then
    v_warn := v_warn || jsonb_build_object('week_start', v_last::text, 'code', 'race_week',
      'message', format('The season ends the week of %s, but the goal date is %s.', v_last, v_goal.target_date));
  end if;

  return jsonb_build_object('errors', '[]'::jsonb, 'warnings', v_warn);
end $$;

-- ============================================================ week checks

-- The plans check_week looks at: that week ± 2 days, not "other". Without a
-- draft: every saved plan (proposed included). With a draft (a jsonb list of
-- { day, session_type, target_distance_km?, template_id? }): the saved plans
-- that aren't `proposed`, plus the draft (a dry run: nothing is written).
create or replace function public.week_check_plans(p_monday date, p_draft jsonb default null)
returns table (day date, session_type text, km numeric, template_id uuid, kind text,
               hard boolean, quality boolean, long boolean, ord bigint)
language sql stable security invoker set search_path = '' as $$
  with src as (
    select p.day, p.session_type, p.target_distance_km as km, p.template_id,
           row_number() over (order by p.created_at, p.id) as ord
    from public.weekly_plans p
    where p.day between p_monday - 2 and p_monday + 8
      and (p_draft is null or p.status <> 'proposed')
    union all
    select (d->>'day')::date, d->>'session_type', (d->>'target_distance_km')::numeric,
           (d->>'template_id')::uuid, 1000000 + o
    from jsonb_array_elements(coalesce(p_draft, '[]'::jsonb)) with ordinality as x(d, o)
    where (d->>'day')::date between p_monday - 2 and p_monday + 8
  )
  select s.day, s.session_type, s.km, s.template_id, public.session_kind(s.session_type),
         public.is_long_run(s.session_type) or public.is_quality_run(s.session_type),
         public.is_quality_run(s.session_type), public.is_long_run(s.session_type), s.ord
  from src s
  where public.session_kind(s.session_type) <> 'other'
$$;

create or replace function public.check_week(p_monday date, p_draft jsonb default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_sunday date := p_monday + 6;
  v_out jsonb := '[]'::jsonb;
  v_focus text;
  v_target record;
  v_heavy uuid[];
  r record;
  a record;
  v_runs int; v_gym_days int; v_quality int; v_km numeric; v_all_km boolean; v_long boolean; v_maxq int;
begin
  -- the approved season week and its block's gym focus
  select sw.*, m.gym_focus into v_target
  from public.season_weeks sw
  join public.seasons s on s.id = sw.season_id and s.status = 'approved'
  join public.goals g on g.id = s.goal_id and g.status = 'active'
  join public.mesocycles m on m.id = sw.mesocycle_id
  where sw.week_start = p_monday limit 1;
  v_focus := v_target.gym_focus;

  -- leg-heaviest templates: this block's (tagged or untagged; all if none match) + any planned this week
  with t as (
    select t.id, t.gym_focus,
      coalesce(sum(te.sets) filter (where te.block = 'main' and te.target_rir is not null
        and e.primary_muscles && array['quads', 'hamstrings', 'glutes']), 0) as leg_sets
    from public.workout_templates t
    left join public.template_exercises te on te.template_id = t.id
    left join public.exercises e on e.id = te.exercise_id
    where not t.archived
    group by t.id
  ),
  inblock as (
    select * from t where v_focus is null or t.gym_focus is null or cardinality(t.gym_focus) = 0 or v_focus = any(t.gym_focus)
  ),
  pool as (
    select * from (select * from inblock union select * from t where not exists (select 1 from inblock)) x
    union select * from t where t.id in (select template_id from public.week_check_plans(p_monday, p_draft) where template_id is not null)
  )
  select coalesce(array_agg(id), '{}') into v_heavy from pool
  where leg_sets > 0 and leg_sets = (select max(leg_sets) from pool);

  -- same day
  for r in
    select day, bool_or(hard) filter (where true) as any_hard, count(*) filter (where hard) as hard_n,
           bool_or(kind = 'gym') as any_gym
    from public.week_check_plans(p_monday, p_draft) where day between p_monday and v_sunday group by day order by day
  loop
    if r.hard_n > 0 and r.any_gym then
      v_out := v_out || jsonb_build_object('severity', 'red', 'code', 'gym_hard_same_day', 'days', jsonb_build_array(r.day),
        'message', format('%s: gym and a hard run on the same day. Keep gym and hard runs on separate days.', to_char(r.day, 'Dy')));
    end if;
    if r.hard_n > 1 then
      v_out := v_out || jsonb_build_object('severity', 'red', 'code', 'hard_same_day', 'days', jsonb_build_array(r.day),
        'message', format('%s: two hard runs on the same day. Quality and long runs go on separate days.', to_char(r.day, 'Dy')));
    end if;
  end loop;

  -- spacing: pairs of days 1–2 apart touching this week
  for a in
    select d1.day as a_day, d2.day as b_day, d2.day - d1.day as gap,
      exists (select 1 from public.week_check_plans(p_monday, p_draft) x where x.day = d1.day and x.hard) as hard_a,
      exists (select 1 from public.week_check_plans(p_monday, p_draft) x where x.day = d2.day and x.hard) as hard_b,
      (select x.template_id from public.week_check_plans(p_monday, p_draft) x where x.day = d1.day and x.kind = 'gym' order by x.ord limit 1) as gym_a_tpl,
      exists (select 1 from public.week_check_plans(p_monday, p_draft) x where x.day = d1.day and x.kind = 'gym') as gym_a,
      exists (select 1 from public.week_check_plans(p_monday, p_draft) x where x.day = d2.day and x.kind = 'gym') as gym_b
    from (select distinct day from public.week_check_plans(p_monday, p_draft)) d1
    join (select distinct day from public.week_check_plans(p_monday, p_draft)) d2 on d2.day - d1.day between 1 and 2
    where d1.day between p_monday and v_sunday or d2.day between p_monday and v_sunday
    order by d1.day, d2.day
  loop
    if a.gap = 1 and a.hard_a and a.hard_b then
      v_out := v_out || jsonb_build_object('severity', 'red', 'code', 'hard_back_to_back', 'days', jsonb_build_array(a.a_day, a.b_day),
        'message', format('%s → %s: two hard runs back to back. Keep key sessions ≥ 48 h apart.', to_char(a.a_day, 'Dy'), to_char(a.b_day, 'Dy')));
    end if;
    if a.gym_a and a.hard_b and a.gym_a_tpl = any(v_heavy) then
      v_out := v_out || jsonb_build_object('severity', case when a.gap = 1 then 'red' else 'amber' end, 'code', 'legs_before_hard',
        'days', jsonb_build_array(a.a_day, a.b_day),
        'message', format('%s: your leg-heaviest gym session %s %s''s hard run. Keep it out of the 48 h before key runs.',
          to_char(a.a_day, 'Dy'), case when a.gap = 1 then 'the day before' else '2 days before' end, to_char(a.b_day, 'Dy')));
    end if;
    if a.gap = 1 and a.gym_a and a.gym_b then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'gym_back_to_back', 'days', jsonb_build_array(a.a_day, a.b_day),
        'message', format('%s and %s: gym on consecutive days. Leave ≥ 48 h between full-body sessions.', to_char(a.a_day, 'Dy'), to_char(a.b_day, 'Dy')));
    end if;
  end loop;

  -- totals vs the season week
  if v_target.week_start is not null then
    select count(*) filter (where kind = 'run'),
           count(distinct day) filter (where kind = 'gym'),
           count(*) filter (where quality),
           coalesce(sum(km) filter (where kind = 'run'), 0),
           count(*) filter (where kind = 'run') > 0 and bool_and(km is not null) filter (where kind = 'run'),
           bool_or(long) filter (where kind = 'run')
      into v_runs, v_gym_days, v_quality, v_km, v_all_km, v_long
    from public.week_check_plans(p_monday, p_draft) where day between p_monday and v_sunday;
    if v_target.gym_sessions is not null and v_gym_days < v_target.gym_sessions then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'gym_count', 'days', '[]'::jsonb,
        'message', format('%s gym sessions planned, the block calls for %s. Reschedule rather than drop.', v_gym_days, v_target.gym_sessions));
    end if;
    if v_target.runs is not null and v_runs > v_target.runs then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'runs_count', 'days', '[]'::jsonb,
        'message', format('%s runs planned, the season week has %s.', v_runs, v_target.runs));
    end if;
    v_maxq := least(2, coalesce(v_target.quality_sessions, 2));
    if v_quality > v_maxq then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'quality_count', 'days', '[]'::jsonb,
        'message', format('%s quality sessions planned, max %s this week.', v_quality, v_maxq));
    end if;
    if coalesce(v_target.long_run_km, 0) > 0 and v_runs > 0 and not coalesce(v_long, false) then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'long_run', 'days', '[]'::jsonb,
        'message', format('No long run planned (target %s km).', v_target.long_run_km));
    end if;
    if coalesce(v_target.run_km, 0) > 0 and coalesce(v_all_km, false) and abs(v_km - v_target.run_km) > v_target.run_km * 0.1 then
      v_out := v_out || jsonb_build_object('severity', 'amber', 'code', 'km', 'days', '[]'::jsonb,
        'message', format('%s km planned vs %s km in the season week (±10%%).', round(v_km, 1), v_target.run_km));
    end if;
  end if;

  -- red first
  select coalesce(jsonb_agg(x order by (x->>'severity') <> 'red', o), '[]'::jsonb) into v_out
  from jsonb_array_elements(v_out) with ordinality as t(x, o);
  return v_out;
end $$;
