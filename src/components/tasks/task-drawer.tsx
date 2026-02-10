"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  GripVertical,
  Plus,
  Trash2,
  X
} from "lucide-react";
import type {
  BusinessBlock,
  ChecklistItem,
  TaskItem,
  TaskStatus
} from "@/types/domain";
import {
  blockIconOptions,
  getBlockIconOption,
  resolveBlockIconName
} from "@/lib/block-icons";
import { PomodoroTag } from "@/components/tasks/pomodoro-tag";
import { cn } from "@/lib/utils";

interface NewTaskInput {
  title: string;
  dueDate: string | null;
}

interface TaskDrawerProps {
  block: BusinessBlock | null;
  blocks: BusinessBlock[];
  tasks: TaskItem[];
  allTasks: TaskItem[];
  taskFlowStepById: ReadonlyMap<string, number>;
  autoStartCreateToken?: number;
  autoStartCreateBlockId?: string | null;
  dependencyBlockedTaskIds: ReadonlySet<string>;
  onClose: () => void;
  onRenameBlock: (blockId: string, title: string) => Promise<void>;
  onUpdateBlockIcon: (blockId: string, iconName: BusinessBlock["iconName"]) => Promise<void>;
  onCreateTask: (payload: NewTaskInput) => Promise<TaskItem | null>;
  onUpdateTask: (taskId: string, payload: Partial<TaskItem>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onMoveTask: (taskId: string, direction: "up" | "down") => Promise<void>;
  onArchiveBlock: (blockId: string) => Promise<void>;
  className?: string;
}

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "До виконання" },
  { value: "in_progress", label: "В роботі" },
  { value: "blocked", label: "Заблоковано" },
  { value: "done", label: "Готово" }
];

const statusBadgeClasses: Record<TaskStatus, string> = {
  todo:
    "border border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/50 dark:bg-sky-900/45 dark:text-sky-100",
  in_progress:
    "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-900/45 dark:text-emerald-100",
  blocked:
    "border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  done:
    "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/45 dark:bg-emerald-900/35 dark:text-emerald-100"
};

const statusLabelMap: Record<TaskStatus, string> = {
  todo: "До виконання",
  in_progress: "В роботі",
  blocked: "Заблоковано",
  done: "Готово"
};

const taskStatusOrder: Record<TaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  done: 3
};

const ownershipLabelMap: Record<TaskItem["ownership"], string> = {
  mine: "Моє",
  delegated: "Делеговано"
};

const formatDueDate = (dueDate: string | null): string => {
  if (!dueDate) {
    return "Без дати";
  }

  const parsed = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dueDate;
  }

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short"
  }).format(parsed);
};

type DueDateTone = "normal" | "warning" | "overdue";

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getQuickDueDateValue = (preset: "today" | "tomorrow" | "weekend"): string => {
  const base = new Date();
  if (preset === "today") {
    return toLocalDateString(base);
  }

  if (preset === "tomorrow") {
    const tomorrow = new Date(base);
    tomorrow.setDate(base.getDate() + 1);
    return toLocalDateString(tomorrow);
  }

  const weekend = new Date(base);
  const weekday = weekend.getDay();
  if (weekday !== 6 && weekday !== 0) {
    weekend.setDate(weekend.getDate() + (6 - weekday));
  }
  return toLocalDateString(weekend);
};

const toDateTimestamp = (date: string | null): number => {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed;
};

const quickDueDateOptions = [
  { value: "today", label: "Сьогодні" },
  { value: "tomorrow", label: "Завтра" },
  { value: "weekend", label: "На вихідних" }
] as const;

const reorderChecklistItems = (
  checklist: ChecklistItem[],
  draggedItemId: string,
  targetItemId: string
): ChecklistItem[] => {
  if (draggedItemId === targetItemId) {
    return checklist;
  }

  const nextChecklist = [...checklist];
  const draggedIndex = nextChecklist.findIndex((item) => item.id === draggedItemId);
  const targetIndex = nextChecklist.findIndex((item) => item.id === targetItemId);

  if (draggedIndex < 0 || targetIndex < 0) {
    return checklist;
  }

  const [draggedItem] = nextChecklist.splice(draggedIndex, 1);
  nextChecklist.splice(targetIndex, 0, draggedItem);
  return nextChecklist;
};

const getDueDateTone = (dueDate: string | null, status: TaskStatus): DueDateTone => {
  if (!dueDate || status === "done") {
    return "normal";
  }

  const today = new Date();
  const todayStr = toLocalDateString(today);
  const warningBorder = new Date(today);
  warningBorder.setDate(today.getDate() + 1);
  const warningBorderStr = toLocalDateString(warningBorder);

  if (dueDate < todayStr) {
    return "overdue";
  }

  if (dueDate <= warningBorderStr) {
    return "warning";
  }

  return "normal";
};

const dueDateTagClasses: Record<DueDateTone, string> = {
  normal: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  warning: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/55 dark:bg-amber-900/55 dark:text-amber-100",
  overdue: "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/55 dark:bg-rose-900/50 dark:text-rose-100"
};

const taskTitleToneClasses: Record<DueDateTone, string> = {
  normal: "text-slate-900 dark:text-slate-100",
  warning: "text-slate-900 dark:text-slate-100",
  overdue: "text-rose-700 dark:text-rose-300"
};

export function TaskDrawer({
  block,
  blocks,
  tasks,
  allTasks,
  taskFlowStepById,
  autoStartCreateToken = 0,
  autoStartCreateBlockId = null,
  dependencyBlockedTaskIds,
  onClose,
  onRenameBlock,
  onUpdateBlockIcon,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onArchiveBlock,
  className
}: TaskDrawerProps): React.ReactElement {
  const [checklistDraft, setChecklistDraft] = useState<Record<string, string>>({});
  const [checklistComposerOpenByTask, setChecklistComposerOpenByTask] = useState<Record<string, boolean>>({});
  const [editingChecklistByItem, setEditingChecklistByItem] = useState<Record<string, string>>({});
  const [draggingChecklistItem, setDraggingChecklistItem] = useState<{
    taskId: string;
    itemId: string;
  } | null>(null);
  const [editingTitleByTask, setEditingTitleByTask] = useState<Record<string, string>>({});
  const [dependencyEditorOpenByTask, setDependencyEditorOpenByTask] = useState<Record<string, boolean>>({});
  const [creatingTask, setCreatingTask] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [newTaskTitleDraft, setNewTaskTitleDraft] = useState("");
  const [taskIdToFocus, setTaskIdToFocus] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [quickEditor, setQuickEditor] = useState<{
    taskId: string;
    type: "status" | "dueDate" | "ownership";
  } | null>(null);
  const [blockTitleDraft, setBlockTitleDraft] = useState("");
  const [savingBlockTitle, setSavingBlockTitle] = useState(false);
  const [savingIconName, setSavingIconName] = useState<string | null>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const previousAutoStartTokenRef = useRef<number>(-1);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aComputedStatus: TaskStatus = dependencyBlockedTaskIds.has(a.id) ? "blocked" : a.status;
      const bComputedStatus: TaskStatus = dependencyBlockedTaskIds.has(b.id) ? "blocked" : b.status;

      const statusDiff = taskStatusOrder[aComputedStatus] - taskStatusOrder[bComputedStatus];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      const dueDiff = toDateTimestamp(a.dueDate) - toDateTimestamp(b.dueDate);
      if (dueDiff !== 0) {
        return dueDiff;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [dependencyBlockedTaskIds, tasks]);

  const ownTasks = useMemo(() => {
    return sortedTasks.filter((task) => task.ownership === "mine");
  }, [sortedTasks]);

  const delegatedTasks = useMemo(() => {
    return sortedTasks.filter((task) => task.ownership === "delegated");
  }, [sortedTasks]);

  const groupedTasks = useMemo(() => {
    return [...ownTasks, ...delegatedTasks];
  }, [delegatedTasks, ownTasks]);
  const firstDelegatedTaskId = delegatedTasks[0]?.id ?? null;

  const blocksById = useMemo(() => new Map(blocks.map((item) => [item.id, item])), [blocks]);
  const allTasksById = useMemo(() => new Map(allTasks.map((item) => [item.id, item])), [allTasks]);
  const dependencySourceTaskIds = useMemo(
    () =>
      new Set(
        allTasks
          .filter((item) => Boolean(item.dependsOnTaskId))
          .map((item) => item.dependsOnTaskId as string)
      ),
    [allTasks]
  );
  const dependencyTaskOptions = useMemo(() => {
    return [...allTasks]
      .map((item) => {
        const blockTitle = blocksById.get(item.blockId)?.title ?? "Блок";
        return {
          id: item.id,
          label: `${blockTitle} / ${item.title}`,
          blockTitle,
          order: item.order,
          updatedAt: item.updatedAt
        };
      })
      .sort((a, b) => {
        const blockCompare = a.blockTitle.localeCompare(b.blockTitle, "uk");
        if (blockCompare !== 0) {
          return blockCompare;
        }
        return a.order - b.order || a.updatedAt.localeCompare(b.updatedAt);
      });
  }, [allTasks, blocksById]);

  useEffect(() => {
    setBlockTitleDraft(block?.title ?? "");
  }, [block?.id, block?.title]);

  useEffect(() => {
    setIsIconPickerOpen(false);
  }, [block?.id]);

  useEffect(() => {
    setQuickEditor(null);
    setEditingChecklistByItem({});
    setChecklistComposerOpenByTask({});
    setDependencyEditorOpenByTask({});
    setIsCreateFormOpen(false);
    setNewTaskTitleDraft("");
  }, [block?.id]);

  useEffect(() => {
    if (!isCreateFormOpen) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      newTaskInputRef.current?.focus();
      newTaskInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isCreateFormOpen]);

  useEffect(() => {
    if (!taskIdToFocus) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      const titleInput = document.querySelector<HTMLInputElement>(
        `[data-task-id="${taskIdToFocus}"] [data-task-title-input="true"]`
      );
      if (!titleInput) {
        return;
      }

      titleInput.focus();
      titleInput.select();
      setTaskIdToFocus(null);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [groupedTasks, taskIdToFocus]);

  useEffect(() => {
    if (!isIconPickerOpen) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (iconPickerRef.current?.contains(target)) {
        return;
      }

      setIsIconPickerOpen(false);
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isIconPickerOpen]);

  useEffect(() => {
    if (!quickEditor) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setQuickEditor(null);
        return;
      }

      if (target.closest("[data-quick-editor='true']")) {
        return;
      }

      setQuickEditor(null);
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [quickEditor]);

  const handleCreate = async (
    title: string,
    options?: { closeForm?: boolean; focusCreatedTask?: boolean }
  ): Promise<void> => {
    setCreatingTask(true);

    try {
      const createdTask = await onCreateTask({
        title: title.trim() || "Нова задача",
        dueDate: null
      });
      if (createdTask && options?.focusCreatedTask) {
        setExpandedTaskId(createdTask.id);
        setEditingTitleByTask((prev) => ({
          ...prev,
          [createdTask.id]: createdTask.title
        }));
        setTaskIdToFocus(createdTask.id);
      }
      setNewTaskTitleDraft("");
      if (options?.closeForm ?? true) {
        setIsCreateFormOpen(false);
      }
    } finally {
      setCreatingTask(false);
    }
  };

  useEffect(() => {
    if (autoStartCreateToken === previousAutoStartTokenRef.current) {
      return;
    }

    previousAutoStartTokenRef.current = autoStartCreateToken;

    if (!block || autoStartCreateBlockId !== block.id) {
      return;
    }

    setExpandedTaskId(null);
    setNewTaskTitleDraft("");
    setIsCreateFormOpen(true);
  }, [autoStartCreateBlockId, autoStartCreateToken, block]);

  const handleBlockRename = async (): Promise<void> => {
    if (!block) {
      return;
    }

    const normalizedTitle = blockTitleDraft.trim();
    if (!normalizedTitle) {
      setBlockTitleDraft(block.title);
      return;
    }

    if (normalizedTitle === block.title) {
      return;
    }

    setSavingBlockTitle(true);

    try {
      await onRenameBlock(block.id, normalizedTitle);
    } finally {
      setSavingBlockTitle(false);
    }
  };

  const handleBlockIconUpdate = async (iconName: BusinessBlock["iconName"]): Promise<void> => {
    if (!block) {
      return;
    }

    if (iconName === block.iconName) {
      return;
    }

    setSavingIconName(iconName);

    try {
      await onUpdateBlockIcon(block.id, iconName);
      setIsIconPickerOpen(false);
    } finally {
      setSavingIconName(null);
    }
  };

  if (!block) {
    return (
      <aside
        className={cn(
          "surface-panel lift-enter lift-delay-3 w-full rounded-2xl p-6",
          className
        )}
      >
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList size={16} />
          Оберіть блок на канвасі, щоб керувати задачами.
        </p>
      </aside>
    );
  }

  const activeIconOption = getBlockIconOption(resolveBlockIconName(block));
  const ActiveIcon = activeIconOption.icon;

  const shouldIgnoreTaskContainerToggle = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        "button, input, textarea, select, a, label, [data-quick-editor='true'], [data-task-no-toggle='true']"
      )
    );
  };

  return (
    <aside
      className={cn(
        "surface-panel lift-enter lift-delay-3 h-full w-full overflow-y-auto rounded-2xl p-5",
        className
      )}
      onPointerDownCapture={(event) => {
        if (!expandedTaskId) {
          return;
        }

        const target = event.target as Element | null;
        if (!target) {
          setExpandedTaskId(null);
          return;
        }

        // Do not collapse on interactions with controls inside tasks
        // (e.g. Pomodoro play/pause), otherwise the first click can be swallowed.
        if (shouldIgnoreTaskContainerToggle(target)) {
          return;
        }

        const taskElement = target.closest<HTMLElement>("[data-task-item='true']");
        const clickedTaskId = taskElement?.dataset.taskId ?? null;
        if (clickedTaskId !== expandedTaskId) {
          window.setTimeout(() => {
            setExpandedTaskId((current) => (current === expandedTaskId ? null : current));
          }, 0);
        }
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div ref={iconPickerRef} className="relative mb-1 w-fit">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition duration-100 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:bg-sky-900/40"
              onClick={() => setIsIconPickerOpen((current) => !current)}
              aria-label="Вибрати іконку блоку"
              title="Вибрати іконку блоку"
            >
              <ActiveIcon size={18} />
            </button>
            {isIconPickerOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Іконка блоку
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {blockIconOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = option.value === activeIconOption.value;
                    const isSaving = savingIconName === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-md border transition duration-100",
                          selected
                            ? "bg-sky-100 text-sky-700 border-sky-300"
                            : "bg-white text-slate-600 border-slate-200 hover:border-sky-200 hover:bg-sky-50",
                          isSaving ? "opacity-65" : ""
                        )}
                        onClick={() => void handleBlockIconUpdate(option.value)}
                        title={option.label}
                        aria-label={option.label}
                        disabled={Boolean(savingIconName)}
                      >
                        <Icon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <input
            className={cn(
              "font-display w-full max-w-[280px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight text-slate-900 outline-none transition sm:max-w-[320px]",
              "focus:border-slate-300 focus:bg-white/85",
              savingBlockTitle ? "opacity-70" : ""
            )}
            value={blockTitleDraft}
            onChange={(event) => setBlockTitleDraft(event.target.value)}
            onBlur={() => {
              void handleBlockRename();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                return;
              }

              if (event.key === "Escape") {
                setBlockTitleDraft(block.title);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={creatingTask}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold leading-none text-sky-800 transition duration-100 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
            onClick={() => setIsCreateFormOpen(true)}
          >
            <Plus size={14} />
            Нова задача
          </button>
          <button
            type="button"
            className="soft-button inline-flex h-9 w-9 items-center justify-center text-slate-600"
            onClick={onClose}
            aria-label="Закрити"
            title="Закрити"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            className="soft-button inline-flex h-9 w-9 items-center justify-center border-destructive text-destructive"
            onClick={() => onArchiveBlock(block.id)}
            aria-label="Архівувати"
            title="Архівувати"
          >
            <Archive size={14} />
          </button>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Список задач
          </div>
          <div className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
            {ownTasks.length}
          </div>
        </div>

        <div className="space-y-3">
          {isCreateFormOpen ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-500/55 dark:bg-sky-950/55">
              <div className="flex items-center gap-2">
                <input
                  ref={newTaskInputRef}
                  className="soft-input flex-1 px-2.5 py-1.5 text-sm"
                  placeholder="Назва нової задачі"
                  value={newTaskTitleDraft}
                  onChange={(event) => setNewTaskTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreate(newTaskTitleDraft, { closeForm: true });
                      return;
                    }

                    if (event.key === "Escape") {
                      setIsCreateFormOpen(false);
                      setNewTaskTitleDraft("");
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={creatingTask}
                  className="primary-button inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleCreate(newTaskTitleDraft, { closeForm: true })}
                >
                  <Plus size={12} />
                  Додати
                </button>
                <button
                  type="button"
                  className="soft-button inline-flex h-8 w-8 items-center justify-center"
                  onClick={() => {
                    setIsCreateFormOpen(false);
                    setNewTaskTitleDraft("");
                  }}
                  aria-label="Скасувати створення задачі"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : null}

          {ownTasks.length === 0 ? (
            <button
              type="button"
              disabled={creatingTask}
              className={cn(
                "w-full rounded-lg border border-dashed border-border bg-white/80 p-4 text-center text-sm text-muted-foreground transition duration-100 hover:border-sky-300 hover:bg-sky-50/50",
                "dark:bg-slate-900/70 dark:hover:border-sky-500 dark:hover:bg-sky-900/25",
                creatingTask ? "cursor-not-allowed opacity-65" : ""
              )}
              onClick={() => setIsCreateFormOpen(true)}
            >
              Поки немає задач для тебе. Натисни <span className="font-semibold">Нова задача</span>.
            </button>
          ) : null}

          {groupedTasks.map((task) => {
            const globalIndex = sortedTasks.findIndex((entry) => entry.id === task.id);
            const draftTitle = editingTitleByTask[task.id] ?? task.title;
            const checklistInput = checklistDraft[task.id] ?? "";
            const isChecklistComposerOpen = Boolean(checklistComposerOpenByTask[task.id]);
            const isDependencyEditorOpen = Boolean(dependencyEditorOpenByTask[task.id]);
            const isExpanded = expandedTaskId === task.id;
            const showChecklistSection = task.checklist.length > 0 || isExpanded;
            const dueDateTone = getDueDateTone(task.dueDate, task.status);
            const isStatusEditorOpen =
              quickEditor?.taskId === task.id && quickEditor.type === "status";
            const isDueDateEditorOpen =
              quickEditor?.taskId === task.id && quickEditor.type === "dueDate";
            const isOwnershipEditorOpen =
              quickEditor?.taskId === task.id && quickEditor.type === "ownership";
            const dependencyTask = task.dependsOnTaskId
              ? allTasksById.get(task.dependsOnTaskId) ?? null
              : null;
            const taskDependencyOptions = dependencyTaskOptions.filter(
              (candidate) => candidate.id !== task.id
            );
            const isBlockedByDependency = dependencyBlockedTaskIds.has(task.id);
            const isDependentTask = Boolean(task.dependsOnTaskId);
            const isDependencySourceTask = dependencySourceTaskIds.has(task.id);
            const flowStep = taskFlowStepById.get(task.id) ?? null;

            return (
              <div key={task.id}>
                {task.id === firstDelegatedTaskId ? (
                  <div className="mb-2 pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Делеговано
                  </div>
                ) : null}
                <article
                  data-task-item="true"
                  data-task-id={task.id}
                  className={cn(
                    "relative overflow-visible rounded-xl border bg-white p-3 transition-colors duration-100 dark:bg-slate-900/92",
                    isDependentTask
                      ? "border-violet-300 hover:border-violet-400 dark:border-violet-500/70 dark:hover:border-violet-400/80"
                      : isDependencySourceTask
                        ? "border-violet-200 hover:border-violet-300 dark:border-violet-500/45 dark:hover:border-violet-400/70"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500"
                  )}
                  onClick={(event) => {
                    if (shouldIgnoreTaskContainerToggle(event.target)) {
                      return;
                    }

                    setExpandedTaskId((current) => (current === task.id ? null : task.id));
                  }}
                >
                  <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 hover:border-sky-300 hover:text-sky-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-200"
                    onClick={async () => {
                      await onUpdateTask(task.id, {
                        status: task.status === "done" ? "todo" : "done"
                      });
                    }}
                  >
                    {task.status === "done" ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      {isExpanded ? (
                        <textarea
                          data-task-title-input="true"
                          className={cn(
                            "w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-transparent px-1 py-1 text-base font-semibold leading-tight outline-none transition focus:border-slate-300 dark:focus:border-slate-600",
                            task.status === "done"
                              ? "text-slate-500 line-through"
                              : taskTitleToneClasses[dueDateTone]
                          )}
                          rows={1}
                          value={draftTitle}
                          ref={(element) => {
                            if (!element) {
                              return;
                            }
                            element.style.height = "0px";
                            element.style.height = `${element.scrollHeight}px`;
                          }}
                          onInput={(event) => {
                            const element = event.currentTarget;
                            element.style.height = "0px";
                            element.style.height = `${element.scrollHeight}px`;
                          }}
                          onChange={(event) => {
                            setEditingTitleByTask((prev) => ({
                              ...prev,
                              [task.id]: event.target.value
                            }));
                          }}
                          onFocus={() => setExpandedTaskId(task.id)}
                          onBlur={async () => {
                            const nextTitle = draftTitle.trim();
                            if (nextTitle && nextTitle !== task.title) {
                              await onUpdateTask(task.id, { title: nextTitle });
                            }
                          }}
                        ></textarea>
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-md px-1 py-1 text-left text-base font-semibold leading-tight",
                            task.status === "done"
                              ? "text-slate-500 line-through"
                              : taskTitleToneClasses[dueDateTone]
                          )}
                          onClick={() => setExpandedTaskId(task.id)}
                        >
                          {task.title}
                        </button>
                      )}
                      {flowStep ? (
                        <span className="mt-1 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-100 px-1 text-[10px] font-bold text-violet-700 dark:border-violet-500/60 dark:bg-violet-900/55 dark:text-violet-100">
                          {flowStep}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <div className="relative" data-quick-editor="true">
                        <button
                          type="button"
                          className={cn(
                            "inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs sm:text-sm font-bold uppercase tracking-[0.07em] leading-none transition duration-100 hover:brightness-95",
                            statusBadgeClasses[task.status]
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickEditor((current) =>
                              current?.taskId === task.id && current.type === "status"
                                ? null
                                : { taskId: task.id, type: "status" }
                            );
                          }}
                        >
                          {statusLabelMap[task.status]}
                        </button>
                        {isStatusEditorOpen ? (
                          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            {statusOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={cn(
                                  "mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition duration-100 last:mb-0",
                                  option.value === task.status
                                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/55 dark:text-sky-100"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                )}
                                onClick={async () => {
                                  await onUpdateTask(task.id, { status: option.value });
                                  setQuickEditor(null);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="relative" data-quick-editor="true">
                        <button
                          type="button"
                          className={cn(
                            "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-xs sm:text-sm font-semibold leading-none transition duration-100 hover:brightness-95",
                            dueDateTagClasses[dueDateTone]
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickEditor((current) =>
                              current?.taskId === task.id && current.type === "dueDate"
                                ? null
                                : { taskId: task.id, type: "dueDate" }
                            );
                          }}
                        >
                          <CalendarClock size={12} />
                          {formatDueDate(task.dueDate)}
                        </button>
                        {isDueDateEditorOpen ? (
                          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <div className="mb-2 flex flex-wrap gap-1">
                              {quickDueDateOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className="soft-button whitespace-nowrap px-2.5 py-1.5 text-xs font-semibold"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await onUpdateTask(task.id, {
                                      dueDate: getQuickDueDateValue(option.value)
                                    });
                                    setQuickEditor(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="soft-button inline-flex w-full items-center justify-center px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200"
                              onClick={async () => {
                                await onUpdateTask(task.id, { dueDate: null });
                                setQuickEditor(null);
                              }}
                            >
                              Очистити дату
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {task.ownership !== "delegated" ? (
                        <PomodoroTag
                          task={task}
                          onPersist={async (taskId, payload) => {
                            await onUpdateTask(taskId, payload);
                          }}
                        />
                      ) : null}

                      {isExpanded ? (
                        <div className="relative" data-quick-editor="true">
                        <button
                          type="button"
                          className={cn(
                            "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-xs sm:text-sm font-semibold leading-none transition duration-100",
                            task.ownership === "mine"
                              ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200/80 dark:border-sky-500/55 dark:bg-sky-900/55 dark:text-sky-100 dark:hover:bg-sky-900"
                              : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            )}
                            onClick={(event) => {
                              event.stopPropagation();
                              setQuickEditor((current) =>
                                current?.taskId === task.id && current.type === "ownership"
                                  ? null
                                  : { taskId: task.id, type: "ownership" }
                              );
                            }}
                          >
                            {ownershipLabelMap[task.ownership]}
                          </button>
                          {isOwnershipEditorOpen ? (
                            <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              {(
                                [
                                  { value: "mine", label: "Моє" },
                                  { value: "delegated", label: "Делеговано" }
                                ] as const
                              ).map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition duration-100 last:mb-0",
                                    option.value === task.ownership
                                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/55 dark:text-sky-100"
                                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                  )}
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    if (option.value !== task.ownership) {
                                      await onUpdateTask(task.id, { ownership: option.value });
                                    }
                                    setQuickEditor(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                    </div>

                    {isBlockedByDependency && dependencyTask ? (
                      <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] sm:text-xs font-semibold text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/50 dark:text-amber-100">
                        <AlertTriangle size={12} />
                        <span className="truncate">
                          Блокує прострочена задача: {dependencyTask.title}
                        </span>
                      </div>
                    ) : null}

                    {showChecklistSection ? (
                      <div className="mt-2 border-t border-slate-200/70 pt-2 dark:border-slate-700/70">
                        <div className="ml-3 space-y-1.5">
                          {task.checklist.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200",
                                draggingChecklistItem?.taskId === task.id &&
                                  draggingChecklistItem.itemId === item.id
                                  ? "opacity-55"
                                  : ""
                              )}
                              onDragOver={(event) => {
                                if (!isExpanded || draggingChecklistItem?.taskId !== task.id) {
                                  return;
                                }
                                event.preventDefault();
                              }}
                              onDrop={async (event) => {
                                if (!isExpanded || draggingChecklistItem?.taskId !== task.id) {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();

                                if (draggingChecklistItem.itemId === item.id) {
                                  setDraggingChecklistItem(null);
                                  return;
                                }

                                const nextChecklist = reorderChecklistItems(
                                  task.checklist,
                                  draggingChecklistItem.itemId,
                                  item.id
                                );
                                if (nextChecklist !== task.checklist) {
                                  await onUpdateTask(task.id, { checklist: nextChecklist });
                                }
                                setDraggingChecklistItem(null);
                              }}
                            >
                              {isExpanded ? (
                                <button
                                  type="button"
                                  draggable
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 cursor-grab active:cursor-grabbing dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onDragStart={(event) => {
                                    event.stopPropagation();
                                    setDraggingChecklistItem({
                                      taskId: task.id,
                                      itemId: item.id
                                    });
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", item.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingChecklistItem(null);
                                  }}
                                  aria-label="Перемістити підзадачу"
                                  title="Перемістити підзадачу"
                                >
                                  <GripVertical size={14} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 hover:border-sky-300 hover:text-sky-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-200"
                                onClick={async () => {
                                  const nextChecklist: ChecklistItem[] = task.checklist.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          done: !entry.done
                                        }
                                      : entry
                                  );

                                  await onUpdateTask(task.id, { checklist: nextChecklist });
                                }}
                              >
                                {item.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                              </button>
                              {isExpanded ? (
                                <>
                                  <input
                                    className={cn(
                                      "soft-input min-w-0 flex-1 px-2.5 py-2 text-base sm:text-sm",
                                      item.done ? "line-through text-slate-500" : ""
                                    )}
                                    value={editingChecklistByItem[`${task.id}:${item.id}`] ?? item.text}
                                    onChange={(event) => {
                                      const key = `${task.id}:${item.id}`;
                                      setEditingChecklistByItem((prev) => ({
                                        ...prev,
                                        [key]: event.target.value
                                      }));
                                    }}
                                    onBlur={async (event) => {
                                      const key = `${task.id}:${item.id}`;
                                      const nextText = event.target.value.trim();

                                      if (!nextText) {
                                        setEditingChecklistByItem((prev) => ({
                                          ...prev,
                                          [key]: item.text
                                        }));
                                        return;
                                      }

                                      if (nextText !== item.text) {
                                        const nextChecklist: ChecklistItem[] = task.checklist.map((entry) =>
                                          entry.id === item.id
                                            ? {
                                                ...entry,
                                                text: nextText
                                              }
                                            : entry
                                        );

                                        await onUpdateTask(task.id, { checklist: nextChecklist });
                                      }

                                      setEditingChecklistByItem((prev) => {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.currentTarget.blur();
                                        return;
                                      }

                                      if (event.key === "Escape") {
                                        const key = `${task.id}:${item.id}`;
                                        setEditingChecklistByItem((prev) => ({
                                          ...prev,
                                          [key]: item.text
                                        }));
                                        event.currentTarget.blur();
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="soft-button inline-flex h-7 w-7 items-center justify-center border-destructive text-destructive"
                                    onClick={async () => {
                                      const nextChecklist = task.checklist.filter((entry) => entry.id !== item.id);
                                      await onUpdateTask(task.id, { checklist: nextChecklist });
                                    }}
                                    aria-label="Видалити підзадачу"
                                    title="Видалити підзадачу"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              ) : (
                                <span className={item.done ? "line-through opacity-70" : ""}>{item.text}</span>
                              )}
                            </div>
                          ))}

                          {isExpanded ? (
                            isChecklistComposerOpen ? (
                              <div className="flex gap-2 pt-1">
                                <input
                                  className="soft-input w-full px-2.5 py-2 text-base sm:text-sm"
                                  placeholder="Нова підзадача"
                                  value={checklistInput}
                                  onChange={(event) => {
                                    setChecklistDraft((prev) => ({
                                      ...prev,
                                      [task.id]: event.target.value
                                    }));
                                  }}
                                />
                                <button
                                  type="button"
                                  className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold sm:text-xs"
                                  onClick={async () => {
                                    const text = checklistInput.trim();
                                    if (!text) {
                                      return;
                                    }

                                    const nextChecklist: ChecklistItem[] = [
                                      ...task.checklist,
                                      {
                                        id: crypto.randomUUID(),
                                        text,
                                        done: false
                                      }
                                    ];

                                    await onUpdateTask(task.id, { checklist: nextChecklist });
                                    setChecklistDraft((prev) => ({ ...prev, [task.id]: "" }));
                                    setChecklistComposerOpenByTask((prev) => ({
                                      ...prev,
                                      [task.id]: false
                                    }));
                                  }}
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold sm:text-xs"
                                  onClick={() => {
                                    setChecklistComposerOpenByTask((prev) => ({
                                      ...prev,
                                      [task.id]: false
                                    }));
                                  }}
                                  aria-label="Скасувати додавання підзадачі"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sky-700 transition duration-100 sm:text-xs dark:text-sky-300"
                                onClick={() => {
                                  setChecklistComposerOpenByTask((prev) => ({
                                    ...prev,
                                    [task.id]: true
                                  }));
                                }}
                              >
                                <Plus size={12} />
                                Додати підзадачу
                              </button>
                            )
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="soft-button inline-flex h-8 w-8 items-center justify-center"
                    onClick={() => setExpandedTaskId((current) => (current === task.id ? null : task.id))}
                  >
                    <ChevronDown
                      size={14}
                      className={cn("transition duration-100", isExpanded ? "rotate-180" : "")}
                    />
                  </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
                    {isDependencyEditorOpen ? (
                      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/85">
                        <div className="mb-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                          Залежність задачі
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <select
                            className="soft-input px-2 py-1 text-xs"
                            value={task.dependsOnTaskId ?? ""}
                            onChange={async (event) => {
                              const nextTaskId = event.target.value || null;
                              await onUpdateTask(task.id, { dependsOnTaskId: nextTaskId });
                            }}
                          >
                            <option value="">Без залежності</option>
                            {taskDependencyOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold text-slate-600 sm:text-xs dark:text-slate-200"
                            onClick={async () => {
                              await onUpdateTask(task.id, { dependsOnTaskId: null });
                            }}
                          >
                            Очистити
                          </button>
                          <button
                            type="button"
                            className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold sm:text-xs"
                            onClick={() => {
                              setDependencyEditorOpenByTask((prev) => ({
                                ...prev,
                                [task.id]: false
                              }));
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mb-3 inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sky-700 transition duration-100 sm:text-xs dark:text-sky-300"
                        onClick={() => {
                          setDependencyEditorOpenByTask((prev) => ({
                            ...prev,
                            [task.id]: true
                          }));
                        }}
                      >
                        <Plus size={12} />
                        {task.dependsOnTaskId ? "Змінити залежність" : "Додати залежність"}
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="soft-button inline-flex items-center px-2 py-1 text-xs font-semibold disabled:opacity-40"
                          disabled={globalIndex <= 0}
                          onClick={() => onMoveTask(task.id, "up")}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="soft-button inline-flex items-center px-2 py-1 text-xs font-semibold disabled:opacity-40"
                          disabled={globalIndex < 0 || globalIndex === sortedTasks.length - 1}
                          onClick={() => onMoveTask(task.id, "down")}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="soft-button inline-flex items-center gap-1 border-destructive px-2.5 py-1 text-xs font-semibold text-destructive"
                        onClick={() => onDeleteTask(task.id)}
                      >
                        <Trash2 size={12} />
                        Видалити
                      </button>
                    </div>
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
