alter table if exists tasks
  add column if not exists depends_on_task_id uuid references tasks(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_no_self_dependency'
      and conrelid = 'tasks'::regclass
  ) then
    alter table tasks
      add constraint tasks_no_self_dependency
      check (depends_on_task_id is null or depends_on_task_id <> id);
  end if;
end
$$;

create index if not exists idx_tasks_depends_on_task
  on tasks(depends_on_task_id)
  where depends_on_task_id is not null;
