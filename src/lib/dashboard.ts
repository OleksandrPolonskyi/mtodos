import { isDateOverdue, startAndEndOfWeek, todayInTimeZone } from "@/lib/date";
import type {
  BusinessBlock,
  DashboardWeeklyResponse,
  TaskItem
} from "@/types/domain";

const isOpenTask = (status: TaskItem["status"]): boolean => {
  return status === "todo" || status === "in_progress" || status === "blocked";
};

export const buildBlockedMap = (
  blocks: BusinessBlock[],
  tasks: TaskItem[],
  timezone: string
): Record<string, boolean> => {
  const blockedMap: Record<string, boolean> = {};
  for (const block of blocks) {
    blockedMap[block.id] = false;
  }

  const blockedTaskIds = buildTaskDependencyBlockedSet(tasks, timezone);
  for (const task of tasks) {
    if (blockedTaskIds.has(task.id)) {
      blockedMap[task.blockId] = true;
    }
  }

  return blockedMap;
};

export const buildTaskDependencyBlockedSet = (
  tasks: TaskItem[],
  _timezone: string
): Set<string> => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const blockedTaskIds = new Set<string>();

  for (const task of tasks) {
    if (!isOpenTask(task.status)) {
      continue;
    }

    if (!task.dependsOnTaskId) {
      continue;
    }

    const prerequisite = tasksById.get(task.dependsOnTaskId);
    if (!prerequisite) {
      continue;
    }

    if (prerequisite.status === "done") {
      continue;
    }

    blockedTaskIds.add(task.id);
  }

  return blockedTaskIds;
};

export const buildDashboardWeekly = (
  blocks: BusinessBlock[],
  tasks: TaskItem[],
  timezone: string
): DashboardWeeklyResponse => {
  const { weekStart, weekEnd } = startAndEndOfWeek(timezone);
  const today = todayInTimeZone(timezone);

  const tiles = {
    overdue: 0,
    today: 0,
    inProgress: 0,
    completed: 0
  };

  for (const task of tasks) {
    const openTask = isOpenTask(task.status);

    if (openTask && isDateOverdue(task.dueDate, timezone)) {
      tiles.overdue += 1;
    }

    if (openTask && task.dueDate === today) {
      tiles.today += 1;
    }

    if (task.status === "in_progress") {
      tiles.inProgress += 1;
    }

    if (task.status === "done") {
      if (!task.completedAt || task.completedAt.slice(0, 10) >= weekStart) {
        tiles.completed += 1;
      }
    }
  }

  const blockMap = new Map(
    blocks.map((block) => [
      block.id,
      {
        blockId: block.id,
        blockTitle: block.title,
        todo: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
        total: 0,
        progress: 0
      }
    ])
  );

  for (const task of tasks) {
    const isWeeklyTask =
      (task.dueDate !== null && task.dueDate >= weekStart && task.dueDate <= weekEnd) ||
      (task.dueDate !== null && task.dueDate < weekStart && isOpenTask(task.status));

    if (!isWeeklyTask) {
      continue;
    }

    const blockProgress = blockMap.get(task.blockId);

    if (!blockProgress) {
      continue;
    }

    blockProgress.total += 1;

    if (task.status === "todo") {
      blockProgress.todo += 1;
    } else if (task.status === "in_progress") {
      blockProgress.inProgress += 1;
    } else if (task.status === "blocked") {
      blockProgress.blocked += 1;
    } else if (task.status === "done") {
      blockProgress.done += 1;
    }
  }

  const normalizedBlocks = Array.from(blockMap.values()).map((item) => ({
    ...item,
    progress: item.total === 0 ? 0 : Math.round((item.done / item.total) * 100)
  }));

  return {
    weekStart,
    weekEnd,
    timezone,
    tiles,
    blocks: normalizedBlocks
  };
};
