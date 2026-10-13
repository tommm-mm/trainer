-- Health line (Settings): is the plumbing alive?
--
--   last Garmin sync     athlete_settings.last_sync_at / last_sync_error
--                        (stamped by the app at the end of every sync)
--   last notification    notification_settings.last_push_at
--                        (stamped by push_report for the user's delivered pushes)
--   last tick            push_health(): latest pg_cron run of 'push-tick' and
--                        the latest HTTP answer from the app (not readable via RLS)
--
-- Also: the proposal summary gets the first proposed week's planned km and
-- the season's key session for it ("5 sessions to approve · 42 km · key: …").
-- Re-creates push_report (never applied from the F migration) with the stamp.

alter table public.athlete_settings
  add column if not exists last_sync_at    timestamptz,
  add column if not exists last_sync_error text;

alter table public.notification_settings
  add column if not exists last_push_at timestamptz;

-- After sending: drop subscriptions the push service says are gone, stamp the rest.
create or replace function public.push_report(p_secret text, p_gone text[], p_ok text[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret') then
    raise exception 'not allowed';
  end if;
  delete from public.push_subscriptions where endpoint = any(coalesce(p_gone, '{}'));
  update public.push_subscriptions set last_ok_at = now() where endpoint = any(coalesce(p_ok, '{}'));
  update public.notification_settings n set last_push_at = now()
   where n.user_id in (select s.user_id from public.push_subscriptions s
                        where s.endpoint = any(coalesce(p_ok, '{}')));
end $$;
revoke all on function public.push_report(text, text[], text[]) from public;
grant execute on function public.push_report(text, text[], text[]) to anon, authenticated;

-- The facts to notify (same as 20261009160000_push.sql + week_km / key_session).
create or replace function public.push_due(p_secret text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u record;
  s public.notification_settings;
  v_out jsonb := '[]'::jsonb;
  v_local timestamp;
  v_props jsonb;
  v_checkin boolean;
  v_week date;
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret') then
    raise exception 'not allowed';
  end if;

  for u in select distinct user_id from public.push_subscriptions loop
    insert into public.notification_settings (user_id) values (u.user_id) on conflict do nothing;
    select * into s from public.notification_settings where user_id = u.user_id for update;
    v_local := now() at time zone s.timezone;
    v_props := null;
    v_checkin := false;

    -- proposals: a summary once Cowork has been quiet for 2 minutes
    if exists (select 1 from public.push_outbox o where o.user_id = u.user_id and o.sent_at is null)
       and (select max(created_at) from public.push_outbox o where o.user_id = u.user_id and o.sent_at is null)
           < now() - interval '2 minutes' then
      update public.push_outbox set sent_at = now() where user_id = u.user_id and sent_at is null;
      if s.proposals then
        v_week := (select min(p.week_start_date) from public.weekly_plans p
                   where p.user_id = u.user_id and p.status = 'proposed' and p.day >= v_local::date);
        select jsonb_build_object(
          'plans', (select count(*) from public.weekly_plans p
                    where p.user_id = u.user_id and p.status = 'proposed' and p.day >= v_local::date),
          'first_week', v_week,
          'week_km', (select round(sum(p.target_distance_km)::numeric, 1) from public.weekly_plans p
                      where p.user_id = u.user_id and p.status = 'proposed' and p.week_start_date = v_week
                        and p.day >= v_local::date),
          'key_session', (select w.key_session from public.season_weeks w
                          join public.seasons x on x.id = w.season_id
                          where x.user_id = u.user_id and x.status = 'approved' and w.week_start = v_week
                          limit 1),
          'changes', (select count(*) from public.coach_proposals c
                      where c.user_id = u.user_id and c.status = 'proposed' and c.source <> 'engine'),
          'seasons', (select count(*) from public.seasons x where x.user_id = u.user_id and x.status = 'proposed'))
        into v_props;
      end if;
    end if;

    -- check-in reminder: once a day from checkin_time (local), only without a check-in today
    if s.checkin and v_local::time >= s.checkin_time
       and (s.last_checkin_reminder is null or s.last_checkin_reminder < v_local::date) then
      update public.notification_settings set last_checkin_reminder = v_local::date where user_id = u.user_id;
      v_checkin := not exists (select 1 from public.checkins c where c.user_id = u.user_id and c.date = v_local::date);
    end if;

    if v_props is not null or v_checkin then
      v_out := v_out || jsonb_build_object(
        'user_id', u.user_id,
        'proposals', v_props,
        'checkin', v_checkin,
        'subscriptions', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
                          from public.push_subscriptions where user_id = u.user_id));
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.push_due(text) from public;
grant execute on function public.push_due(text) to anon, authenticated;

-- Last tick: when pg_cron last ran push-tick, how it ended, and the app's last HTTP answer.
-- Only timestamps and status codes: nothing personal, signed-in users only.
create or replace function public.push_health()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tick_at',     (select max(d.start_time) from cron.job_run_details d
                    join cron.job j on j.jobid = d.jobid where j.jobname = 'push-tick'),
    'tick_status', (select d.status from cron.job_run_details d
                    join cron.job j on j.jobid = d.jobid where j.jobname = 'push-tick'
                    order by d.start_time desc limit 1),
    'http_at',     (select r.created from net._http_response r order by r.id desc limit 1),
    'http_status', (select r.status_code from net._http_response r order by r.id desc limit 1),
    'cron_active', (select j.active from cron.job j where j.jobname = 'push-tick'));
$$;
revoke all on function public.push_health() from public, anon;
grant execute on function public.push_health() to authenticated;
