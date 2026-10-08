-- Quick check-in + read-only views for coaches.
--
-- 1. checkins.calf_score (0 = nothing, 1 = I feel them, 2 = tight / sore,
--    3 = it limits me) and checkins.niggle (one body area). The Week View's
--    10-second check-in writes them; a score ≥ 2 or a niggle opens a `niggle`
--    flag for that day (app code, src/lib/checkin.ts).
-- 2. weekly_muscle_sets: hard sets per muscle per ISO week, same rule as the
--    app (src/lib/strength.ts): main-block working sets in reps, ≥ 1 rep,
--    RIR ≤ 4 or unrated; primary muscles × 1, secondary × 0.5.
-- 3. easy_runs: every easy run with pace, HR, HR reserve, Efficiency Factor
--    and pace at 65% HRR (src/lib/metrics.ts): easy = RPE ≤ 4, or unrated with
--    HRR ≤ 75%. Anchors from athlete_settings (defaults 46 / 195).

alter table public.checkins
  add column calf_score smallint check (calf_score between 0 and 3),
  add column niggle text check (niggle in
    ('calves', 'achilles', 'shins', 'knee', 'hip', 'hamstrings', 'quads', 'foot', 'lower_back', 'other'));

create view public.weekly_muscle_sets with (security_invoker = true) as
with hard as (
  select w.user_id, date_trunc('week', w.date)::date as week_start, e.primary_muscles, e.secondary_muscles,
         count(*)::numeric as sets
  from public.workouts w
  join public.workout_exercises we on we.workout_id = w.id
  join public.exercises e on e.id = we.exercise_id
  join public.workout_sets s on s.workout_exercise_id = we.id
  where w.status = 'completed' and we.block = 'main' and e.measure = 'reps'
    and not s.is_warmup and s.reps >= 1 and (s.rir is null or s.rir <= 4)
  group by 1, 2, 3, 4, we.id
)
select user_id, week_start, muscle, sum(sets * weight) as hard_sets
from (
  select user_id, week_start, unnest(primary_muscles) as muscle, sets, 1.0 as weight from hard
  union all
  select user_id, week_start, unnest(secondary_muscles), sets, 0.5 from hard
) x
group by user_id, week_start, muscle;

create view public.easy_runs with (security_invoker = true) as
with r as (
  select a.user_id, a.id, a.date, a.name, a.distance_km::numeric as km, a.duration_min::numeric as minutes,
         a.avg_hr::numeric as avg_hr, a.rpe,
         coalesce(s.rest_hr, 46)::numeric as rest_hr, coalesce(s.max_hr, 195)::numeric as max_hr
  from public.activities a
  left join public.athlete_settings s on s.user_id = a.user_id
  where a.type = 'run' and a.avg_hr > 0 and a.distance_km > 0 and a.duration_min > 0
),
x as (
  select r.*, greatest(0, least(1, (avg_hr - rest_hr) / (max_hr - rest_hr))) as hrr,
         rest_hr + 0.65 * (max_hr - rest_hr) as ref_hr
  from r
)
select user_id, id, date, date_trunc('week', date)::date as week_start, name, km, minutes,
       round(minutes * 60 / km) as pace_s_per_km, avg_hr, rpe, round(hrr, 3) as hrr,
       round(km * 1000 / minutes / avg_hr, 3) as ef,
       case when avg_hr > rest_hr
            then round(1000 / ((km * 1000 / minutes) * (ref_hr - rest_hr) / (avg_hr - rest_hr)) * 60)
       end as pace_at_65_hrr_s_per_km
from x
where (rpe is not null and rpe <= 4) or (rpe is null and hrr <= 0.75);
