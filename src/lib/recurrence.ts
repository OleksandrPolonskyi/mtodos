import { addRecurrenceInterval, todayInTimeZone } from "@/lib/date";
import { nowIso } from "@/lib/utils";
import type { TaskItem } from "@/types/domain";

const isDoneRecurringTask = (task: TaskItem): boolean => {
  return task.status === "done" && task.recurrence !== "none";
};

export interface RecurrenceResult {
  created: number;
  scanned: number;
}

export const planRecurringTasks = (
  tasks: TaskItem[],
  timezone: string
): Omit<TaskItem, "id">[] => {
  const existingByKey = new Set(
    tasks.map((task) => `${task.blockId}::${task.title}::${task.recurrence}::${task.dueDate}`)
  );

  const planned: Omit<TaskItem, "id">[] = [];
  const today = todayInTimeZone(timezone);

  for (const task of tasks) {
    if (!isDoneRecurringTask(task) || !task.dueDate) {
      continue;
    }

    let cursor = task.dueDate;

    for (let i = 0; i < 24; i += 1) {
      const nextDueDate = addRecurrenceInterval(cursor, task.recurrence);
      const key = `${task.blockId}::${task.title}::${task.recurrence}::${nextDueDate}`;

      if (existingByKey.has(key)) {
        cursor = nextDueDate;

        if (nextDueDate >= today) {
          break;
        }

        continue;
      }

      const createdAt = nowIso();
      planned.push({
        blockId: task.blockId,
        title: task.title,
        status: "todo",
        ownership: task.ownership,
        priority: task.priority,
        dependsOnTaskId: null,
        dueDate: nextDueDate,
        recurrence: task.recurrence,
        checklist: task.checklist.map((item) => ({ ...item, done: false })),
        order: task.order,
        createdAt,
        updatedAt: createdAt,
        completedAt: null
      });

      existingByKey.add(key);
      cursor = nextDueDate;

      if (nextDueDate >= today) {
        break;
      }
    }
  }

  return planned;
};
