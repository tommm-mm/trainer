-- race_prediction_inputs: + planned_test (the plan scheduled a race / time trial / test that day,
-- not a threshold test, and this is the day's longest run), counted as race_like when run at
-- ≥ 80 % HRR. Same rule as isPlannedTest / isRaceLike in src/lib/race-predict.ts.
-- (16 Oct 2026: his 5 km time trial, 88 % HRR, was missed by the HR-only rule.)

create or replace view public.race_prediction_inputs with (security_invoker = true) as
with r as (
  select a.user_id, a.date, a.name, a.distance_km::numeric as km, a.duration_min::numeric as minutes,
         a.avg_hr::numeric as avg_hr,
         coalesce(s.rest_hr, 46)::numeric as rest_hr, coalesce(s.max_hr, 195)::numeric as max_hr,
         row_number() over (partition by a.user_id, a.date order by a.distance_km desc) as nth_longest
  from public.activities a
  left join public.athlete_settings s on s.user_id = a.user_id
  where a.type = 'run' and a.avg_hr > 0 and a.distance_km > 0 and a.duration_min > 0
),
tests as (
  select distinct p.user_id, p.day
  from public.weekly_plans p
  where p.status <> 'proposed'
    and (p.session_type || ' ' || coalesce(p.notes, '')) ~* '(time[ -]?trial|\mtt\M|\mrace\M|\mgara\M|\mtest\M)'
    and (p.session_type || ' ' || coalesce(p.notes, '')) !~* '(threshold|soglia|lthr)'
),
x as (
  select r.*,
         (avg_hr - rest_hr) / (max_hr - rest_hr) as hrr,
         km * 1000 / minutes as v,
         (r.nth_longest = 1 and exists (select 1 from tests t where t.user_id = r.user_id and t.day = r.date)) as planned
  from r
),
y as (
  select x.*,
         -4.60 + 0.182258 * v + 0.000104 * v * v as vo2,
         0.8 + 0.1894393 * exp(-0.012778 * minutes) + 0.2989558 * exp(-0.1932605 * minutes) as share
  from x
)
select user_id, date, name,
       round(km, 2) as km,
       round(minutes, 1) as minutes,
       round(minutes * 60 / km) as pace_s_km,
       avg_hr,
       round(hrr, 3) as hrr,
       case when km >= 3 and minutes >= 15 and v between 120 and 400 and hrr between 0.5 and 0.97
            then round((vo2 - 3.5) / hrr + 3.5, 1) end as run_vdot,
       (hrr between 0.6 and 0.72) as easy,
       (km >= 5 and ((planned and hrr >= 0.8)
                     or name ~* '\m(gara|race|half|mezza|maratona|marathon|maratonina|10 ?k|5 ?k|21 ?k|parkrun|time ?trial|tt)\M'
                     or hrr >= share - 0.04)) as race_like,
       round(vo2 / share, 1) as race_vdot,
       planned as planned_test
from y;
