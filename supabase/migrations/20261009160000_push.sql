-- Push notifications (F): the phone subscribes (push_subscriptions), you pick
-- what you want (notification_settings), and every 5 minutes pg_cron asks the
-- app "anything to send?" (push_tick → GET /api/push/tick). The app calls
-- push_due() for the facts, builds the messages (src/lib/push/messages.ts),
-- sends them with web-push and reports dead subscriptions (push_report).
--
-- What gets sent:
--   proposals  new `proposed` sessions / coach changes / season versions land
--              in push_outbox (triggers); once nothing new arrived for 2
--              minutes, ONE summary of everything open to approve
--              (source 'engine' = your own Yes in the app: never notified)
--   checkin    at checkin_time in your timezone, once a day, only when today
--              has no check-in yet
--
-- Secrets live in Supabase Vault (never in the repo): 'push_secret' (shared
-- with the app's PUSH_SECRET env) and 'push_app_url'.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy "owner full access" on public.push_subscriptions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.notification_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  proposals             boolean not null default true,
  checkin               boolean not null default true,
  checkin_time          time not null default '16:00',
  timezone              text not null default 'Europe/Amsterdam',   -- IANA name, checked by the app
  last_checkin_reminder date,
  updated_at            timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "owner full access" on public.notification_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Proposal events waiting to be summarised (written by triggers only).
create table public.push_outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('plan', 'change', 'season')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
alter table public.push_outbox enable row level security;
create policy "owner reads" on public.push_outbox for select using (user_id = (select auth.uid()));
create index on public.push_outbox (user_id) where sent_at is null;

create or replace function public.push_enqueue() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  -- weekly_plans has no `source`: read it through jsonb so every table works
  v_source text := to_jsonb(new)->>'source';
begin
  if new.status = 'proposed' and (tg_op = 'INSERT' or old.status is distinct from 'proposed') then
    if tg_table_name = 'coach_proposals' and v_source = 'engine' then return new; end if;
    if tg_table_name = 'seasons' and v_source = 'manual' then return new; end if;
    insert into public.push_outbox (user_id, kind)
    values (new.user_id, case tg_table_name when 'weekly_plans' then 'plan'
                                            when 'coach_proposals' then 'change' else 'season' end);
  end if;
  return new;
end $$;

create trigger push_enqueue after insert or update of status on public.weekly_plans
  for each row execute function public.push_enqueue();
create trigger push_enqueue after insert or update of status on public.coach_proposals
  for each row execute function public.push_enqueue();
create trigger push_enqueue after insert or update of status on public.seasons
  for each row execute function public.push_enqueue();

-- The facts to notify, per user with a subscription; marks them as handled.
-- Only callable with the shared secret (the app's tick route).
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
        select jsonb_build_object(
          'plans', (select count(*) from public.weekly_plans p
                    where p.user_id = u.user_id and p.status = 'proposed' and p.day >= v_local::date),
          'first_week', (select min(p.week_start_date) from public.weekly_plans p
                         where p.user_id = u.user_id and p.status = 'proposed' and p.day >= v_local::date),
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
end $$;

revoke all on function public.push_due(text) from public;
revoke all on function public.push_report(text, text[], text[]) from public;
grant execute on function public.push_due(text) to anon, authenticated;
grant execute on function public.push_report(text, text[], text[]) to anon, authenticated;

-- The 5-minute tick: asks the app to run push_due and send.
create or replace function public.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_app_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  perform net.http_get(
    url := v_url || '/api/push/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.push_tick() from public, anon, authenticated;

select cron.schedule('push-tick', '*/5 * * * *', 'select public.push_tick()');
