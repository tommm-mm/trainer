-- Phase G — Gym logger.
-- Additive only: the live site (main) keeps working while this branch is in
-- review. gym_sessions (0 rows) is dropped in a follow-up once main no longer
-- reads it.

-- ============================================================ muscle vocabulary
-- 10 groups: the granularity weekly-volume research uses (sets per muscle).
create or replace function public.is_muscle_list(m text[]) returns boolean
language sql immutable set search_path = '' as $$
  select m <@ array['chest','back','shoulders','biceps','triceps',
                    'quads','hamstrings','glutes','calves','core']::text[]
$$;

-- ============================================================ exercises
-- user_id NULL = starter library (read-only); your additions carry your id.
create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade default auth.uid(),
  name              text not null check (length(trim(name)) between 2 and 60),
  primary_muscles   text[] not null check (cardinality(primary_muscles) >= 1 and public.is_muscle_list(primary_muscles)),
  secondary_muscles text[] not null default '{}' check (public.is_muscle_list(secondary_muscles)),
  equipment         text not null check (equipment in ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','other')),
  mechanic          text not null check (mechanic in ('compound','isolation')),
  -- reps: weight × reps; time: seconds (plank, rower, sled).
  measure           text not null default 'reps' check (measure in ('reps','time')),
  -- Main lifts get an e1RM trend on Stats.
  is_main_lift      boolean not null default false,
  -- Step of the ± weight buttons.
  weight_step_kg    numeric(4,2) not null default 2.5 check (weight_step_kg > 0),
  archived          boolean not null default false,
  created_at        timestamptz not null default now()
);
create unique index exercises_name_uq on public.exercises (user_id, lower(name)) nulls not distinct;

alter table public.exercises enable row level security;
create policy "read library and own" on public.exercises for select
  using (user_id is null or user_id = (select auth.uid()));
create policy "owner insert" on public.exercises for insert with check (user_id = (select auth.uid()));
create policy "owner update" on public.exercises for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner delete" on public.exercises for delete using (user_id = (select auth.uid()));

-- ============================================================ templates
create table public.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (length(trim(name)) between 1 and 40),
  position    smallint not null default 0,   -- rotation order (A, B, C)
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Default prescription. Rep range / RIR may be unset ("not decided yet").
create table public.template_exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  template_id   uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id) on delete restrict,
  block         text not null default 'main' check (block in ('main','finisher')),
  position      smallint not null,
  sets          smallint not null check (sets between 1 and 10),
  rep_min       smallint check (rep_min between 1 and 100),
  rep_max       smallint check (rep_max between 1 and 100),
  target_rir    smallint check (target_rir between 0 and 5),
  rest_seconds  smallint check (rest_seconds between 0 and 600),
  notes         text,
  check (rep_min is null or rep_max is null or rep_min <= rep_max)
);
create index on public.template_exercises (template_id, position);
create index on public.template_exercises (exercise_id);

-- ============================================================ Phase C hook (table only, no engine)
-- Per-week overrides of a template exercise. The Phase C engine writes rows as
-- `proposed`; nothing applies until you approve (same rule as weekly_plans).
-- No row for a week → template defaults.
create table public.exercise_targets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade default auth.uid(),
  week_start            date not null check (extract(isodow from week_start) = 1),
  template_exercise_id  uuid not null references public.template_exercises(id) on delete cascade,
  sets                  smallint check (sets between 0 and 10),   -- 0 = skip this week
  rep_min               smallint check (rep_min between 1 and 100),
  rep_max               smallint check (rep_max between 1 and 100),
  target_rir            smallint check (target_rir between 0 and 5),
  target_weight_kg      numeric(6,2) check (target_weight_kg >= 0),
  source                text not null default 'manual' check (source in ('manual','engine')),
  status                text not null default 'proposed' check (status in ('proposed','approved')),
  rationale             text,
  created_at            timestamptz not null default now(),
  unique (template_exercise_id, week_start),
  check (rep_min is null or rep_max is null or rep_min <= rep_max)
);

alter table public.weekly_plans
  add column template_id uuid references public.workout_templates(id) on delete set null;
create index on public.weekly_plans (template_id);

-- ============================================================ workouts (the log)
-- Ids are generated on the phone so offline retries are idempotent upserts.
create table public.workouts (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date          date not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null default 'in_progress' check (status in ('in_progress','completed','discarded')),
  template_id   uuid references public.workout_templates(id) on delete set null,
  plan_id       uuid references public.weekly_plans(id) on delete set null,
  -- Same-day Garmin strength activity (duration + HR). One workout per activity.
  activity_id   uuid unique references public.activities(id) on delete set null,
  session_rpe   smallint check (session_rpe between 1 and 10),
  notes         text,
  updated_at    timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
create index on public.workouts (user_id, date desc);
create index on public.workouts (template_id);
create index on public.workouts (plan_id);

create table public.workout_exercises (
  id                    uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id            uuid not null references public.workouts(id) on delete cascade,
  exercise_id           uuid not null references public.exercises(id) on delete restrict,
  template_exercise_id  uuid references public.template_exercises(id) on delete set null,
  block                 text not null default 'main' check (block in ('main','finisher')),
  position              smallint not null,
  notes                 text
);
create index on public.workout_exercises (workout_id, position);
create index on public.workout_exercises (exercise_id);
create index on public.workout_exercises (template_exercise_id);

create table public.workout_sets (
  id                   uuid primary key,
  user_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_exercise_id  uuid not null references public.workout_exercises(id) on delete cascade,
  position             smallint not null,
  weight_kg            numeric(6,2) not null default 0 check (weight_kg between 0 and 500),  -- bodyweight moves: added load
  reps                 smallint check (reps between 0 and 200),
  duration_s           smallint check (duration_s between 0 and 3600),
  rir                  smallint check (rir between 0 and 10),   -- null = not rated
  is_warmup            boolean not null default false,
  logged_at            timestamptz not null default now(),
  check (reps is not null or duration_s is not null)
);
create index on public.workout_sets (workout_exercise_id, position);

do $$
declare t text;
begin
  foreach t in array array['workout_templates','template_exercises','exercise_targets',
                           'workouts','workout_exercises','workout_sets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ============================================================ activity classification
-- Raw intervals.icu type kept for auditability; short HIIT finishers become
-- their own kind so they stop counting as gym sessions.
alter table public.activities add column sport_type text;
alter table public.activities drop constraint activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('run','gym','cardio'));
update public.activities set type = 'cardio'
  where source = 'garmin' and type = 'gym' and name = 'Cardio';

-- ============================================================ starter library
insert into public.exercises (user_id, name, primary_muscles, secondary_muscles, equipment, mechanic, measure, is_main_lift, weight_step_kg) values
  -- your programme
  (null, 'Incline Bench Press (Dumbbell)',   '{chest}',             '{shoulders,triceps}', 'dumbbell',   'compound',  'reps', true,  2),
  (null, 'Lat Pulldown (Cable)',             '{back}',              '{biceps}',            'cable',      'compound',  'reps', true,  2.5),
  (null, 'Lateral Raise (Machine)',          '{shoulders}',         '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'EZ Bar Biceps Curl',               '{biceps}',            '{}',                  'barbell',    'isolation', 'reps', false, 2.5),
  (null, 'Triceps Pushdown',                 '{triceps}',           '{}',                  'cable',      'isolation', 'reps', false, 2.5),
  (null, 'Squat (Barbell)',                  '{quads,glutes}',      '{core}',              'barbell',    'compound',  'reps', true,  2.5),
  (null, 'Standing Military Press (Barbell)','{shoulders}',         '{triceps}',           'barbell',    'compound',  'reps', true,  2.5),
  (null, 'Bent Over Row (Barbell)',          '{back}',              '{biceps,shoulders}',  'barbell',    'compound',  'reps', true,  2.5),
  (null, 'Seated Incline Curl (Dumbbell)',   '{biceps}',            '{}',                  'dumbbell',   'isolation', 'reps', false, 1),
  (null, 'Overhead Triceps Extension (Cable)','{triceps}',          '{}',                  'cable',      'isolation', 'reps', false, 2.5),
  (null, 'Hip Thrust (Machine)',             '{glutes}',            '{hamstrings}',        'machine',    'compound',  'reps', true,  5),
  (null, 'Standing Calf Raise',              '{calves}',            '{}',                  'machine',    'isolation', 'reps', false, 5),
  (null, 'Chest Press (Machine)',            '{chest}',             '{triceps,shoulders}', 'machine',    'compound',  'reps', false, 5),
  (null, 'Seated Row (Machine)',             '{back}',              '{biceps,shoulders}',  'machine',    'compound',  'reps', false, 5),
  (null, 'Preacher Curl (Machine)',          '{biceps}',            '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'Chest Fly (Machine)',              '{chest}',             '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'Romanian Deadlift (Dumbbell)',     '{hamstrings,glutes}', '{back}',              'dumbbell',   'compound',  'reps', true,  2),
  (null, 'Bulgarian Split Squat (Dumbbell)', '{quads,glutes}',      '{}',                  'dumbbell',   'compound',  'reps', false, 2),
  -- your finishers
  (null, 'Kettlebell Swing',                 '{glutes,hamstrings}', '{core}',              'kettlebell', 'compound',  'reps', false, 4),
  (null, 'Push Up',                          '{chest}',             '{triceps,shoulders}', 'bodyweight', 'compound',  'reps', false, 2.5),
  (null, 'Rowing Machine',                   '{back}',              '{quads}',             'machine',    'compound',  'time', false, 2.5),
  (null, 'Plank',                            '{core}',              '{}',                  'bodyweight', 'isolation', 'time', false, 2.5),
  (null, 'Russian Twist (Weighted)',         '{core}',              '{}',                  'other',      'isolation', 'reps', false, 2.5),
  (null, 'Box Jump',                         '{quads,glutes}',      '{calves}',            'bodyweight', 'compound',  'reps', false, 2.5),
  (null, 'Burpee',                           '{quads}',             '{chest}',             'bodyweight', 'compound',  'reps', false, 2.5),
  (null, 'Sled Push',                        '{quads,glutes}',      '{calves}',            'other',      'compound',  'time', false, 5),
  -- common alternatives
  (null, 'Lying Leg Curl (Machine)',         '{hamstrings}',        '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'Seated Leg Curl (Machine)',        '{hamstrings}',        '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'Leg Extension (Machine)',          '{quads}',             '{}',                  'machine',    'isolation', 'reps', false, 2.5),
  (null, 'Leg Press (Machine)',              '{quads,glutes}',      '{}',                  'machine',    'compound',  'reps', false, 5),
  (null, 'Bench Press (Barbell)',            '{chest}',             '{triceps,shoulders}', 'barbell',    'compound',  'reps', false, 2.5),
  (null, 'Deadlift (Barbell)',               '{glutes,hamstrings}', '{back,quads}',        'barbell',    'compound',  'reps', false, 2.5),
  (null, 'Pull Up',                          '{back}',              '{biceps}',            'bodyweight', 'compound',  'reps', false, 2.5),
  (null, 'Face Pull (Cable)',                '{shoulders}',         '{back}',              'cable',      'isolation', 'reps', false, 2.5),
  (null, 'Hanging Leg Raise',                '{core}',              '{}',                  'bodyweight', 'isolation', 'reps', false, 2.5),
  (null, 'Cable Crunch',                     '{core}',              '{}',                  'cable',      'isolation', 'reps', false, 2.5);
