alter table if exists tasks
  add column if not exists ownership text not null default 'mine'
  check (ownership in ('mine', 'delegated'));

create index if not exists idx_tasks_ownership on tasks(ownership);
