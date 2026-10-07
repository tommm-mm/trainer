-- Coach proposals: one inbox for every change a coach (Cowork, the app's own
-- rules, later the Claude API) wants to make to your plan or your gym
-- templates. A coach only ever INSERTS a `proposed` row; nothing changes
-- until you tap Approve in the app, which calls apply_coach_proposal() and
-- applies the change atomically. Reject keeps everything as it is.
--
-- Kinds and payloads (jsonb):
--   session_update            { plan_id, day?, session_type?, target_distance_km?, template_id?, notes? }
--   session_cancel            { plan_id }
--   template_exercise_add     { template_id, exercise_id, block?, position?, sets, rep_min?, rep_max?,
--                               target_rir?, rest_seconds?, notes? }
--   template_exercise_update  { template_exercise_id, sets?, rep_min?, rep_max?, target_rir?,
--                               rest_seconds?, notes? }
--   template_exercise_swap    { template_exercise_id, exercise_id }
--   template_exercise_remove  { template_exercise_id }
--   template_create           { name, notes?, items: [{ exercise_id, block?, sets, rep_min?, rep_max?,
--                               target_rir?, rest_seconds?, notes? }] }
--   template_archive          { template_id }
-- New sessions are still plain `proposed` weekly_plans rows; season changes
-- are still create_season_proposal().

create table public.coach_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in (
                'session_update', 'session_cancel',
                'template_exercise_add', 'template_exercise_update', 'template_exercise_swap',
                'template_exercise_remove', 'template_create', 'template_archive')),
  payload     jsonb not null,
  -- One line for the card, e.g. "Move Thursday's tempo to Friday".
  title       text not null check (length(trim(title)) between 1 and 140),
  rationale   text,
  source      text not null default 'cowork'
              check (source in ('cowork', 'engine', 'claude_code', 'claude_api', 'manual')),
  status      text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  -- The app's own questions: the same question isn't asked twice.
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index on public.coach_proposals (user_id, status, created_at desc);
create unique index coach_proposals_open_key on public.coach_proposals (user_id, dedupe_key)
  where dedupe_key is not null and status = 'proposed';

alter table public.coach_proposals enable row level security;
create policy "owner full access" on public.coach_proposals for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.coach_proposals;

-- Applies one proposal (your Approve tap). Security invoker: RLS still decides
-- what you can touch. Past or completed sessions never change.
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
    insert into public.workout_templates (user_id, name, notes, position)
    values (p.user_id, v->>'name', v->>'notes',
      (select coalesce(max(position), 0) + 1 from public.workout_templates where user_id = p.user_id))
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
  end case;

  update public.coach_proposals set status = 'approved', decided_at = now() where id = p_id;
end $$;
