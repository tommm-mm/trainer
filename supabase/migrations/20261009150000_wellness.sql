-- Garmin wellness via intervals.icu (W): one row per day, refreshed by every
-- sync (last 14 days; 120 on the first run). Recovery signals in the app:
-- src/lib/recovery.ts (they warn, never change the plan).

create table public.wellness (
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date         date not null,
  resting_hr   smallint check (resting_hr between 25 and 120),
  hrv          numeric(5,1) check (hrv between 5 and 300),        -- ms, Garmin overnight (rMSSD)
  sleep_s      integer check (sleep_s between 0 and 86400),
  sleep_score  smallint check (sleep_score between 0 and 100),
  vo2max       numeric(4,1) check (vo2max between 20 and 95),
  ctl          numeric(5,1),                                      -- intervals.icu fitness
  atl          numeric(5,1),                                      -- intervals.icu fatigue
  readiness    smallint check (readiness between 0 and 100),
  steps        integer check (steps between 0 and 200000),
  updated_at   timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.wellness enable row level security;
create policy "owner full access" on public.wellness for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.wellness;

-- Per day: the 7-day means and the 28-day baseline before them (same windows
-- as recovery.ts). Signals in the app: HRV 7d < base − 0.5 SD, resting HR
-- 7d ≥ base + 5, sleep < 6 h on 2 of the last 3 nights.
create view public.wellness_trend with (security_invoker = true) as
select w.user_id, w.date, w.resting_hr, w.hrv, round(w.sleep_s / 3600.0, 1) as sleep_h, w.sleep_score, w.vo2max, w.ctl, w.atl,
       r.hrv_7d, b.hrv_base, b.hrv_base_sd, r.rhr_7d, b.rhr_base, r.days_7d, b.days_base
from public.wellness w
cross join lateral (
  select round(avg(x.hrv), 1) as hrv_7d, round(avg(x.resting_hr), 1) as rhr_7d, count(*) as days_7d
  from public.wellness x where x.user_id = w.user_id and x.date between w.date - 6 and w.date
) r
cross join lateral (
  select round(avg(x.hrv), 1) as hrv_base, round(stddev_samp(x.hrv), 1) as hrv_base_sd,
         round(avg(x.resting_hr), 1) as rhr_base, count(*) as days_base
  from public.wellness x where x.user_id = w.user_id and x.date between w.date - 34 and w.date - 7
) b;
