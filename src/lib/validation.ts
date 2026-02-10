import { z } from "zod";
import { blockIconNames } from "@/types/domain";

export const blockTypeSchema = z.enum([
  "website",
  "suppliers",
  "ads",
  "orders",
  "content",
  "finance",
  "support",
  "operations",
  "custom"
]);
export const blockIconSchema = z.enum(blockIconNames);

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "blocked"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export const taskOwnershipSchema = z.enum(["mine", "delegated"]);

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(280),
  done: z.boolean()
});

export const createBlockSchema = z.object({
  title: z.string().min(1).max(120),
  type: blockTypeSchema,
  color: z.string().min(4).max(16),
  iconName: blockIconSchema.nullable().optional(),
  x: z.number(),
  y: z.number()
});

export const updateBlockSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  type: blockTypeSchema.optional(),
  color: z.string().min(4).max(16).optional(),
  iconName: blockIconSchema.nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional()
});

export const repositionSchema = z.object({
  positions: z.array(
    z.object({
      id: z.string().min(1),
      x: z.number(),
      y: z.number()
    })
  )
});

export const createEdgeSchema = z.object({
  sourceBlockId: z.string().min(1),
  targetBlockId: z.string().min(1)
});

export const createTaskSchema = z.object({
  blockId: z.string().min(1),
  title: z.string().min(1).max(180),
  status: taskStatusSchema.optional(),
  ownership: taskOwnershipSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dependsOnTaskId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  pomodoroSeconds: z.number().int().min(0).optional(),
  pomodoroSessions: z.number().int().min(0).optional(),
  order: z.number().optional()
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  status: taskStatusSchema.optional(),
  ownership: taskOwnershipSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dependsOnTaskId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  pomodoroSeconds: z.number().int().min(0).optional(),
  pomodoroSessions: z.number().int().min(0).optional(),
  order: z.number().optional(),
  completedAt: z.string().datetime().nullable().optional()
});

export const reorderTasksSchema = z.object({
  ordering: z.array(
    z.object({
      id: z.string().min(1),
      order: z.number().int()
    })
  )
});

export const updateWorkspaceSchema = z.object({
  title: z.string().min(1).max(120)
});
