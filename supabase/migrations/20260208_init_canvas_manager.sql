create extension if not exists "pgcrypto";

create table if not exists business_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('website','suppliers','ads','orders','content','finance','support','operations','custom')),
  color text not null default '#4B5563',
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists block_edges (
  id uuid primary key default gen_random_uuid(),
  source_block_id uuid not null references business_blocks(id) on delete cascade,
  target_block_id uuid not null references business_blocks(id) on delete cascade,
  relation text not null default 'depends_on' check (relation in ('depends_on')),
  created_at timestamptz not null default now(),
  constraint block_edges_no_self_loop check (source_block_id <> target_block_id),
  constraint block_edges_unique unique (source_block_id, target_block_id, relation)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references business_blocks(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','in_progress','done','blocked')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  due_date date,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  checklist_json jsonb not null default '[]'::jsonb,
  ord integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists system_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_blocks_updated_at on business_blocks(updated_at desc);
create index if not exists idx_tasks_block on tasks(block_id, ord);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_edges_source on block_edges(source_block_id);
create index if not exists idx_edges_target on block_edges(target_block_id);
