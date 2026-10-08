-- Run detail (src/lib/run-detail.ts), filled by the Garmin sync from the
-- intervals.icu streams and intervals, newest runs first:
--   { splits: [{ km, s, hr }], decoupling: % | null, laps: [{ n, km, s, hr, max_hr, label, work }] | null }
-- NULL = not fetched yet; {} = the run has no streams.
-- decoupling = Friel's aerobic decoupling (EF first half vs second half of
-- the moving time, runs ≥ 40′): < 5% = coupled, ≥ 5% = HR drifted up.

alter table public.activities add column run_detail jsonb;

-- One row per run with detail; pace in s/km.
create view public.run_details with (security_invoker = true) as
select a.user_id, a.id, a.date, date_trunc('week', a.date)::date as week_start, a.name, a.distance_km as km,
       a.avg_hr, a.rpe, (a.run_detail->>'decoupling')::numeric as decoupling,
       jsonb_array_length(coalesce(a.run_detail->'splits', '[]'::jsonb)) as splits,
       jsonb_array_length(case when jsonb_typeof(a.run_detail->'laps') = 'array' then a.run_detail->'laps' else '[]'::jsonb end) as laps
from public.activities a
where a.type = 'run' and a.run_detail is not null and a.run_detail <> '{}'::jsonb;

-- Every km split and every lap of every run, one row each.
create view public.run_splits with (security_invoker = true) as
select a.user_id, a.id as activity_id, a.date, a.name, 'split' as kind, (x->>'km')::numeric as n,
       null::numeric as km, (x->>'s')::int as seconds, (x->>'hr')::int as hr, null::int as max_hr,
       null::text as label, null::boolean as work,
       round((x->>'s')::numeric / nullif(case when (x->>'km')::numeric % 1 = 0 then 1
                                               else (x->>'km')::numeric % 1 end, 0)) as pace_s_per_km
from public.activities a, jsonb_array_elements(coalesce(a.run_detail->'splits', '[]'::jsonb)) x
where a.type = 'run'
union all
select a.user_id, a.id, a.date, a.name, 'lap', (x->>'n')::numeric, (x->>'km')::numeric, (x->>'s')::int, (x->>'hr')::int,
       (x->>'max_hr')::int, x->>'label', (x->>'work')::boolean,
       round((x->>'s')::numeric / nullif((x->>'km')::numeric, 0))
from public.activities a,
     jsonb_array_elements(case when jsonb_typeof(a.run_detail->'laps') = 'array' then a.run_detail->'laps' else '[]'::jsonb end) x
where a.type = 'run';
