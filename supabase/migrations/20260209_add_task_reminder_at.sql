alter table if exists tasks
  add column if not exists reminder_at timestamptz;

create index if not exists idx_tasks_reminder_at
  on tasks(reminder_at)
  where reminder_at is not null and status <> 'done';
