-- Live updates: the app refreshes open screens when these tables change
-- (Garmin sync lands, a workout is finished or linked, a plan is proposed).
-- Realtime respects RLS, so each client only hears about its own rows.
alter publication supabase_realtime add table
  public.activities,
  public.workouts,
  public.weekly_plans,
  public.exercise_targets,
  public.checkins;
