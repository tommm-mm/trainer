-- Travel mode: days you can't train as usual. They warn, they never move a
-- session (the PT proposes, you approve). Same rules as src/lib/week-checks.ts
-- (travelChecks); shared cases in src/lib/checks.fixtures.json.
--
--   kind      off      no training at all     → any session that day
--             transit  travel day             → any session that day
--             no_gym   running only           → a gym session that day
--             limited  short on time / space  → a long run or a quality session that day
--   status    approved counts in the checks; proposed = the PT suggested it,
--             waiting for your Approve on the Plan tab
--
-- The PT adds one (Cowork, Supabase connector):
--   insert into travel_days (user_id, start_date, end_date, kind, note, status, source)
--   values ('<user id>', '2026-12-02', '2026-12-08', 'no_gym', 'Trip', 'proposed', 'coach');
-- and checks a draft week against them with check_week('<Monday>', '<draft>').

create table public.travel_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  start_date  date not null,
  end_date    date not null,
  kind        text not null check (kind in ('off', 'transit', 'no_gym', 'limited')),
  note        text check (char_length(note) <= 200),
  status      text not null default 'approved' check (status in ('proposed', 'approved')),
  source      text not null default 'manual' check (source in ('manual', 'coach')),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 60)
);
create index travel_days_user_dates on public.travel_days (user_id, start_date, end_date);

alter table public.travel_days enable row level security;
create policy "owner full access" on public.travel_days for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.travel_days;

-- One kind per day (approved only): when trips overlap the strictest wins
-- (off > transit > no_gym > limited).
create or replace function public.travel_day_kinds(p_from date, p_to date)
returns table (day date, kind text, note text)
language sql stable security invoker set search_path = '' as $$
  select distinct on (d::date) d::date, t.kind, t.note
  from public.travel_days t
  cross join generate_series(greatest(t.start_date, p_from), least(t.end_date, p_to), interval '1 day') d
  where t.status = 'approved' and t.start_date <= p_to and t.end_date >= p_from
  order by d::date, array_position(array['off', 'transit', 'no_gym', 'limited'], t.kind)
$$;

-- check_week = the existing checks + the travel ones (amber, after the others).
alter function public.check_week(date, jsonb) rename to check_week_base;

create or replace function public.check_week(p_monday date, p_draft jsonb default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_out jsonb := public.check_week_base(p_monday, p_draft);
  v_travel jsonb;
begin
  select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into v_travel from (
    select jsonb_build_object(
             'severity', 'amber',
             'code', 'travel_' || t.kind,
             'days', jsonb_build_array(t.day),
             'message', format('%s: %s%s, but %s planned.',
               to_char(t.day, 'Dy'),
               case t.kind when 'off' then 'day off' when 'transit' then 'travel day' when 'no_gym' then 'no gym' else 'limited time' end,
               coalesce(' (' || t.note || ')', ''),
               case when t.kind = 'no_gym' then 'gym is'
                    when t.kind = 'limited' then 'a hard run is'
                    else 'a session is' end)) as x,
           t.day as o
    from public.travel_day_kinds(p_monday, p_monday + 6) t
    where exists (
      select 1 from public.week_check_plans(p_monday, p_draft) p
      where p.day = t.day
        and case t.kind when 'no_gym' then p.kind = 'gym' when 'limited' then p.hard else true end
    )
  ) s;
  -- red first, then the base order, travel last (amber)
  select coalesce(jsonb_agg(x order by (x->>'severity') <> 'red', o), '[]'::jsonb) into v_out
  from jsonb_array_elements(v_out || v_travel) with ordinality as t(x, o);
  return v_out;
end $$;
