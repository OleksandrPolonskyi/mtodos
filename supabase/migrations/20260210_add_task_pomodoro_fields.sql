alter table tasks
  add column if not exists pomodoro_seconds integer not null default 0,
  add column if not exists pomodoro_sessions integer not null default 0;

alter table tasks
  drop constraint if exists tasks_pomodoro_seconds_check,
  add constraint tasks_pomodoro_seconds_check check (pomodoro_seconds >= 0);

alter table tasks
  drop constraint if exists tasks_pomodoro_sessions_check,
  add constraint tasks_pomodoro_sessions_check check (pomodoro_sessions >= 0);
