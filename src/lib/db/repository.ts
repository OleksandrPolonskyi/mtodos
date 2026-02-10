import { getSql } from "@/lib/db/client";
import {
  blockIconNames,
  type BlockEdge,
  type BlockIconName,
  type BusinessBlock,
  type ChecklistItem,
  type TaskItem
} from "@/types/domain";

interface BlockRow {
  id: string;
  title: string;
  type: BusinessBlock["type"];
  color: string;
  icon_name: string | null;
  pos_x: number;
  pos_y: number;
  is_archived: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface EdgeRow {
  id: string;
  source_block_id: string;
  target_block_id: string;
  relation: string;
  created_at: Date | string;
}

interface TaskRow {
  id: string;
  block_id: string;
  title: string;
  status: TaskItem["status"];
  ownership: TaskItem["ownership"];
  priority: TaskItem["priority"];
  depends_on_task_id: string | null;
  due_date: Date | string | null;
  checklist_json: unknown;
  pomodoro_seconds: number | null;
  pomodoro_sessions: number | null;
  ord: number;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

const toIso = (value: Date | string | null | undefined): string => {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};

const toDateString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const parseChecklist = (input: unknown): ChecklistItem[] => {
  if (Array.isArray(input)) {
    return input
      .filter((item) => typeof item === "object" && item !== null)
      .map((item) => ({
        id: String((item as { id?: string }).id ?? crypto.randomUUID()),
        text: String((item as { text?: string }).text ?? ""),
        done: Boolean((item as { done?: boolean }).done)
      }))
      .filter((item) => item.text.length > 0);
  }

  if (typeof input === "string" && input.length > 0) {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parseChecklist(parsed);
    } catch {
      return [];
    }
  }

  return [];
};

const mapBlock = (row: BlockRow): BusinessBlock => ({
  // Keeps repository tolerant to unexpected legacy values.
  iconName: blockIconNames.includes((row.icon_name ?? "") as BlockIconName)
    ? (row.icon_name as BlockIconName)
    : null,
  id: row.id,
  title: row.title,
  type: row.type,
  color: row.color,
  x: Number(row.pos_x),
  y: Number(row.pos_y),
  isArchived: row.is_archived,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapEdge = (row: EdgeRow): BlockEdge => ({
  id: row.id,
  sourceBlockId: row.source_block_id,
  targetBlockId: row.target_block_id,
  relation: "depends_on",
  createdAt: toIso(row.created_at)
});

const mapTask = (row: TaskRow): TaskItem => ({
  id: row.id,
  blockId: row.block_id,
  title: row.title,
  status: row.status,
  ownership: row.ownership ?? "mine",
  priority: row.priority,
  dependsOnTaskId: row.depends_on_task_id,
  dueDate: toDateString(row.due_date),
  checklist: parseChecklist(row.checklist_json),
  pomodoroSeconds: Math.max(0, Number(row.pomodoro_seconds ?? 0)),
  pomodoroSessions: Math.max(0, Number(row.pomodoro_sessions ?? 0)),
  order: Number(row.ord),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  completedAt: row.completed_at ? toIso(row.completed_at) : null
});

export const listBlocks = async (): Promise<BusinessBlock[]> => {
  const sql = getSql();
  const rows = await sql<BlockRow[]>`
    select id, title, type, color, icon_name, pos_x, pos_y, is_archived, created_at, updated_at
    from business_blocks
    where is_archived = false
    order by updated_at desc
  `;

  return rows.map(mapBlock);
};

export const createBlock = async (
  payload: Partial<BusinessBlock>
): Promise<BusinessBlock> => {
  const sql = getSql();
  const rows = await sql<BlockRow[]>`
    insert into business_blocks (title, type, color, icon_name, pos_x, pos_y)
    values (
      ${payload.title ?? "Новий блок"},
      ${payload.type ?? "custom"},
      ${payload.color ?? "#4B5563"},
      ${payload.iconName ?? null},
      ${payload.x ?? 0},
      ${payload.y ?? 0}
    )
    returning id, title, type, color, icon_name, pos_x, pos_y, is_archived, created_at, updated_at
  `;

  return mapBlock(rows[0]);
};

export const updateBlock = async (
  blockId: string,
  payload: Partial<BusinessBlock>
): Promise<BusinessBlock> => {
  const sql = getSql();
  const updates: Record<string, unknown> = {};

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.type !== undefined) updates.type = payload.type;
  if (payload.color !== undefined) updates.color = payload.color;
  if (payload.iconName !== undefined) updates.icon_name = payload.iconName;
  if (payload.x !== undefined) updates.pos_x = payload.x;
  if (payload.y !== undefined) updates.pos_y = payload.y;

  updates.updated_at = new Date();

  const rows = await sql<BlockRow[]>`
    update business_blocks
    set ${sql(updates)}
    where id = ${blockId}
    returning id, title, type, color, icon_name, pos_x, pos_y, is_archived, created_at, updated_at
  `;

  if (rows.length === 0) {
    throw new Error("Block not found");
  }

  return mapBlock(rows[0]);
};

export const archiveBlock = async (blockId: string): Promise<void> => {
  const sql = getSql();
  await sql`
    update business_blocks
    set is_archived = true, updated_at = now()
    where id = ${blockId}
  `;
};

export const repositionBlocks = async (
  positions: Array<{ id: string; x: number; y: number }>
): Promise<void> => {
  if (positions.length === 0) {
    return;
  }

  const sql = getSql();
  for (const position of positions) {
    await sql`
      update business_blocks
      set pos_x = ${position.x}, pos_y = ${position.y}, updated_at = now()
      where id = ${position.id}
    `;
  }
};

export const listEdges = async (): Promise<BlockEdge[]> => {
  const sql = getSql();
  const rows = await sql<EdgeRow[]>`
    select e.id, e.source_block_id, e.target_block_id, e.relation, e.created_at
    from block_edges e
    join business_blocks s on s.id = e.source_block_id
    join business_blocks t on t.id = e.target_block_id
    where s.is_archived = false and t.is_archived = false
    order by e.created_at asc
  `;

  return rows.map(mapEdge);
};

export const createEdge = async (
  payload: Pick<BlockEdge, "sourceBlockId" | "targetBlockId">
): Promise<BlockEdge> => {
  const sql = getSql();
  const rows = await sql<EdgeRow[]>`
    insert into block_edges (source_block_id, target_block_id, relation)
    values (${payload.sourceBlockId}, ${payload.targetBlockId}, 'depends_on')
    on conflict (source_block_id, target_block_id, relation)
    do update set relation = excluded.relation
    returning id, source_block_id, target_block_id, relation, created_at
  `;

  return mapEdge(rows[0]);
};

export const deleteEdge = async (edgeId: string): Promise<void> => {
  const sql = getSql();
  await sql`delete from block_edges where id = ${edgeId}`;
};

export const listTasks = async (blockId?: string): Promise<TaskItem[]> => {
  const sql = getSql();

  if (blockId) {
    const rows = await sql<TaskRow[]>`
      select id, block_id, title, status, ownership, priority, depends_on_task_id, due_date, checklist_json, pomodoro_seconds, pomodoro_sessions, ord, created_at, updated_at, completed_at
      from tasks
      where block_id = ${blockId}
        and exists (
          select 1
          from business_blocks b
          where b.id = tasks.block_id
            and b.is_archived = false
        )
      order by ord asc, updated_at desc
    `;

    return rows.map(mapTask);
  }

  const rows = await sql<TaskRow[]>`
    select id, block_id, title, status, ownership, priority, depends_on_task_id, due_date, checklist_json, pomodoro_seconds, pomodoro_sessions, ord, created_at, updated_at, completed_at
    from tasks
    where exists (
      select 1
      from business_blocks b
      where b.id = tasks.block_id
        and b.is_archived = false
    )
    order by updated_at desc
  `;

  return rows.map(mapTask);
};

export const createTask = async (
  payload: Partial<TaskItem> & { blockId: string; title: string }
): Promise<TaskItem> => {
  const sql = getSql();
  const rows = await sql<TaskRow[]>`
    insert into tasks (block_id, title, status, ownership, priority, depends_on_task_id, due_date, checklist_json, pomodoro_seconds, pomodoro_sessions, ord, completed_at)
    values (
      ${payload.blockId},
      ${payload.title},
      ${payload.status ?? "todo"},
      ${payload.ownership ?? "mine"},
      ${payload.priority ?? "medium"},
      ${payload.dependsOnTaskId ?? null},
      ${payload.dueDate ?? null},
      ${JSON.stringify(payload.checklist ?? [])}::jsonb,
      ${Math.max(0, Math.floor(payload.pomodoroSeconds ?? 0))},
      ${Math.max(0, Math.floor(payload.pomodoroSessions ?? 0))},
      ${payload.order ?? 0},
      ${payload.status === "done" ? new Date() : null}
    )
    returning id, block_id, title, status, ownership, priority, depends_on_task_id, due_date, checklist_json, pomodoro_seconds, pomodoro_sessions, ord, created_at, updated_at, completed_at
  `;

  return mapTask(rows[0]);
};

export const updateTask = async (
  taskId: string,
  payload: Partial<TaskItem>
): Promise<TaskItem> => {
  const sql = getSql();
  const updates: Record<string, unknown> = {};

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.ownership !== undefined) updates.ownership = payload.ownership;
  if (payload.priority !== undefined) updates.priority = payload.priority;
  if (payload.dependsOnTaskId !== undefined) updates.depends_on_task_id = payload.dependsOnTaskId;
  if (payload.dueDate !== undefined) updates.due_date = payload.dueDate;
  if (payload.checklist !== undefined) updates.checklist_json = payload.checklist;
  if (payload.pomodoroSeconds !== undefined) {
    updates.pomodoro_seconds = Math.max(0, Math.floor(payload.pomodoroSeconds));
  }
  if (payload.pomodoroSessions !== undefined) {
    updates.pomodoro_sessions = Math.max(0, Math.floor(payload.pomodoroSessions));
  }
  if (payload.order !== undefined) updates.ord = payload.order;

  if (payload.status !== undefined) {
    updates.completed_at = payload.status === "done" ? new Date() : null;
  } else if (payload.completedAt !== undefined) {
    updates.completed_at = payload.completedAt ? new Date(payload.completedAt) : null;
  }

  updates.updated_at = new Date();

  const rows = await sql<TaskRow[]>`
    update tasks
    set ${sql(updates)}
    where id = ${taskId}
    returning id, block_id, title, status, ownership, priority, depends_on_task_id, due_date, checklist_json, pomodoro_seconds, pomodoro_sessions, ord, created_at, updated_at, completed_at
  `;

  if (rows.length === 0) {
    throw new Error("Task not found");
  }

  return mapTask(rows[0]);
};

export const reorderTasks = async (
  ordering: Array<{ id: string; order: number }>
): Promise<void> => {
  if (ordering.length === 0) {
    return;
  }

  const sql = getSql();
  for (const item of ordering) {
    await sql`
      update tasks
      set ord = ${item.order}, updated_at = now()
      where id = ${item.id}
    `;
  }
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const sql = getSql();
  await sql`delete from tasks where id = ${taskId}`;
};

export const getMetaValue = async (key: string): Promise<string | null> => {
  const sql = getSql();
  const rows = await sql<Array<{ value: string }>>`
    select value
    from system_meta
    where key = ${key}
    limit 1
  `;

  return rows[0]?.value ?? null;
};

export const setMetaValue = async (key: string, value: string): Promise<void> => {
  const sql = getSql();
  await sql`
    insert into system_meta (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key)
    do update set value = excluded.value, updated_at = now()
  `;
};
