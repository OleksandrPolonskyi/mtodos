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
  Link2,
  Plus,
  Repeat,
  Trash2,
  X
} from "lucide-react";
import type {
  BusinessBlock,
  ChecklistItem,
  Recurrence,
  TaskItem,
  TaskStatus
} from "@/types/domain";
import {
  blockIconOptions,
  getBlockIconOption,
  resolveBlockIconName
} from "@/lib/block-icons";
import { cn } from "@/lib/utils";

interface NewTaskInput {
  title: string;
  dueDate: string | null;
  recurrence: Recurrence;
}

interface TaskDrawerProps {
  block: BusinessBlock | null;
  blocks: BusinessBlock[];
  tasks: TaskItem[];
  allTasks: TaskItem[];
  dependencyBlockedTaskIds: ReadonlySet<string>;
  onClose: () => void;
  onRenameBlock: (blockId: string, title: string) => Promise<void>;
  onUpdateBlockIcon: (blockId: string, iconName: BusinessBlock["iconName"]) => Promise<void>;
  onCreateTask: (payload: NewTaskInput) => Promise<void>;
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

const recurrenceOptions: Array<{ value: Recurrence; label: string }> = [
  { value: "none", label: "Без повтору" },
  { value: "daily", label: "Щодня" },
  { value: "weekly", label: "Щотижня" },
  { value: "monthly", label: "Щомісяця" }
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

const recurrenceLabelMap: Record<Recurrence, string> = {
  none: "Без повтору",
  daily: "Щодня",
  weekly: "Щотижня",
  monthly: "Щомісяця"
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
  warning: "text-amber-700 dark:text-amber-300",
  overdue: "text-rose-700 dark:text-rose-300"
};

export function TaskDrawer({
  block,
  blocks,
  tasks,
  allTasks,
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
  const [editingChecklistByItem, setEditingChecklistByItem] = useState<Record<string, string>>({});
  const [editingTitleByTask, setEditingTitleByTask] = useState<Record<string, string>>({});
  const [creatingTask, setCreatingTask] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [quickEditor, setQuickEditor] = useState<{
    taskId: string;
    type: "status" | "dueDate";
  } | null>(null);
  const [blockTitleDraft, setBlockTitleDraft] = useState("");
  const [savingBlockTitle, setSavingBlockTitle] = useState(false);
  const [savingIconName, setSavingIconName] = useState<string | null>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [dependencyBlockDraftByTask, setDependencyBlockDraftByTask] = useState<
    Record<string, string>
  >({});
  const iconPickerRef = useRef<HTMLDivElement | null>(null);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt));
  }, [tasks]);

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
  const dependencyBlockOptions = useMemo(() => {
    return [...blocks].sort((a, b) => a.title.localeCompare(b.title, "uk"));
  }, [blocks]);

  const dependencyTaskOptionsByBlock = useMemo(() => {
    const grouped: Record<string, TaskItem[]> = {};

    for (const item of allTasks) {
      grouped[item.blockId] = grouped[item.blockId] ?? [];
      grouped[item.blockId].push(item);
    }

    for (const blockId of Object.keys(grouped)) {
      grouped[blockId].sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt));
    }

    return grouped;
  }, [allTasks]);

  useEffect(() => {
    setBlockTitleDraft(block?.title ?? "");
  }, [block?.id, block?.title]);

  useEffect(() => {
    setIsIconPickerOpen(false);
  }, [block?.id]);

  useEffect(() => {
    setQuickEditor(null);
    setEditingChecklistByItem({});
    setDependencyBlockDraftByTask({});
  }, [block?.id]);

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

  const handleCreate = async (): Promise<void> => {
    setCreatingTask(true);

    try {
      await onCreateTask({
        title: "Нова задача",
        dueDate: null,
        recurrence: "none"
      });
    } finally {
      setCreatingTask(false);
    }
  };

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

        const target = event.target as HTMLElement | null;
        if (!target) {
          setExpandedTaskId(null);
          return;
        }

        const taskElement = target.closest<HTMLElement>("[data-task-item='true']");
        const clickedTaskId = taskElement?.dataset.taskId ?? null;
        if (clickedTaskId !== expandedTaskId) {
          setExpandedTaskId(null);
        }
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
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
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
              "font-display w-full max-w-[320px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight text-slate-900 outline-none transition",
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
        <div className="flex gap-2">
          <button
            type="button"
            disabled={creatingTask}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 transition duration-100 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
            onClick={() => void handleCreate()}
          >
            <Plus size={12} />
            Нова задача
          </button>
          <button
            type="button"
            className="soft-button inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600"
            onClick={onClose}
          >
            <X size={12} />
            Закрити
          </button>
          <button
            type="button"
            className="soft-button inline-flex items-center gap-1 border-destructive px-2.5 py-1 text-xs font-semibold text-destructive"
            onClick={() => onArchiveBlock(block.id)}
          >
            <Archive size={12} />
            Архівувати
          </button>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Список задач
          </div>
          <div className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
            {ownTasks.length}
          </div>
        </div>

        <div className="space-y-3">
          {ownTasks.length === 0 ? (
            <button
              type="button"
              disabled={creatingTask}
              className={cn(
                "w-full rounded-lg border border-dashed border-border bg-white/80 p-4 text-center text-sm text-muted-foreground transition duration-100 hover:border-sky-300 hover:bg-sky-50/50",
                "dark:bg-slate-900/70 dark:hover:border-sky-500 dark:hover:bg-sky-900/25",
                creatingTask ? "cursor-not-allowed opacity-65" : ""
              )}
              onClick={() => void handleCreate()}
            >
              Поки немає задач для тебе. Натисни <span className="font-semibold">Нова задача</span>.
            </button>
          ) : null}

          {groupedTasks.map((task) => {
            const globalIndex = sortedTasks.findIndex((entry) => entry.id === task.id);
            const draftTitle = editingTitleByTask[task.id] ?? task.title;
            const checklistInput = checklistDraft[task.id] ?? "";
            const isExpanded = expandedTaskId === task.id;
            const showChecklistSection = task.checklist.length > 0 || isExpanded;
            const dueDateTone = getDueDateTone(task.dueDate, task.status);
            const isStatusEditorOpen =
              quickEditor?.taskId === task.id && quickEditor.type === "status";
            const isDueDateEditorOpen =
              quickEditor?.taskId === task.id && quickEditor.type === "dueDate";
            const isDelegated = task.ownership === "delegated";
            const dependencyTask = task.dependsOnTaskId
              ? allTasksById.get(task.dependsOnTaskId) ?? null
              : null;
            const dependencyBlock = dependencyTask
              ? blocksById.get(dependencyTask.blockId) ?? null
              : null;
            const selectedDependencyBlockId =
              dependencyBlockDraftByTask[task.id] ?? dependencyTask?.blockId ?? "";
            const dependencyTaskOptions = (
              selectedDependencyBlockId
                ? dependencyTaskOptionsByBlock[selectedDependencyBlockId] ?? []
                : []
            ).filter((candidate) => candidate.id !== task.id);
            const isBlockedByDependency = dependencyBlockedTaskIds.has(task.id);

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
                    "rounded-xl border border-slate-200 bg-white p-3 transition-colors duration-100 dark:border-slate-700 dark:bg-slate-900/92",
                    isDelegated ? "opacity-55 saturate-60" : ""
                  )}
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
                    <input
                      className={cn(
                        "w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-base font-semibold outline-none transition focus:border-slate-300 dark:focus:border-slate-600",
                        task.status === "done"
                          ? "text-slate-500 line-through"
                          : taskTitleToneClasses[dueDateTone]
                      )}
                      value={draftTitle}
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
                    />

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <div className="relative" data-quick-editor="true">
                        <button
                          type="button"
                          className={cn(
                            "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.07em] transition duration-100 hover:brightness-95",
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
                            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition duration-100 hover:brightness-95",
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
                          <CalendarClock size={10} />
                          {formatDueDate(task.dueDate)}
                        </button>
                        {isDueDateEditorOpen ? (
                          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <input
                              type="date"
                              className="soft-input mb-2 w-full px-2 py-1 text-xs"
                              value={task.dueDate ?? ""}
                              onChange={async (event) => {
                                await onUpdateTask(task.id, {
                                  dueDate: event.target.value || null
                                });
                                setQuickEditor(null);
                              }}
                            />
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

                      {task.recurrence !== "none" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700 dark:border-violet-500/50 dark:bg-violet-900/45 dark:text-violet-100">
                          <Repeat size={10} />
                          {recurrenceLabelMap[task.recurrence]}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition duration-100",
                          task.ownership === "mine"
                            ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200/80 dark:border-sky-500/55 dark:bg-sky-900/55 dark:text-sky-100 dark:hover:bg-sky-900"
                            : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        )}
                        onClick={async () => {
                          await onUpdateTask(task.id, {
                            ownership: task.ownership === "mine" ? "delegated" : "mine"
                          });
                        }}
                      >
                        {ownershipLabelMap[task.ownership]}
                      </button>

                      {dependencyTask ? (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 dark:border-violet-500/50 dark:bg-violet-900/35 dark:text-violet-100">
                          <Link2 size={10} />
                          <span className="truncate">
                            {dependencyBlock?.title ?? "Блок"} / {dependencyTask.title}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    {isBlockedByDependency && dependencyTask ? (
                      <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/50 dark:text-amber-100">
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
                            <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
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
                                      "soft-input min-w-0 flex-1 px-2 py-1 text-sm",
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
                            <div className="flex gap-2 pt-1">
                              <input
                                className="soft-input w-full px-2 py-1 text-xs"
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
                                className="soft-button inline-flex items-center justify-center px-2 py-1 text-xs font-semibold"
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
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
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
                    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select
                        className="soft-input px-2 py-1 text-xs"
                        value={task.status}
                        onChange={async (event) => {
                          await onUpdateTask(task.id, {
                            status: event.target.value as TaskStatus
                          });
                        }}
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="soft-input px-2 py-1 text-xs"
                        value={task.dueDate ?? ""}
                        onChange={async (event) => {
                          await onUpdateTask(task.id, {
                            dueDate: event.target.value || null
                          });
                        }}
                      />
                      <select
                        className="soft-input px-2 py-1 text-xs"
                        value={task.recurrence}
                        onChange={async (event) => {
                          await onUpdateTask(task.id, {
                            recurrence: event.target.value as Recurrence
                          });
                        }}
                      >
                        {recurrenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/85">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                        Залежність задачі
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <select
                          className="soft-input px-2 py-1 text-xs"
                          value={selectedDependencyBlockId}
                          onChange={async (event) => {
                            const nextBlockId = event.target.value;
                            setDependencyBlockDraftByTask((prev) => ({
                              ...prev,
                              [task.id]: nextBlockId
                            }));

                            if (!nextBlockId) {
                              await onUpdateTask(task.id, { dependsOnTaskId: null });
                              return;
                            }

                            if (dependencyTask && dependencyTask.blockId !== nextBlockId) {
                              await onUpdateTask(task.id, { dependsOnTaskId: null });
                            }
                          }}
                        >
                          <option value="">Без залежності</option>
                          {dependencyBlockOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title}
                            </option>
                          ))}
                        </select>

                        <select
                          className="soft-input px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          value={task.dependsOnTaskId ?? ""}
                          disabled={!selectedDependencyBlockId}
                          onChange={async (event) => {
                            const nextTaskId = event.target.value || null;
                            await onUpdateTask(task.id, { dependsOnTaskId: nextTaskId });
                          }}
                        >
                          <option value="">
                            {selectedDependencyBlockId ? "Оберіть задачу" : "Спершу обери блок"}
                          </option>
                          {dependencyTaskOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="soft-button inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200"
                          onClick={async () => {
                            setDependencyBlockDraftByTask((prev) => ({
                              ...prev,
                              [task.id]: ""
                            }));
                            await onUpdateTask(task.id, { dependsOnTaskId: null });
                          }}
                        >
                          Очистити
                        </button>
                      </div>
                    </div>

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
