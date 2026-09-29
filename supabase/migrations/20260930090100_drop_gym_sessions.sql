-- gym_sessions (flat, one row per exercise, 0 rows) is superseded by
-- workouts / workout_exercises / workout_sets. Applied after the code that
-- read it was removed from main.
drop table public.gym_sessions;
