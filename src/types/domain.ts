export type BlockType =
  | "website"
  | "suppliers"
  | "ads"
  | "orders"
  | "content"
  | "finance"
  | "support"
  | "operations"
  | "custom";

export const blockIconNames = [
  "globe",
  "truck",
  "megaphone",
  "package",
  "pen",
  "wallet",
  "headset",
  "gear",
  "shapes",
  "store",
  "chart",
  "users"
] as const;

export type BlockIconName = (typeof blockIconNames)[number];

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high";
export type TaskOwnership = "mine" | "delegated";

export interface BusinessBlock {
  id: string;
  title: string;
  type: BlockType;
  color: string;
  iconName: BlockIconName | null;
  x: number;
  y: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BlockEdge {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
  relation: "depends_on";
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskItem {
  id: string;
  blockId: string;
  title: string;
  status: TaskStatus;
  ownership: TaskOwnership;
  priority: TaskPriority;
  dependsOnTaskId: string | null;
  dueDate: string | null;
  checklist: ChecklistItem[];
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ReminderSummary {
  overdue: number;
  dueSoon: number;
}

export interface DashboardTileMetrics {
  overdue: number;
  today: number;
  inProgress: number;
  completed: number;
}

export interface BlockWeeklyProgress {
  blockId: string;
  blockTitle: string;
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
  progress: number;
}

export interface DashboardWeeklyResponse {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  tiles: DashboardTileMetrics;
  blocks: BlockWeeklyProgress[];
}

export interface BlocksResponse {
  blocks: BusinessBlock[];
}

export interface EdgesResponse {
  edges: BlockEdge[];
}

export interface TasksResponse {
  tasks: TaskItem[];
}
