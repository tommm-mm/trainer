-- Marathon prediction inputs for coaches (Cowork). Read-only, security_invoker.
--
-- race_prediction_inputs: every run with HR, with the numbers the app's prediction
-- uses (src/lib/race-predict.ts; the prediction itself is computed in the app):
--   pace_s_km   duration / distance
--   hrr         heart-rate reserve (Karvonen) on athlete_settings anchors (defaults 46 / 195)
--   run_vdot    HR-based VDOT: (VO₂ of the pace − 3.5) / HRR + 3.5, VO₂ of the pace from
--               Daniels–Gilbert (−4.60 + 0.182258 v + 0.000104 v², v in m/min);
--               only for ≥ 3 km, ≥ 15′, 2:30–8:20 /km, HRR 50–97 %
--   easy        HRR 60–72 %: the runs the fitness value is the median of (6 weeks)
--   race_like   named like a race, or HRR ≥ Daniels' sustainable %VO₂max for its
--               duration − 4 points (0.8 + 0.1894393 e^(−0.012778 t) + 0.2989558 e^(−0.1932605 t))
--   race_vdot   Daniels–Gilbert VDOT of the run as a race (meaningful when race_like)

create view public.race_prediction_inputs with (security_invoker = true) as
with r as (
  select a.user_id, a.date, a.name, a.distance_km::numeric as km, a.duration_min::numeric as minutes,
         a.avg_hr::numeric as avg_hr,
         coalesce(s.rest_hr, 46)::numeric as rest_hr, coalesce(s.max_hr, 195)::numeric as max_hr
  from public.activities a
  left join public.athlete_settings s on s.user_id = a.user_id
  where a.type = 'run' and a.avg_hr > 0 and a.distance_km > 0 and a.duration_min > 0
),
x as (
  select r.*,
         (avg_hr - rest_hr) / (max_hr - rest_hr) as hrr,
         km * 1000 / minutes as v
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
       (km >= 5 and (name ~* '\m(gara|race|half|mezza|maratona|marathon|maratonina|10 ?k|5 ?k|21 ?k|parkrun|time ?trial|tt)\M'
                     or hrr >= share - 0.04)) as race_like,
       round(vo2 / share, 1) as race_vdot
from y;
