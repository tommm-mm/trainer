-- Coach gym tools (C2c+): what a coach needs to run any gym block, without the
-- app deciding the content. The coach proposes, you approve; the app applies.
--
-- 1. Templates belong to blocks: workout_templates.gym_focus lists the block
--    gym focuses a template is for (hypertrophy, strength, power, maintenance,
--    off). NULL = every block. The Gym tab, the Today card rotation and the
--    week checks use the templates of the current block (falling back to all).
-- 2. Week rules: gym_week_rules holds the coach's per-week changes to the
--    templates (sets, RIR, rep range, weight direction, by exercise group). A
--    week with a row uses them instead of the app's default block rules
--    (deload, +1 set, last set to RIR 0). Format in src/lib/gym/rules.ts.
-- 3. New proposal kinds:
--    template_create  + gym_focus?: text[]
--    template_update  { template_id, name?, notes?, gym_focus?: text[] | null, archived?: bool }
--    exercise_create  { name, primary_muscles: text[], secondary_muscles?, equipment, mechanic,
--                       measure?, is_main_lift?, weight_step_kg? }
--    gym_rules_set    { weeks: [{ week_start, rules: Rule[] | null, note? }] }  (null = back to default)

create or replace function public.text_list(j jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'array'
    then array(select jsonb_array_elements_text(j)) end
$$;

create or replace function public.is_gym_focus_list(m text[]) returns boolean
language sql immutable set search_path = '' as $$
  select m <@ array['hypertrophy','strength','power','maintenance','off']::text[]
$$;

alter table public.workout_templates
  add column gym_focus text[] check (gym_focus is null or public.is_gym_focus_list(gym_focus));

create table public.gym_week_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  week_start  date not null check (extract(isodow from week_start) = 1),
  rules       jsonb not null check (jsonb_typeof(rules) = 'array'),
  note        text,
  source      text not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.gym_week_rules enable row level security;
create policy "owner full access" on public.gym_week_rules for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.gym_week_rules;

alter table public.coach_proposals drop constraint coach_proposals_kind_check;
alter table public.coach_proposals add constraint coach_proposals_kind_check check (kind in (
  'session_update', 'session_cancel',
  'template_exercise_add', 'template_exercise_update', 'template_exercise_swap',
  'template_exercise_remove', 'template_create', 'template_archive',
  'template_update', 'exercise_create', 'gym_rules_set'));

create or replace function public.apply_coach_proposal(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.coach_proposals;
  v jsonb;
  v_day date;
  v_pos smallint;
  v_tpl uuid;
  v_item jsonb;
  v_i int := 0;
begin
  select * into p from public.coach_proposals where id = p_id and status = 'proposed' for update;
  if not found then raise exception 'Only an open proposal can be approved'; end if;
  v := p.payload;

  if p.kind in ('session_update', 'session_cancel') then
    select day into v_day from public.weekly_plans
     where id = (v->>'plan_id')::uuid and status <> 'completed' for update;
    if not found then raise exception 'That session no longer exists or is already done'; end if;
    if v_day < current_date then raise exception 'Past sessions can''t change'; end if;
  end if;

  case p.kind
  when 'session_update' then
    if v ? 'day' and (v->>'day')::date < current_date then
      raise exception 'A session can''t move into the past';
    end if;
    update public.weekly_plans set
      day = coalesce((v->>'day')::date, day),
      week_start_date = date_trunc('week', coalesce((v->>'day')::date, day))::date,
      session_type = coalesce(v->>'session_type', session_type),
      target_distance_km = case when v ? 'target_distance_km' then (v->>'target_distance_km')::numeric else target_distance_km end,
      template_id = case when v ? 'template_id' then (v->>'template_id')::uuid else template_id end,
      notes = case when v ? 'notes' then v->>'notes' else notes end,
      status = 'approved'
    where id = (v->>'plan_id')::uuid;

  when 'session_cancel' then
    delete from public.weekly_plans where id = (v->>'plan_id')::uuid;

  when 'template_exercise_add' then
    v_tpl := (v->>'template_id')::uuid;
    perform 1 from public.workout_templates where id = v_tpl and not archived;
    if not found then raise exception 'Template not found'; end if;
    v_pos := coalesce((v->>'position')::smallint,
      (select coalesce(max(position), 0) + 1 from public.template_exercises
        where template_id = v_tpl and block = coalesce(v->>'block', 'main')));
    update public.template_exercises set position = position + 1
     where template_id = v_tpl and position >= v_pos;
    insert into public.template_exercises (user_id, template_id, exercise_id, block, position, sets,
      rep_min, rep_max, target_rir, rest_seconds, notes)
    values (p.user_id, v_tpl, (v->>'exercise_id')::uuid, coalesce(v->>'block', 'main'), v_pos,
      (v->>'sets')::smallint, (v->>'rep_min')::smallint, (v->>'rep_max')::smallint,
      (v->>'target_rir')::smallint, (v->>'rest_seconds')::smallint, v->>'notes');

  when 'template_exercise_update' then
    update public.template_exercises set
      sets = coalesce((v->>'sets')::smallint, sets),
      rep_min = case when v ? 'rep_min' then (v->>'rep_min')::smallint else rep_min end,
      rep_max = case when v ? 'rep_max' then (v->>'rep_max')::smallint else rep_max end,
      target_rir = case when v ? 'target_rir' then (v->>'target_rir')::smallint else target_rir end,
      rest_seconds = case when v ? 'rest_seconds' then (v->>'rest_seconds')::smallint else rest_seconds end,
      notes = case when v ? 'notes' then v->>'notes' else notes end
    where id = (v->>'template_exercise_id')::uuid;
    if not found then raise exception 'Template exercise not found'; end if;

  when 'template_exercise_swap' then
    update public.template_exercises set exercise_id = (v->>'exercise_id')::uuid
     where id = (v->>'template_exercise_id')::uuid;
    if not found then raise exception 'Template exercise not found'; end if;

  when 'template_exercise_remove' then
    delete from public.template_exercises where id = (v->>'template_exercise_id')::uuid;
    if not found then raise exception 'Template exercise not found'; end if;

  when 'template_create' then
    if jsonb_array_length(coalesce(v->'items', '[]'::jsonb)) = 0 then
      raise exception 'A template needs at least one exercise';
    end if;
    insert into public.workout_templates (user_id, name, notes, position, gym_focus)
    values (p.user_id, v->>'name', v->>'notes',
      (select coalesce(max(position), 0) + 1 from public.workout_templates where user_id = p.user_id),
      case when v ? 'gym_focus' then public.text_list(v->'gym_focus') end)
    returning id into v_tpl;
    for v_item in select value from jsonb_array_elements(v->'items') loop
      v_i := v_i + 1;
      insert into public.template_exercises (user_id, template_id, exercise_id, block, position, sets,
        rep_min, rep_max, target_rir, rest_seconds, notes)
      values (p.user_id, v_tpl, (v_item->>'exercise_id')::uuid, coalesce(v_item->>'block', 'main'), v_i,
        (v_item->>'sets')::smallint, (v_item->>'rep_min')::smallint, (v_item->>'rep_max')::smallint,
        (v_item->>'target_rir')::smallint, (v_item->>'rest_seconds')::smallint, v_item->>'notes');
    end loop;

  when 'template_archive' then
    update public.workout_templates set archived = true where id = (v->>'template_id')::uuid;
    if not found then raise exception 'Template not found'; end if;

  when 'template_update' then
    update public.workout_templates set
      name = coalesce(v->>'name', name),
      notes = case when v ? 'notes' then v->>'notes' else notes end,
      gym_focus = case when v ? 'gym_focus' then public.text_list(v->'gym_focus') else gym_focus end,
      archived = coalesce((v->>'archived')::boolean, archived)
    where id = (v->>'template_id')::uuid;
    if not found then raise exception 'Template not found'; end if;

  when 'exercise_create' then
    insert into public.exercises (user_id, name, primary_muscles, secondary_muscles, equipment, mechanic,
      measure, is_main_lift, weight_step_kg)
    values (p.user_id, v->>'name', public.text_list(v->'primary_muscles'),
      coalesce(public.text_list(v->'secondary_muscles'), '{}'), v->>'equipment', v->>'mechanic',
      coalesce(v->>'measure', 'reps'), coalesce((v->>'is_main_lift')::boolean, false),
      coalesce((v->>'weight_step_kg')::numeric, 2.5));

  when 'gym_rules_set' then
    if jsonb_typeof(v->'weeks') <> 'array' or jsonb_array_length(v->'weeks') = 0 then
      raise exception 'gym_rules_set needs weeks: [{ week_start, rules }]';
    end if;
    for v_item in select value from jsonb_array_elements(v->'weeks') loop
      v_day := (v_item->>'week_start')::date;
      if extract(isodow from v_day) <> 1 then raise exception '% is not a Monday', v_day; end if;
      if v_day + 6 < current_date then raise exception 'Past weeks can''t change (%)', v_day; end if;
      if v_item->'rules' is null or jsonb_typeof(v_item->'rules') = 'null' then
        -- back to the app's default for that week
        delete from public.gym_week_rules where user_id = p.user_id and week_start = v_day;
      elsif jsonb_typeof(v_item->'rules') <> 'array' then
        raise exception 'rules must be a list (or null to clear) for %', v_day;
      else
        insert into public.gym_week_rules (user_id, week_start, rules, note, source)
        values (p.user_id, v_day, v_item->'rules', v_item->>'note', p.source)
        on conflict (user_id, week_start) do update
          set rules = excluded.rules, note = excluded.note, source = excluded.source, updated_at = now();
      end if;
    end loop;
  end case;

  update public.coach_proposals set status = 'approved', decided_at = now() where id = p_id;
end $$;
