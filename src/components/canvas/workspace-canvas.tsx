"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  Link2,
  ListTree,
  Monitor,
  MoreHorizontal,
  Moon,
  Plus,
  RefreshCcw,
  Sparkles,
  Sun,
  Trash2,
  Unlink,
  ZoomIn,
  ZoomOut,
  X
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { buildBlockedMap, buildTaskDependencyBlockedSet } from "@/lib/dashboard";
import { publicEnv } from "@/lib/env";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type {
  BlockEdge,
  BlockType,
  BusinessBlock,
  TaskItem,
  TaskStatus
} from "@/types/domain";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { PomodoroTag } from "@/components/tasks/pomodoro-tag";
import { PwaRegister } from "@/components/pwa-register";
import { cn } from "@/lib/utils";
import {
  blockIconOptions,
  getBlockIconOption,
  getDefaultIconNameForBlockType,
  resolveBlockIconName
} from "@/lib/block-icons";
import {
  type ThemeMode,
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode
} from "@/lib/theme";

interface WorkspaceCanvasProps {
  workspace: string;
}

type WorkspaceViewMode = "canvas" | "list" | "flow";
type TaskListSortMode = "default" | "custom";
type AnchorSide = "left" | "right" | "top" | "bottom";

interface LinkDraftState {
  sourceBlockId: string;
  sourceSide: AnchorSide;
}

interface EdgeAnchorOverride {
  sourceSide: AnchorSide;
  targetSide: AnchorSide;
}

type VisualEdgeKind = "manual" | "task_dependency";

interface VisualEdge {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
  kind: VisualEdgeKind;
  step: number | null;
  flowColorIndex: number | null;
}

const CARD_WIDTH = 272;
const CARD_HEIGHT = 164;
const BOARD_PADDING = 260;
const DRAG_THRESHOLD_PX = 6;
const ANCHOR_SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.85;
const DEFAULT_CANVAS_TITLE = "Moddyland Operations Canvas";

const blockTypeOptions: Array<{ value: BlockType; label: string; color: string }> = [
  { value: "website", label: "Вебсайт", color: "#0EA5E9" },
  { value: "suppliers", label: "Постачальники", color: "#16A34A" },
  { value: "ads", label: "Реклама", color: "#DB2777" },
  { value: "orders", label: "Замовлення", color: "#D97706" },
  { value: "content", label: "Контент", color: "#7C3AED" },
  { value: "finance", label: "Фінанси", color: "#0F766E" },
  { value: "support", label: "Підтримка", color: "#334155" },
  { value: "operations", label: "Операції", color: "#9333EA" },
  { value: "custom", label: "Кастомний", color: "#4B5563" }
];

const openTaskStatuses = new Set<TaskStatus>(["todo", "in_progress", "blocked"]);
type TaskDueTone = "normal" | "warning" | "overdue";

interface TaskListViewItem {
  task: TaskItem;
  computedStatus: TaskStatus;
  dueTone: TaskDueTone;
  block: BusinessBlock | null;
  dependencyTask: TaskItem | null;
  dependencyBlock: BusinessBlock | null;
  flowStep?: number;
  flowConnectorAfter?: boolean;
  flowColorIndex?: number;
}

interface TaskListSection {
  id: string;
  title: string;
  activeItems: TaskListViewItem[];
  completedItems: TaskListViewItem[];
  flowColorIndex?: number;
}

const taskStatusOrder: Record<TaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  done: 3
};

const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "До виконання",
  in_progress: "В роботі",
  blocked: "Заблоковано",
  done: "Готово"
};

const taskStatusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "До виконання" },
  { value: "in_progress", label: "В роботі" },
  { value: "blocked", label: "Заблоковано" },
  { value: "done", label: "Готово" }
];

const taskStatusBadgeClasses: Record<TaskStatus, string> = {
  todo:
    "border border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/50 dark:bg-sky-900/45 dark:text-sky-100",
  in_progress:
    "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-900/45 dark:text-emerald-100",
  blocked:
    "border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  done:
    "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/45 dark:bg-emerald-900/35 dark:text-emerald-100"
};

interface FlowThemeColors {
  frameBg: string;
  frameBorder: string;
  connector: string;
  edgeBase: string;
  edgeGlow: string;
  edgeCore: string;
  edgeDot: string;
  edgeStepBg: string;
  edgeStepBorder: string;
  edgeStepText: string;
}

const FLOW_THEME_PALETTES: Array<{ light: FlowThemeColors; dark: FlowThemeColors }> = [
  {
    light: {
      frameBg: "rgba(245, 243, 255, 0.92)",
      frameBorder: "rgba(196, 181, 253, 0.9)",
      connector: "rgba(167, 139, 250, 0.85)",
      edgeBase: "#a78bfa",
      edgeGlow: "#8b5cf6",
      edgeCore: "#f5f3ff",
      edgeDot: "#8b5cf6",
      edgeStepBg: "#6d28d9",
      edgeStepBorder: "#ede9fe",
      edgeStepText: "#ffffff"
    },
    dark: {
      frameBg: "rgba(39, 22, 78, 0.62)",
      frameBorder: "rgba(139, 92, 246, 0.66)",
      connector: "rgba(167, 139, 250, 0.82)",
      edgeBase: "#6d28d9",
      edgeGlow: "#c4b5fd",
      edgeCore: "#f5f3ff",
      edgeDot: "#8b5cf6",
      edgeStepBg: "#4c1d95",
      edgeStepBorder: "#c4b5fd",
      edgeStepText: "#f5f3ff"
    }
  },
  {
    light: {
      frameBg: "rgba(239, 246, 255, 0.92)",
      frameBorder: "rgba(147, 197, 253, 0.9)",
      connector: "rgba(96, 165, 250, 0.85)",
      edgeBase: "#93c5fd",
      edgeGlow: "#2563eb",
      edgeCore: "#eff6ff",
      edgeDot: "#2563eb",
      edgeStepBg: "#1d4ed8",
      edgeStepBorder: "#dbeafe",
      edgeStepText: "#ffffff"
    },
    dark: {
      frameBg: "rgba(15, 38, 73, 0.58)",
      frameBorder: "rgba(59, 130, 246, 0.62)",
      connector: "rgba(96, 165, 250, 0.8)",
      edgeBase: "#2563eb",
      edgeGlow: "#93c5fd",
      edgeCore: "#e0f2fe",
      edgeDot: "#60a5fa",
      edgeStepBg: "#1e3a8a",
      edgeStepBorder: "#93c5fd",
      edgeStepText: "#eff6ff"
    }
  },
  {
    light: {
      frameBg: "rgba(236, 253, 245, 0.92)",
      frameBorder: "rgba(110, 231, 183, 0.9)",
      connector: "rgba(52, 211, 153, 0.82)",
      edgeBase: "#6ee7b7",
      edgeGlow: "#059669",
      edgeCore: "#ecfdf5",
      edgeDot: "#059669",
      edgeStepBg: "#047857",
      edgeStepBorder: "#d1fae5",
      edgeStepText: "#ffffff"
    },
    dark: {
      frameBg: "rgba(6, 44, 35, 0.58)",
      frameBorder: "rgba(16, 185, 129, 0.62)",
      connector: "rgba(52, 211, 153, 0.78)",
      edgeBase: "#10b981",
      edgeGlow: "#6ee7b7",
      edgeCore: "#d1fae5",
      edgeDot: "#34d399",
      edgeStepBg: "#065f46",
      edgeStepBorder: "#6ee7b7",
      edgeStepText: "#ecfdf5"
    }
  },
  {
    light: {
      frameBg: "rgba(255, 247, 237, 0.92)",
      frameBorder: "rgba(253, 186, 116, 0.9)",
      connector: "rgba(251, 146, 60, 0.82)",
      edgeBase: "#fdba74",
      edgeGlow: "#ea580c",
      edgeCore: "#fff7ed",
      edgeDot: "#ea580c",
      edgeStepBg: "#c2410c",
      edgeStepBorder: "#fed7aa",
      edgeStepText: "#ffffff"
    },
    dark: {
      frameBg: "rgba(67, 30, 7, 0.62)",
      frameBorder: "rgba(249, 115, 22, 0.66)",
      connector: "rgba(251, 146, 60, 0.78)",
      edgeBase: "#f97316",
      edgeGlow: "#fdba74",
      edgeCore: "#ffedd5",
      edgeDot: "#fb923c",
      edgeStepBg: "#9a3412",
      edgeStepBorder: "#fdba74",
      edgeStepText: "#fff7ed"
    }
  },
  {
    light: {
      frameBg: "rgba(252, 242, 248, 0.92)",
      frameBorder: "rgba(244, 114, 182, 0.88)",
      connector: "rgba(236, 72, 153, 0.82)",
      edgeBase: "#f9a8d4",
      edgeGlow: "#db2777",
      edgeCore: "#fdf2f8",
      edgeDot: "#db2777",
      edgeStepBg: "#be185d",
      edgeStepBorder: "#fbcfe8",
      edgeStepText: "#ffffff"
    },
    dark: {
      frameBg: "rgba(73, 14, 47, 0.6)",
      frameBorder: "rgba(236, 72, 153, 0.64)",
      connector: "rgba(244, 114, 182, 0.78)",
      edgeBase: "#db2777",
      edgeGlow: "#f9a8d4",
      edgeCore: "#fdf2f8",
      edgeDot: "#f472b6",
      edgeStepBg: "#9d174d",
      edgeStepBorder: "#f9a8d4",
      edgeStepText: "#fdf2f8"
    }
  }
];

const getFlowThemeColors = (flowIndex: number, theme: "light" | "dark"): FlowThemeColors => {
  const palette = FLOW_THEME_PALETTES[((flowIndex % FLOW_THEME_PALETTES.length) + FLOW_THEME_PALETTES.length) % FLOW_THEME_PALETTES.length];
  return theme === "dark" ? palette.dark : palette.light;
};

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

const quickDueDateOptions = [
  { value: "today", label: "Сьогодні" },
  { value: "tomorrow", label: "Завтра" },
  { value: "weekend", label: "На вихідних" }
] as const;

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

const getTaskDueTone = (task: TaskItem): TaskDueTone => {
  if (!task.dueDate || task.status === "done") {
    return "normal";
  }

  const today = new Date();
  const todayStr = toLocalDateString(today);
  const warningBorder = new Date(today);
  warningBorder.setDate(today.getDate() + 1);
  const warningBorderStr = toLocalDateString(warningBorder);

  if (task.dueDate < todayStr) {
    return "overdue";
  }

  if (task.dueDate <= warningBorderStr) {
    return "warning";
  }

  return "normal";
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Невідома помилка";
};

const formatTaskDueDate = (dueDate: string | null): string => {
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

const formatEdgeName = (edge: BlockEdge, blocksById: Map<string, BusinessBlock>): string => {
  const sourceName = blocksById.get(edge.sourceBlockId)?.title ?? "Невідомий блок";
  const targetName = blocksById.get(edge.targetBlockId)?.title ?? "Невідомий блок";
  return `${sourceName} → ${targetName}`;
};

export function WorkspaceCanvas({ workspace }: WorkspaceCanvasProps): React.ReactElement {
  const canvasSectionRef = useRef<HTMLElement | null>(null);
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const listScrollTopRef = useRef(0);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const pinchStateRef = useRef<{ distance: number; initialZoom: number } | null>(null);
  const gestureZoomStateRef = useRef<{ initialZoom: number } | null>(null);
  const dragStateRef = useRef<{
    blockId: string;
    blockIds: string[];
    startClientX: number;
    startClientY: number;
    startBlockX: number;
    startBlockY: number;
    startPositions: Record<string, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);
  const marqueeStateRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const shouldCenterCanvasRef = useRef(true);

  const [blocks, setBlocks] = useState<BusinessBlock[]>([]);
  const [edges, setEdges] = useState<BlockEdge[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [selectedCanvasBlockIds, setSelectedCanvasBlockIds] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("list");
  const [taskListSortMode, setTaskListSortMode] = useState<TaskListSortMode>("default");
  const [showCompletedBySection, setShowCompletedBySection] = useState<{
    mine: boolean;
    delegated: boolean;
  }>({
    mine: false,
    delegated: false
  });
  const [taskListManualOrder, setTaskListManualOrder] = useState<string[]>([]);
  const [draggingTaskIdInList, setDraggingTaskIdInList] = useState<string | null>(null);
  const [expandedListTaskId, setExpandedListTaskId] = useState<string | null>(null);
  const [listQuickEditor, setListQuickEditor] = useState<{
    taskId: string;
    type: "status" | "dueDate" | "ownership";
  } | null>(null);
  const [listTaskTitleDrafts, setListTaskTitleDrafts] = useState<Record<string, string>>({});
  const [listChecklistDrafts, setListChecklistDrafts] = useState<Record<string, string>>({});
  const [listChecklistComposerOpenByTask, setListChecklistComposerOpenByTask] = useState<Record<string, boolean>>({});
  const [listEditingChecklistByItem, setListEditingChecklistByItem] = useState<Record<string, string>>({});
  const [listDependencyEditorOpenByTask, setListDependencyEditorOpenByTask] = useState<Record<string, boolean>>({});
  const [taskDrawerCreateToken, setTaskDrawerCreateToken] = useState(0);
  const [taskDrawerCreateBlockId, setTaskDrawerCreateBlockId] = useState<string | null>(null);
  const [canvasTitle, setCanvasTitle] = useState(DEFAULT_CANVAS_TITLE);
  const [canvasTitleDraft, setCanvasTitleDraft] = useState(DEFAULT_CANVAS_TITLE);
  const [savingCanvasTitle, setSavingCanvasTitle] = useState(false);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [canUseHoverInteractions, setCanUseHoverInteractions] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraftState | null>(null);
  const [linkPointer, setLinkPointer] = useState<{ x: number; y: number } | null>(null);
  const [edgeAnchorOverrides, setEdgeAnchorOverrides] = useState<Record<string, EdgeAnchorOverride>>({});

  const [loading, setLoading] = useState(true);
  const [, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isBlockListOpen, setIsBlockListOpen] = useState(false);
  const [isEdgeManagerOpen, setIsEdgeManagerOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newBlockType, setNewBlockType] = useState<BlockType>("custom");
  const [newBlockIconName, setNewBlockIconName] = useState(
    getDefaultIconNameForBlockType("custom")
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskBlockId, setNewTaskBlockId] = useState("");
  const [edgeSourceId, setEdgeSourceId] = useState("");
  const [edgeTargetId, setEdgeTargetId] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const blocksById = useMemo(() => {
    return new Map(blocks.map((block) => [block.id, block]));
  }, [blocks]);
  const taskOrderPreferenceKey = useMemo(
    () => `moddyland:list-manual-order:${workspace}`,
    [workspace]
  );

  const reloadData = useCallback(async (): Promise<void> => {
    const [blocksResponse, edgesResponse, tasksResponse, workspaceResponse] = await Promise.all([
      apiGet<{ blocks: BusinessBlock[] }>("/api/blocks"),
      apiGet<{ edges: BlockEdge[] }>("/api/edges"),
      apiGet<{ tasks: TaskItem[] }>("/api/tasks"),
      apiGet<{ title: string }>("/api/workspace")
    ]);

    setBlocks(blocksResponse.blocks);
    setEdges(edgesResponse.edges);
    setTasks(tasksResponse.tasks);
    setCanvasTitle(workspaceResponse.title || DEFAULT_CANVAS_TITLE);
    setCanvasTitleDraft(workspaceResponse.title || DEFAULT_CANVAS_TITLE);
    setEdgeAnchorOverrides({});
    setSelectedBlockId((current) =>
      current && blocksResponse.blocks.some((block) => block.id === current) ? current : null
    );
  }, []);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiPost<{ bootstrapped: boolean }>("/api/bootstrap");

        await reloadData();
      } catch (loadError) {
        setError(extractErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [reloadData]);

  useEffect(() => {
    const stored = getStoredThemeMode();
    setThemeMode(stored);
    applyThemeMode(stored);
  }, []);

  useEffect(() => {
    const syncResolvedTheme = (): void => {
      const isDark = document.documentElement.classList.contains("theme-dark");
      setResolvedTheme(isDark ? "dark" : "light");
    };

    syncResolvedTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleThemeEvent = (): void => syncResolvedTheme();
    const handleMedia = (): void => {
      if (getStoredThemeMode() === "system") {
        syncResolvedTheme();
      }
    };

    window.addEventListener("moddyland-theme-change", handleThemeEvent);
    media.addEventListener("change", handleMedia);

    return () => {
      window.removeEventListener("moddyland-theme-change", handleThemeEvent);
      media.removeEventListener("change", handleMedia);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = (): void => {
      setCanUseHoverInteractions(query.matches);
    };

    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (canUseHoverInteractions) {
      return;
    }

    setHoveredBlockId(null);
    setSelectedCanvasBlockIds([]);
    setSelectionRect(null);
    setIsMarqueeSelecting(false);
    setLinkDraft(null);
    setLinkPointer(null);
  }, [canUseHoverInteractions]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(taskOrderPreferenceKey);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setTaskListManualOrder(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      // ignore storage errors
    }
  }, [taskOrderPreferenceKey]);

  useEffect(() => {
    setTaskListManualOrder((previous) => {
      const existingIds = new Set(tasks.map((task) => task.id));
      const preserved = previous.filter((id) => existingIds.has(id));
      const missing = tasks.map((task) => task.id).filter((id) => !preserved.includes(id));
      const next = [...preserved, ...missing];
      if (
        next.length === previous.length &&
        next.every((item, index) => item === previous[index])
      ) {
        return previous;
      }
      return next;
    });
  }, [tasks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(taskOrderPreferenceKey, JSON.stringify(taskListManualOrder));
    } catch {
      // ignore storage errors
    }
  }, [taskListManualOrder, taskOrderPreferenceKey]);


  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      if (linkDraft) {
        setLinkDraft(null);
        setLinkPointer(null);
        return;
      }

      if (selectedBlockId) {
        setSelectedBlockId(null);
        setTaskDrawerCreateBlockId(null);
        return;
      }

      if (isAddBlockOpen) {
        setIsAddBlockOpen(false);
        return;
      }

      if (isAddTaskOpen) {
        setIsAddTaskOpen(false);
        return;
      }

      if (isEdgeManagerOpen) {
        setIsEdgeManagerOpen(false);
        return;
      }

      if (isBlockListOpen) {
        setIsBlockListOpen(false);
        return;
      }

      if (isMoreMenuOpen) {
        setIsMoreMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [
    isAddBlockOpen,
    isAddTaskOpen,
    isBlockListOpen,
    isEdgeManagerOpen,
    isMoreMenuOpen,
    linkDraft,
    selectedBlockId
  ]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (moreMenuRef.current?.contains(target)) {
        return;
      }

      setIsMoreMenuOpen(false);
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!listQuickEditor) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setListQuickEditor(null);
        setListDependencyEditorOpenByTask({});
        return;
      }

      if (target.closest("[data-list-quick-editor='true']")) {
        return;
      }

      setListQuickEditor(null);
      setListDependencyEditorOpenByTask({});
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [listQuickEditor]);

  useEffect(() => {
    if (viewMode !== "list" || !expandedListTaskId) {
      return;
    }

    const handleOutsideTaskPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setExpandedListTaskId(null);
        setListQuickEditor(null);
        setListChecklistComposerOpenByTask({});
        setListDependencyEditorOpenByTask({});
        return;
      }

      if (target.closest("[data-list-task-item='true']")) {
        return;
      }

      if (target.closest("[data-list-quick-editor='true']")) {
        return;
      }

      setExpandedListTaskId(null);
      setListQuickEditor(null);
      setListChecklistComposerOpenByTask({});
      setListDependencyEditorOpenByTask({});
    };

    window.addEventListener("pointerdown", handleOutsideTaskPointerDown);
    return () => window.removeEventListener("pointerdown", handleOutsideTaskPointerDown);
  }, [expandedListTaskId, viewMode]);

  useEffect(() => {
    if (viewMode !== "list") {
      setExpandedListTaskId(null);
      setListQuickEditor(null);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "list") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = listViewportRef.current;
      if (!viewport) {
        return;
      }
      viewport.scrollTop = listScrollTopRef.current;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "canvas") {
      setIsMarqueeSelecting(false);
      setSelectionRect(null);
      marqueeStateRef.current = null;
      setSelectedCanvasBlockIds([]);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!selectedBlockId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedBlockId]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const selectedBlock = useMemo(() => {
    return selectedBlockId ? blocksById.get(selectedBlockId) ?? null : null;
  }, [blocksById, selectedBlockId]);

  const openBlockDrawer = useCallback((blockId: string): void => {
    setTaskDrawerCreateBlockId(null);
    setSelectedBlockId(blockId);
  }, []);

  const closeBlockDrawer = useCallback((): void => {
    setSelectedBlockId(null);
    setTaskDrawerCreateBlockId(null);
  }, []);

  const applyZoomAtPoint = useCallback(
    (requestedZoom: number, clientX: number, clientY: number): void => {
      const viewport = boardViewportRef.current;
      if (!viewport) {
        return;
      }

      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requestedZoom));
      const currentZoom = zoomRef.current;
      if (Math.abs(nextZoom - currentZoom) < 0.0001) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const viewportX = clientX - rect.left;
      const viewportY = clientY - rect.top;
      const boardX = (viewport.scrollLeft + viewportX) / currentZoom;
      const boardY = (viewport.scrollTop + viewportY) / currentZoom;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      requestAnimationFrame(() => {
        const nextViewport = boardViewportRef.current;
        if (!nextViewport) {
          return;
        }

        nextViewport.scrollLeft = boardX * nextZoom - viewportX;
        nextViewport.scrollTop = boardY * nextZoom - viewportY;
      });
    },
    []
  );

  const applyZoomAtViewportCenter = useCallback(
    (requestedZoom: number): void => {
      const viewport = boardViewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      applyZoomAtPoint(requestedZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [applyZoomAtPoint]
  );

  const zoomByFactor = useCallback(
    (factor: number): void => {
      applyZoomAtViewportCenter(zoomRef.current * factor);
    },
    [applyZoomAtViewportCenter]
  );

  const resetZoom = useCallback((): void => {
    applyZoomAtViewportCenter(1);
  }, [applyZoomAtViewportCenter]);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport || viewMode !== "canvas") {
      return;
    }

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const currentZoom = zoomRef.current;
      const factor = Math.exp(-event.deltaY * 0.0022);
      applyZoomAtPoint(currentZoom * factor, event.clientX, event.clientY);
    };

    type GestureLikeEvent = Event & {
      scale?: number;
      clientX?: number;
      clientY?: number;
      pageX?: number;
      pageY?: number;
      target?: EventTarget | null;
    };

    const distanceBetweenTouches = (touches: TouchList): number => {
      if (touches.length < 2) {
        return 0;
      }

      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const midpointBetweenTouches = (touches: TouchList): { x: number; y: number } | null => {
      if (touches.length < 2) {
        return null;
      }

      const [a, b] = [touches[0], touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2
      };
    };

    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length !== 2) {
        pinchStateRef.current = null;
        return;
      }

      pinchStateRef.current = {
        distance: distanceBetweenTouches(event.touches),
        initialZoom: zoomRef.current
      };
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length !== 2 || !pinchStateRef.current) {
        return;
      }

      const nextDistance = distanceBetweenTouches(event.touches);
      if (nextDistance <= 0) {
        return;
      }

      event.preventDefault();
      const midpoint = midpointBetweenTouches(event.touches);
      if (!midpoint) {
        return;
      }

      const ratio = nextDistance / pinchStateRef.current.distance;
      const nextZoom = pinchStateRef.current.initialZoom * ratio;
      applyZoomAtPoint(nextZoom, midpoint.x, midpoint.y);
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (event.touches.length < 2) {
        pinchStateRef.current = null;
      }
    };

    const onGestureStart = (event: Event): void => {
      const gesture = event as GestureLikeEvent;
      if (!gesture.scale) {
        return;
      }

      event.preventDefault();
      gestureZoomStateRef.current = { initialZoom: zoomRef.current };
    };

    const onGestureChange = (event: Event): void => {
      const gesture = event as GestureLikeEvent;
      if (!gestureZoomStateRef.current || !gesture.scale) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const clientX = gesture.clientX ?? gesture.pageX ?? rect.left + rect.width / 2;
      const clientY = gesture.clientY ?? gesture.pageY ?? rect.top + rect.height / 2;
      applyZoomAtPoint(gestureZoomStateRef.current.initialZoom * gesture.scale, clientX, clientY);
    };

    const onGestureEnd = (): void => {
      gestureZoomStateRef.current = null;
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });
    viewport.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    viewport.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    viewport.addEventListener("gestureend", onGestureEnd as EventListener, { passive: true });
    window.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    window.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    window.addEventListener("gestureend", onGestureEnd as EventListener, { passive: true });

    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      viewport.removeEventListener("gesturestart", onGestureStart as EventListener);
      viewport.removeEventListener("gesturechange", onGestureChange as EventListener);
      viewport.removeEventListener("gestureend", onGestureEnd as EventListener);
      window.removeEventListener("gesturestart", onGestureStart as EventListener);
      window.removeEventListener("gesturechange", onGestureChange as EventListener);
      window.removeEventListener("gestureend", onGestureEnd as EventListener);
    };
  }, [applyZoomAtPoint, viewMode]);

  useEffect(() => {
    if (viewMode !== "canvas") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomByFactor(1.12);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomByFactor(1 / 1.12);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetZoom, viewMode, zoomByFactor]);

  const selectedBlockTasks = useMemo(() => {
    if (!selectedBlockId) {
      return [];
    }

    return tasks
      .filter((task) => task.blockId === selectedBlockId)
      .sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt));
  }, [selectedBlockId, tasks]);

  const openTaskCountByBlock = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const task of tasks) {
      if (!openTaskStatuses.has(task.status)) {
        continue;
      }

      counts[task.blockId] = (counts[task.blockId] ?? 0) + 1;
    }

    return counts;
  }, [tasks]);

  const dependencyBlockedTaskIds = useMemo(() => {
    return buildTaskDependencyBlockedSet(tasks, publicEnv.appTimezone);
  }, [tasks]);

  const blockedMap = useMemo(() => {
    return buildBlockedMap(blocks, tasks, publicEnv.appTimezone);
  }, [blocks, tasks]);

  const workflowMetricsByBlock = useMemo(() => {
    const metrics: Record<
      string,
      {
        todo: number;
        inProgress: number;
        blocked: number;
        totalOpen: number;
      }
    > = {};

    for (const task of tasks) {
      const current = metrics[task.blockId] ?? { todo: 0, inProgress: 0, blocked: 0, totalOpen: 0 };
      const isDependencyBlocked = dependencyBlockedTaskIds.has(task.id);

      if (isDependencyBlocked) {
        current.blocked += 1;
        current.totalOpen += 1;
      } else if (task.status === "todo") {
        current.todo += 1;
        current.totalOpen += 1;
      } else if (task.status === "in_progress") {
        current.inProgress += 1;
        current.totalOpen += 1;
      } else if (task.status === "blocked") {
        current.blocked += 1;
        current.totalOpen += 1;
      }

      metrics[task.blockId] = current;
    }

    return metrics;
  }, [dependencyBlockedTaskIds, tasks]);

  const flowInsights = useMemo(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const outgoing = new Map<string, string[]>();
    const indegree = new Map<string, number>();

    for (const task of tasks) {
      outgoing.set(task.id, []);
      indegree.set(task.id, 0);
    }

    for (const task of tasks) {
      if (!task.dependsOnTaskId) {
        continue;
      }

      const prerequisite = tasksById.get(task.dependsOnTaskId);
      if (!prerequisite || prerequisite.id === task.id) {
        continue;
      }

      outgoing.get(prerequisite.id)?.push(task.id);
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
    }

    for (const [taskId, children] of outgoing) {
      children.sort((a, b) => {
        const left = tasksById.get(a);
        const right = tasksById.get(b);
        if (!left || !right) {
          return 0;
        }
        return left.order - right.order || left.updatedAt.localeCompare(right.updatedAt);
      });
      outgoing.set(taskId, children);
    }

    const roots = tasks
      .filter((task) => (indegree.get(task.id) ?? 0) === 0 && (outgoing.get(task.id)?.length ?? 0) > 0)
      .sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt));

    const fallbackRoots =
      roots.length > 0
        ? roots
        : tasks
            .filter((task) => (outgoing.get(task.id)?.length ?? 0) > 0)
            .sort((a, b) => a.order - b.order || a.updatedAt.localeCompare(b.updatedAt));

    const chains: string[][] = [];

    const walk = (taskId: string, path: string[], visited: Set<string>): void => {
      const children = outgoing.get(taskId) ?? [];

      if (children.length === 0) {
        if (path.length > 1) {
          chains.push(path);
        }
        return;
      }

      let progressed = false;

      for (const childId of children) {
        if (visited.has(childId)) {
          continue;
        }

        progressed = true;
        const nextVisited = new Set(visited);
        nextVisited.add(childId);
        walk(childId, [...path, childId], nextVisited);
      }

      if (!progressed && path.length > 1) {
        chains.push(path);
      }
    };

    for (const root of fallbackRoots) {
      walk(root.id, [root.id], new Set([root.id]));
    }

    const uniqueChains = Array.from(new Set(chains.map((chain) => chain.join("::")))).map((serialized) =>
      serialized.split("::")
    );

    if (uniqueChains.length === 0) {
      for (const task of tasks) {
        if (!task.dependsOnTaskId) {
          continue;
        }
        const prerequisite = tasksById.get(task.dependsOnTaskId);
        if (!prerequisite || prerequisite.id === task.id) {
          continue;
        }
        uniqueChains.push([prerequisite.id, task.id]);
      }
    }

    const taskEdgeStep = new Map<string, number>();
    const taskEdgeFlowIndex = new Map<string, number>();

    uniqueChains.forEach((chain, chainIndex) => {
      for (let index = 1; index < chain.length; index += 1) {
        const edgeKey = `${chain[index - 1]}::${chain[index]}`;
        const step = index;
        const currentStep = taskEdgeStep.get(edgeKey);
        taskEdgeStep.set(edgeKey, currentStep ? Math.min(currentStep, step) : step);

        const currentFlowIndex = taskEdgeFlowIndex.get(edgeKey);
        taskEdgeFlowIndex.set(
          edgeKey,
          currentFlowIndex !== undefined ? Math.min(currentFlowIndex, chainIndex) : chainIndex
        );
      }
    });

    return { chains: uniqueChains, taskEdgeStep, taskEdgeFlowIndex };
  }, [tasks]);

  const flowChainsForList = useMemo(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));

    return flowInsights.chains
      .map((chain, chainIndex) => {
        const steps = chain
          .map((taskId) => tasksById.get(taskId))
          .filter((task): task is TaskItem => task !== undefined)
          .map((task) => {
            const dependencyTask = task.dependsOnTaskId
              ? tasksById.get(task.dependsOnTaskId) ?? null
              : null;
            const dependencyBlock = dependencyTask
              ? blocksById.get(dependencyTask.blockId) ?? null
              : null;
            const computedStatus: TaskStatus = dependencyBlockedTaskIds.has(task.id)
              ? "blocked"
              : task.status;

            return {
              task,
              computedStatus,
              dueTone: getTaskDueTone(task),
              block: blocksById.get(task.blockId) ?? null,
              dependencyTask,
              dependencyBlock
            };
          })
          .filter((step) => step.block !== null);

        return {
          id: `flow-${chainIndex + 1}`,
          steps,
          flowColorIndex: chainIndex
        };
      })
      .filter((flow) => flow.steps.length > 1)
      .sort((left, right) => right.steps.length - left.steps.length);
  }, [blocksById, dependencyBlockedTaskIds, flowInsights.chains, tasks]);

  const taskFlowStepById = useMemo(() => {
    const stepMap = new Map<string, number>();

    for (const chain of flowInsights.chains) {
      if (chain.length < 2) {
        continue;
      }

      for (let index = 0; index < chain.length; index += 1) {
        const taskId = chain[index];
        const step = index + 1;
        const current = stepMap.get(taskId);
        if (!current || step < current) {
          stepMap.set(taskId, step);
        }
      }
    }

    return stepMap;
  }, [flowInsights.chains]);

  const dependencyTaskOptionsForList = useMemo(() => {
    return [...tasks]
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
  }, [blocksById, tasks]);

  const dependencySourceTaskIds = useMemo(
    () =>
      new Set(
        tasks
          .filter((item) => Boolean(item.dependsOnTaskId))
          .map((item) => item.dependsOnTaskId as string)
      ),
    [tasks]
  );

  const sortedTasksForList = useMemo<TaskListViewItem[]>(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const manualOrderIndex = new Map(taskListManualOrder.map((id, index) => [id, index]));

    const visible = tasks
      .map((task) => {
        const computedStatus: TaskStatus = dependencyBlockedTaskIds.has(task.id)
          ? "blocked"
          : task.status;

        const dependencyTask = task.dependsOnTaskId
          ? tasksById.get(task.dependsOnTaskId) ?? null
          : null;
        const dependencyBlock = dependencyTask
          ? blocksById.get(dependencyTask.blockId) ?? null
          : null;

        return {
          task,
          computedStatus,
          dueTone: getTaskDueTone(task),
          block: blocksById.get(task.blockId) ?? null,
          dependencyTask,
          dependencyBlock
        };
      })
      .filter((item) => Boolean(item.block));

    visible.sort((a, b) => {
      if (taskListSortMode === "custom") {
        const aIndex = manualOrderIndex.get(a.task.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = manualOrderIndex.get(b.task.id) ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        return b.task.updatedAt.localeCompare(a.task.updatedAt);
      }

      const statusDiff = taskStatusOrder[a.computedStatus] - taskStatusOrder[b.computedStatus];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      const dueDiff = toDateTimestamp(a.task.dueDate) - toDateTimestamp(b.task.dueDate);
      if (dueDiff !== 0) {
        return dueDiff;
      }

      return b.task.updatedAt.localeCompare(a.task.updatedAt);
    });

    return visible;
  }, [blocksById, dependencyBlockedTaskIds, taskListManualOrder, taskListSortMode, tasks]);

  const taskSectionsForList = useMemo<TaskListSection[]>(() => {
    const myTasks = sortedTasksForList.filter((item) => item.task.ownership === "mine");
    const delegatedTasks = sortedTasksForList.filter((item) => item.task.ownership === "delegated");
    const myActive = myTasks.filter((item) => item.computedStatus !== "done");
    const myCompleted = myTasks.filter((item) => item.computedStatus === "done");
    const delegatedActive = delegatedTasks.filter((item) => item.computedStatus !== "done");
    const delegatedCompleted = delegatedTasks.filter((item) => item.computedStatus === "done");

    return [
      {
        id: "mine" as const,
        title: "Мої задачі",
        activeItems: myActive,
        completedItems: myCompleted
      },
      {
        id: "delegated" as const,
        title: "Делеговано",
        activeItems: delegatedActive,
        completedItems: delegatedCompleted
      }
    ].filter((section) => section.activeItems.length > 0 || section.completedItems.length > 0);
  }, [sortedTasksForList]);

  const sectionsForCurrentView = useMemo<TaskListSection[]>(() => {
    if (viewMode !== "flow") {
      return taskSectionsForList;
    }

    return flowChainsForList.map((flow, flowIndex) => ({
      id: flow.id,
      title: `Потік ${flowIndex + 1}`,
      flowColorIndex: flow.flowColorIndex,
      activeItems: flow.steps.map((step, stepIndex) => ({
        task: step.task,
        computedStatus: step.computedStatus,
        dueTone: step.dueTone,
        block: step.block,
        dependencyTask: step.dependencyTask,
        dependencyBlock: step.dependencyBlock,
        flowStep: stepIndex + 1,
        flowConnectorAfter: stepIndex < flow.steps.length - 1,
        flowColorIndex: flow.flowColorIndex
      })),
      completedItems: []
    }));
  }, [flowChainsForList, taskSectionsForList, viewMode]);

  useEffect(() => {
    const completedCounts: Record<"mine" | "delegated", number> = {
      mine: 0,
      delegated: 0
    };

    for (const section of taskSectionsForList) {
      if (section.id === "mine" || section.id === "delegated") {
        completedCounts[section.id] = section.completedItems.length;
      }
    }

    setShowCompletedBySection((previous) => {
      let hasChanges = false;
      const next = { ...previous };

      if (previous.mine && completedCounts.mine === 0) {
        next.mine = false;
        hasChanges = true;
      }

      if (previous.delegated && completedCounts.delegated === 0) {
        next.delegated = false;
        hasChanges = true;
      }

      return hasChanges ? next : previous;
    });
  }, [taskSectionsForList]);

  const moveManualTaskOrder = useCallback((draggedTaskId: string, targetTaskId: string): void => {
    if (draggedTaskId === targetTaskId) {
      return;
    }

    setTaskListManualOrder((previous) => {
      const next = [...previous];
      const sourceIndex = next.indexOf(draggedTaskId);
      const targetIndex = next.indexOf(targetTaskId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return previous;
      }

      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, draggedTaskId);
      return next;
    });
  }, []);

  const persistPositions = useCallback(
    async (positions: Array<{ id: string; x: number; y: number }>) => {
      if (positions.length === 0) {
        return;
      }

      try {
        setSyncing(true);
        await apiPost<{ success: boolean }>("/api/blocks/reposition", { positions });
      } catch (persistError) {
        setError(extractErrorMessage(persistError));
      } finally {
        setSyncing(false);
      }
    },
    []
  );

  const debouncedPersistPositions = useDebouncedCallback(persistPositions, 420);

  const persistCurrentBlockPositions = useCallback(
    (input: BusinessBlock[]): void => {
      debouncedPersistPositions(
        input.map((block) => ({
          id: block.id,
          x: block.x,
          y: block.y
        }))
      );
    },
    [debouncedPersistPositions]
  );

  const boardMetrics = useMemo(() => {
    if (blocks.length === 0) {
      return {
        width: 3600,
        height: 2400,
        shiftX: BOARD_PADDING,
        shiftY: BOARD_PADDING
      };
    }

    const minX = Math.min(...blocks.map((block) => block.x));
    const minY = Math.min(...blocks.map((block) => block.y));
    const maxX = Math.max(...blocks.map((block) => block.x + CARD_WIDTH));
    const maxY = Math.max(...blocks.map((block) => block.y + CARD_HEIGHT));
    const normalizedMinX = Math.min(0, minX);
    const normalizedMinY = Math.min(0, minY);

    return {
      width: Math.max(3600, maxX - normalizedMinX + BOARD_PADDING * 2),
      height: Math.max(2400, maxY - normalizedMinY + BOARD_PADDING * 2),
      shiftX: BOARD_PADDING - normalizedMinX,
      shiftY: BOARD_PADDING - normalizedMinY
    };
  }, [blocks]);

  const positionedBlocks = useMemo(() => {
    return blocks.map((block) => ({
      block,
      left: block.x + boardMetrics.shiftX,
      top: block.y + boardMetrics.shiftY
    }));
  }, [blocks, boardMetrics.shiftX, boardMetrics.shiftY]);

  const positionedMap = useMemo(() => {
    const map = new Map<string, { left: number; top: number }>();

    for (const item of positionedBlocks) {
      map.set(item.block.id, { left: item.left, top: item.top });
    }

    return map;
  }, [positionedBlocks]);

  const centerViewportOnBlocks = useCallback((): void => {
    const viewport = boardViewportRef.current;
    if (!viewport) {
      return;
    }

    const currentZoom = zoomRef.current;
    const positioned = positionedBlocks;

    const contentWidth = boardMetrics.width * currentZoom;
    const contentHeight = boardMetrics.height * currentZoom;

    const maxScrollLeft = Math.max(0, contentWidth - viewport.clientWidth);
    const maxScrollTop = Math.max(0, contentHeight - viewport.clientHeight);

    if (positioned.length === 0) {
      viewport.scrollLeft = maxScrollLeft / 2;
      viewport.scrollTop = maxScrollTop / 2;
      return;
    }

    const minLeft = Math.min(...positioned.map((item) => item.left));
    const minTop = Math.min(...positioned.map((item) => item.top));
    const maxRight = Math.max(...positioned.map((item) => item.left + CARD_WIDTH));
    const maxBottom = Math.max(...positioned.map((item) => item.top + CARD_HEIGHT));

    const focusX = ((minLeft + maxRight) / 2) * currentZoom - viewport.clientWidth / 2;
    const focusY = ((minTop + maxBottom) / 2) * currentZoom - viewport.clientHeight / 2;

    viewport.scrollLeft = Math.min(maxScrollLeft, Math.max(0, focusX));
    viewport.scrollTop = Math.min(maxScrollTop, Math.max(0, focusY));
  }, [boardMetrics.height, boardMetrics.width, positionedBlocks]);

  const getAnchorPoint = useCallback(
    (blockId: string, side: AnchorSide): { x: number; y: number } | null => {
      const position = positionedMap.get(blockId);
      if (!position) {
        return null;
      }

      if (side === "left") {
        return { x: position.left, y: position.top + CARD_HEIGHT / 2 };
      }

      if (side === "right") {
        return { x: position.left + CARD_WIDTH, y: position.top + CARD_HEIGHT / 2 };
      }

      if (side === "top") {
        return { x: position.left + CARD_WIDTH / 2, y: position.top };
      }

      return { x: position.left + CARD_WIDTH / 2, y: position.top + CARD_HEIGHT };
    },
    [positionedMap]
  );

  const buildConnectorPath = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      sourceSide: AnchorSide
    ): string => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;

      if (sourceSide === "left" || sourceSide === "right") {
        const horizontalDirection = sourceSide === "right" ? 1 : -1;
        const curve = Math.min(56, Math.max(24, Math.abs(dx) * 0.22));
        const c1X = start.x + horizontalDirection * curve;
        const c2X = end.x - horizontalDirection * curve;
        return `M ${start.x} ${start.y} C ${c1X} ${start.y}, ${c2X} ${end.y}, ${end.x} ${end.y}`;
      }

      const verticalDirection = sourceSide === "bottom" ? 1 : -1;
      const curve = Math.min(56, Math.max(24, Math.abs(dy) * 0.22));
      const c1Y = start.y + verticalDirection * curve;
      const c2Y = end.y - verticalDirection * curve;
      return `M ${start.x} ${start.y} C ${start.x} ${c1Y}, ${end.x} ${c2Y}, ${end.x} ${end.y}`;
    },
    []
  );

  const getConnectorMidPoint = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      sourceSide: AnchorSide
    ): { x: number; y: number } => {
      const t = 0.5;
      const mt = 1 - t;

      if (sourceSide === "left" || sourceSide === "right") {
        const dx = end.x - start.x;
        const horizontalDirection = sourceSide === "right" ? 1 : -1;
        const curve = Math.min(56, Math.max(24, Math.abs(dx) * 0.22));
        const c1 = { x: start.x + horizontalDirection * curve, y: start.y };
        const c2 = { x: end.x - horizontalDirection * curve, y: end.y };

        return {
          x:
            mt * mt * mt * start.x +
            3 * mt * mt * t * c1.x +
            3 * mt * t * t * c2.x +
            t * t * t * end.x,
          y:
            mt * mt * mt * start.y +
            3 * mt * mt * t * c1.y +
            3 * mt * t * t * c2.y +
            t * t * t * end.y
        };
      }

      const dy = end.y - start.y;
      const verticalDirection = sourceSide === "bottom" ? 1 : -1;
      const curve = Math.min(56, Math.max(24, Math.abs(dy) * 0.22));
      const c1 = { x: start.x, y: start.y + verticalDirection * curve };
      const c2 = { x: end.x, y: end.y - verticalDirection * curve };

      return {
        x:
          mt * mt * mt * start.x +
          3 * mt * mt * t * c1.x +
          3 * mt * t * t * c2.x +
          t * t * t * end.x,
        y:
          mt * mt * mt * start.y +
          3 * mt * mt * t * c1.y +
          3 * mt * t * t * c2.y +
          t * t * t * end.y
      };
    },
    []
  );

  const chooseConnectorSides = useCallback(
    (sourceBlockId: string, targetBlockId: string): { sourceSide: AnchorSide; targetSide: AnchorSide } => {
      const source = positionedMap.get(sourceBlockId);
      const target = positionedMap.get(targetBlockId);

      if (!source || !target) {
        return { sourceSide: "right", targetSide: "left" };
      }

      const sourceCenter = {
        x: source.left + CARD_WIDTH / 2,
        y: source.top + CARD_HEIGHT / 2
      };
      const targetCenter = {
        x: target.left + CARD_WIDTH / 2,
        y: target.top + CARD_HEIGHT / 2
      };

      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;

      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
          ? { sourceSide: "right", targetSide: "left" }
          : { sourceSide: "left", targetSide: "right" };
      }

      return dy >= 0
        ? { sourceSide: "bottom", targetSide: "top" }
        : { sourceSide: "top", targetSide: "bottom" };
    },
    [positionedMap]
  );

  const clientToBoardPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const viewport = boardViewportRef.current;
    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();
    const scale = zoomRef.current;
    return {
      x: (clientX - rect.left + viewport.scrollLeft) / scale,
      y: (clientY - rect.top + viewport.scrollTop) / scale
    };
  }, []);

  const visualEdges = useMemo<VisualEdge[]>(() => {
    const manualEdges = edges.map((edge) => ({
      id: edge.id,
      sourceBlockId: edge.sourceBlockId,
      targetBlockId: edge.targetBlockId,
      kind: "manual" as const,
      step: null,
      flowColorIndex: null
    }));

    const existingPairs = new Set(
      manualEdges.map((edge) => `${edge.sourceBlockId}::${edge.targetBlockId}`)
    );
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const autoEdgesByPair = new Map<string, VisualEdge>();

    for (const task of tasks) {
      if (!task.dependsOnTaskId) {
        continue;
      }

      const dependencyTask = tasksById.get(task.dependsOnTaskId);
      if (!dependencyTask || dependencyTask.blockId === task.blockId) {
        continue;
      }

      // Visual flow: prerequisite task/block -> dependent task/block
      const sourceBlockId = dependencyTask.blockId;
      const targetBlockId = task.blockId;
      const pairKey = `${sourceBlockId}::${targetBlockId}`;
      const edgeStep = flowInsights.taskEdgeStep.get(`${dependencyTask.id}::${task.id}`) ?? 1;
      const edgeFlowColorIndex =
        flowInsights.taskEdgeFlowIndex.get(`${dependencyTask.id}::${task.id}`) ?? 0;

      if (existingPairs.has(pairKey)) {
        continue;
      }

      const existingAuto = autoEdgesByPair.get(pairKey);
      if (existingAuto) {
        autoEdgesByPair.set(pairKey, {
          ...existingAuto,
          step: existingAuto.step ? Math.min(existingAuto.step, edgeStep) : edgeStep,
          flowColorIndex:
            existingAuto.flowColorIndex === null
              ? edgeFlowColorIndex
              : Math.min(existingAuto.flowColorIndex, edgeFlowColorIndex)
        });
        continue;
      }

      autoEdgesByPair.set(pairKey, {
        id: `task-link:${pairKey}`,
        sourceBlockId,
        targetBlockId,
        kind: "task_dependency",
        step: edgeStep,
        flowColorIndex: edgeFlowColorIndex
      });
    }

    return [...manualEdges, ...autoEdgesByPair.values()];
  }, [edges, flowInsights.taskEdgeFlowIndex, flowInsights.taskEdgeStep, tasks]);

  const edgePaths = useMemo(() => {
    return visualEdges
      .map((edge) => {
        const sideOverride = edge.kind === "manual" ? edgeAnchorOverrides[edge.id] : undefined;
        const { sourceSide, targetSide } =
          sideOverride ?? chooseConnectorSides(edge.sourceBlockId, edge.targetBlockId);
        const start = getAnchorPoint(edge.sourceBlockId, sourceSide);
        const end = getAnchorPoint(edge.targetBlockId, targetSide);

        if (!start || !end) {
          return null;
        }
        const d = buildConnectorPath(start, end, sourceSide);
        const midpoint = getConnectorMidPoint(start, end, sourceSide);

        return {
          id: edge.id,
          kind: edge.kind,
          step: edge.step,
          flowColorIndex: edge.flowColorIndex,
          d,
          blocked: edge.kind === "manual" ? blockedMap[edge.sourceBlockId] ?? false : false,
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          midX: midpoint.x,
          midY: midpoint.y
        };
      })
      .filter(
        (
          item
        ): item is {
          id: string;
          kind: VisualEdgeKind;
          step: number | null;
          flowColorIndex: number | null;
          d: string;
          blocked: boolean;
          startX: number;
          startY: number;
          endX: number;
          endY: number;
          midX: number;
          midY: number;
        } => item !== null
      );
  }, [
    blockedMap,
    buildConnectorPath,
    chooseConnectorSides,
    edgeAnchorOverrides,
    getConnectorMidPoint,
    getAnchorPoint,
    visualEdges
  ]);

  useEffect(() => {
    if (!linkDraft) {
      return;
    }

    const onPointerMove = (event: PointerEvent): void => {
      const point = clientToBoardPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      setLinkPointer(point);
    };

    window.addEventListener("pointermove", onPointerMove);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [clientToBoardPoint, linkDraft]);

  const draftConnector = useMemo(() => {
    if (!linkDraft || !linkPointer) {
      return null;
    }

    const start = getAnchorPoint(linkDraft.sourceBlockId, linkDraft.sourceSide);
    if (!start) {
      return null;
    }

    return {
      d: buildConnectorPath(start, linkPointer, linkDraft.sourceSide),
      startX: start.x,
      startY: start.y,
      endX: linkPointer.x,
      endY: linkPointer.y
    };
  }, [buildConnectorPath, getAnchorPoint, linkDraft, linkPointer]);

  const createEdge = useCallback(
    async (
      sourceBlockId: string,
      targetBlockId: string,
      override?: EdgeAnchorOverride
    ): Promise<void> => {
      if (!sourceBlockId || !targetBlockId) {
        return;
      }

      if (sourceBlockId === targetBlockId) {
        setError("Блок не може залежати сам від себе.");
        return;
      }

      if (
        edges.some(
          (edge) =>
            edge.sourceBlockId === sourceBlockId && edge.targetBlockId === targetBlockId
        )
      ) {
        setError("Такий зв'язок вже існує.");
        return;
      }

      try {
        const response = await apiPost<{ edge: BlockEdge }>("/api/edges", {
          sourceBlockId,
          targetBlockId
        });

        setEdges((previous) => [...previous, response.edge]);
        if (override) {
          setEdgeAnchorOverrides((previous) => ({
            ...previous,
            [response.edge.id]: override
          }));
        }
      } catch (createError) {
        setError(extractErrorMessage(createError));
      }
    },
    [edges]
  );

  const startBlockDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, blockId: string): void => {
      if (linkDraft) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const block = blocksById.get(blockId);
      if (!block) {
        return;
      }

      const dragBlockIds =
        canUseHoverInteractions &&
        selectedCanvasBlockIds.includes(blockId) &&
        selectedCanvasBlockIds.length > 1
          ? selectedCanvasBlockIds
          : [blockId];
      const startPositions = dragBlockIds.reduce<Record<string, { x: number; y: number }>>(
        (acc, id) => {
          const item = blocksById.get(id);
          if (item) {
            acc[id] = { x: item.x, y: item.y };
          }
          return acc;
        },
        {}
      );
      if (!startPositions[blockId]) {
        startPositions[blockId] = { x: block.x, y: block.y };
      }

      event.preventDefault();
      event.stopPropagation();

      if (canUseHoverInteractions) {
        setSelectedCanvasBlockIds((previous) =>
          previous.includes(blockId) && previous.length > 1 ? previous : [blockId]
        );
      } else {
        setSelectedCanvasBlockIds([]);
      }

      dragStateRef.current = {
        blockId,
        blockIds: dragBlockIds,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBlockX: block.x,
        startBlockY: block.y,
        startPositions,
        moved: false
      };

      setDraggingBlockId(blockId);
    },
    [blocksById, canUseHoverInteractions, linkDraft, selectedCanvasBlockIds]
  );

  const handleCanvasBoardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (linkDraft) {
        setLinkDraft(null);
        setLinkPointer(null);
        return;
      }

      if (!canUseHoverInteractions) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const startPoint = clientToBoardPoint(event.clientX, event.clientY);
      if (!startPoint) {
        return;
      }

      event.preventDefault();
      setSelectedCanvasBlockIds([]);
      setSelectionRect({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
      marqueeStateRef.current = {
        startX: startPoint.x,
        startY: startPoint.y,
        moved: false
      };
      setIsMarqueeSelecting(true);
    },
    [canUseHoverInteractions, clientToBoardPoint, linkDraft]
  );

  useEffect(() => {
    if (!isMarqueeSelecting || !canUseHoverInteractions) {
      return;
    }

    const onPointerMove = (event: PointerEvent): void => {
      const marqueeState = marqueeStateRef.current;
      if (!marqueeState) {
        return;
      }

      const currentPoint = clientToBoardPoint(event.clientX, event.clientY);
      if (!currentPoint) {
        return;
      }

      const dx = currentPoint.x - marqueeState.startX;
      const dy = currentPoint.y - marqueeState.startY;
      const distance = Math.hypot(dx, dy);
      if (!marqueeState.moved && distance >= DRAG_THRESHOLD_PX / Math.max(zoomRef.current, 0.0001)) {
        marqueeState.moved = true;
      }

      const nextRect = {
        x: Math.min(marqueeState.startX, currentPoint.x),
        y: Math.min(marqueeState.startY, currentPoint.y),
        width: Math.abs(dx),
        height: Math.abs(dy)
      };
      setSelectionRect(nextRect);

      if (!marqueeState.moved) {
        return;
      }

      const selectedIds = positionedBlocks
        .filter(({ left, top }) => {
          const blockLeft = left;
          const blockTop = top;
          const blockRight = blockLeft + CARD_WIDTH;
          const blockBottom = blockTop + CARD_HEIGHT;
          const rectRight = nextRect.x + nextRect.width;
          const rectBottom = nextRect.y + nextRect.height;

          return !(
            rectRight < blockLeft ||
            nextRect.x > blockRight ||
            rectBottom < blockTop ||
            nextRect.y > blockBottom
          );
        })
        .map(({ block }) => block.id);

      setSelectedCanvasBlockIds(selectedIds);
    };

    const onPointerUp = (): void => {
      const marqueeState = marqueeStateRef.current;
      if (!marqueeState?.moved) {
        setSelectedCanvasBlockIds([]);
      }

      marqueeStateRef.current = null;
      setIsMarqueeSelecting(false);
      setSelectionRect(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [canUseHoverInteractions, clientToBoardPoint, isMarqueeSelecting, positionedBlocks]);

  const handleAnchorPointerDown = useCallback(
    async (
      event: ReactPointerEvent<HTMLButtonElement>,
      blockId: string,
      side: AnchorSide
    ): Promise<void> => {
      event.preventDefault();
      event.stopPropagation();

      const anchor = getAnchorPoint(blockId, side);
      if (!anchor) {
        return;
      }

      if (!linkDraft) {
        setLinkDraft({ sourceBlockId: blockId, sourceSide: side });
        setLinkPointer(anchor);
        return;
      }

      if (linkDraft.sourceBlockId === blockId) {
        setLinkDraft({ sourceBlockId: blockId, sourceSide: side });
        setLinkPointer(anchor);
        return;
      }

      await createEdge(linkDraft.sourceBlockId, blockId, {
        sourceSide: linkDraft.sourceSide,
        targetSide: side
      });
      setLinkDraft(null);
      setLinkPointer(null);
    },
    [createEdge, getAnchorPoint, linkDraft]
  );

  useEffect(() => {
    if (!draggingBlockId) {
      return;
    }

    const onPointerMove = (event: PointerEvent): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.blockId !== draggingBlockId) {
        return;
      }

      const dx = event.clientX - dragState.startClientX;
      const dy = event.clientY - dragState.startClientY;
      const distance = Math.hypot(dx, dy);

      if (!dragState.moved && distance < DRAG_THRESHOLD_PX) {
        return;
      }

      dragState.moved = true;
      const scale = zoomRef.current;
      const nextDeltaX = dx / scale;
      const nextDeltaY = dy / scale;
      const draggedIds = new Set(dragState.blockIds);

      setBlocks((previous) =>
        previous.map((block) => {
          if (!draggedIds.has(block.id)) {
            return block;
          }

          const start = dragState.startPositions[block.id];
          if (!start) {
            return block;
          }

          const nextX = Math.round(start.x + nextDeltaX);
          const nextY = Math.round(start.y + nextDeltaY);
          if (block.x === nextX && block.y === nextY) {
            return block;
          }

          return {
            ...block,
            x: nextX,
            y: nextY
          };
        })
      );
    };

    const onPointerUp = (): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.blockId !== draggingBlockId) {
        setDraggingBlockId(null);
        dragStateRef.current = null;
        return;
      }

      if (!dragState.moved) {
        openBlockDrawer(dragState.blockId);

        setDraggingBlockId(null);
        dragStateRef.current = null;
        return;
      }

      setBlocks((previous) => {
        persistCurrentBlockPositions(previous);
        return previous;
      });

      setDraggingBlockId(null);
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingBlockId, openBlockDrawer, persistCurrentBlockPositions]);

  const handleAddBlock = async (): Promise<void> => {
    const title = newBlockTitle.trim();
    if (!title) {
      return;
    }

    const typePreset = blockTypeOptions.find((option) => option.value === newBlockType);

    try {
      const response = await apiPost<{ block: BusinessBlock }>("/api/blocks", {
        title,
        type: newBlockType,
        color: typePreset?.color ?? "#4B5563",
        iconName: newBlockIconName,
        x: 140 + (blocks.length % 4) * 320,
        y: 140 + Math.floor(blocks.length / 4) * 220
      });

      setBlocks((previous) => [response.block, ...previous]);
      setNewBlockTitle("");
      setNewBlockType("custom");
      setNewBlockIconName(getDefaultIconNameForBlockType("custom"));
      setIsAddBlockOpen(false);
      openBlockDrawer(response.block.id);
    } catch (addError) {
      setError(extractErrorMessage(addError));
    }
  };

  const handleArchiveBlock = useCallback(async (blockId: string): Promise<void> => {
    try {
      await apiDelete<{ success: boolean }>(`/api/blocks/${blockId}`);
      setBlocks((previous) => previous.filter((block) => block.id !== blockId));
      setEdges((previous) =>
        previous.filter(
          (edge) => edge.sourceBlockId !== blockId && edge.targetBlockId !== blockId
        )
      );
      setTasks((previous) => previous.filter((task) => task.blockId !== blockId));
      closeBlockDrawer();
    } catch (archiveError) {
      setError(extractErrorMessage(archiveError));
    }
  }, [closeBlockDrawer]);

  const handleRenameBlock = useCallback(
    async (blockId: string, title: string): Promise<void> => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        return;
      }

      try {
        const response = await apiPatch<{ block: BusinessBlock }>(`/api/blocks/${blockId}`, {
          title: normalizedTitle
        });

        setBlocks((previous) =>
          previous.map((block) => (block.id === blockId ? response.block : block))
        );
      } catch (renameError) {
        setError(extractErrorMessage(renameError));
      }
    },
    []
  );

  const handleUpdateBlockIcon = useCallback(
    async (blockId: string, iconName: BusinessBlock["iconName"]): Promise<void> => {
      try {
        const response = await apiPatch<{ block: BusinessBlock }>(`/api/blocks/${blockId}`, {
          iconName
        });

        setBlocks((previous) =>
          previous.map((block) => (block.id === blockId ? response.block : block))
        );
      } catch (updateError) {
        setError(extractErrorMessage(updateError));
      }
    },
    []
  );

  const handleCreateEdge = useCallback(async (): Promise<void> => {
    if (!edgeSourceId || !edgeTargetId) {
      return;
    }

    await createEdge(edgeSourceId, edgeTargetId);
    setEdgeTargetId("");
  }, [createEdge, edgeSourceId, edgeTargetId]);

  const handleDeleteEdge = useCallback(async (edgeId: string): Promise<void> => {
    try {
      await apiDelete<{ success: boolean }>(`/api/edges/${edgeId}`);
      setEdges((previous) => previous.filter((edge) => edge.id !== edgeId));
      setEdgeAnchorOverrides((previous) => {
        if (!previous[edgeId]) {
          return previous;
        }

        const next = { ...previous };
        delete next[edgeId];
        return next;
      });
    } catch (deleteError) {
      setError(extractErrorMessage(deleteError));
    }
  }, []);

  const handleCanvasTitleUpdate = useCallback(async (): Promise<void> => {
    const normalizedTitle = canvasTitleDraft.trim();
    if (!normalizedTitle) {
      setCanvasTitleDraft(canvasTitle);
      return;
    }

    if (normalizedTitle === canvasTitle) {
      return;
    }

    setSavingCanvasTitle(true);

    try {
      const response = await apiPatch<{ title: string }>("/api/workspace", {
        title: normalizedTitle
      });
      setCanvasTitle(response.title);
      setCanvasTitleDraft(response.title);
    } catch (renameError) {
      setCanvasTitleDraft(canvasTitle);
      setError(extractErrorMessage(renameError));
    } finally {
      setSavingCanvasTitle(false);
    }
  }, [canvasTitle, canvasTitleDraft]);

  const createTaskInBlock = useCallback(
    async (
      blockId: string,
      payload: {
        title: string;
        dueDate: string | null;
      }
    ): Promise<TaskItem | null> => {
      try {
        const order = tasks.filter((task) => task.blockId === blockId).length;
        const response = await apiPost<{ task: TaskItem }>("/api/tasks", {
          blockId,
          title: payload.title,
          dueDate: payload.dueDate,
          order,
          status: "todo"
        });

        setTasks((previous) => [...previous, response.task]);
        return response.task;
      } catch (createError) {
        setError(extractErrorMessage(createError));
        return null;
      }
    },
    [tasks]
  );

  const handleCreateTask = useCallback(
    async (payload: {
      title: string;
      dueDate: string | null;
    }): Promise<TaskItem | null> => {
      if (!selectedBlockId) {
        return null;
      }

      return createTaskInBlock(selectedBlockId, payload);
    },
    [createTaskInBlock, selectedBlockId]
  );

  const openCreateTaskModal = useCallback((): void => {
    if (blocks.length === 0) {
      return;
    }

    setNewTaskTitle("");
    setNewTaskBlockId(selectedBlockId ?? blocks[0]?.id ?? "");
    setIsAddTaskOpen(true);
  }, [blocks, selectedBlockId]);

  const handleCreateTaskFromList = useCallback(async (): Promise<void> => {
    const title = newTaskTitle.trim();
    if (!title || !newTaskBlockId) {
      return;
    }

    const created = await createTaskInBlock(newTaskBlockId, {
      title,
      dueDate: null
    });

    if (!created) {
      return;
    }

    setIsAddTaskOpen(false);
    setNewTaskTitle("");
    setNewTaskBlockId("");
  }, [createTaskInBlock, newTaskBlockId, newTaskTitle]);

  const handleQuickAddTaskForBlock = useCallback((blockId: string): void => {
    setTaskDrawerCreateBlockId(blockId);
    setSelectedBlockId(blockId);
    setTaskDrawerCreateToken((previous) => previous + 1);
  }, []);

  const handleUpdateTask = useCallback(
    async (taskId: string, payload: Partial<TaskItem>): Promise<void> => {
      const snapshot = tasks;

      setTasks((previous) =>
        previous.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
      );

      try {
        const response = await apiPatch<{ task: TaskItem }>(`/api/tasks/${taskId}`, payload);
        setTasks((previous) =>
          previous.map((task) => (task.id === taskId ? response.task : task))
        );
      } catch (updateError) {
        setTasks(snapshot);
        setError(extractErrorMessage(updateError));
      }
    },
    [tasks]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      const snapshot = tasks;
      setTasks((previous) => previous.filter((task) => task.id !== taskId));

      try {
        await apiDelete<{ success: boolean }>(`/api/tasks/${taskId}`);
      } catch (deleteError) {
        setTasks(snapshot);
        setError(extractErrorMessage(deleteError));
      }
    },
    [tasks]
  );

  const handleMoveTask = useCallback(
    async (taskId: string, direction: "up" | "down"): Promise<void> => {
      if (!selectedBlockId) {
        return;
      }

      const blockTasks = tasks
        .filter((task) => task.blockId === selectedBlockId)
        .sort((a, b) => a.order - b.order);
      const currentIndex = blockTasks.findIndex((task) => task.id === taskId);

      if (currentIndex < 0) {
        return;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= blockTasks.length) {
        return;
      }

      const reordered = [...blockTasks];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      const ordering = reordered.map((task, index) => ({
        id: task.id,
        order: index
      }));

      const orderMap = new Map(ordering.map((item) => [item.id, item.order]));
      const snapshot = tasks;

      setTasks((previous) =>
        previous.map((task) => {
          const updatedOrder = orderMap.get(task.id);
          if (updatedOrder === undefined) {
            return task;
          }

          return {
            ...task,
            order: updatedOrder
          };
        })
      );

      try {
        await apiPost<{ success: boolean }>("/api/tasks/reorder", { ordering });
      } catch (moveError) {
        setTasks(snapshot);
        setError(extractErrorMessage(moveError));
      }
    },
    [selectedBlockId, tasks]
  );

  const handleChangeViewMode = useCallback(
    (nextMode: WorkspaceViewMode): void => {
      if (viewMode === "list") {
        const listViewport = listViewportRef.current;
        if (listViewport) {
          listScrollTopRef.current = listViewport.scrollTop;
        }
      }

      if (nextMode === "canvas") {
        shouldCenterCanvasRef.current = true;
      }

      setViewMode(nextMode);
      if (nextMode !== "canvas") {
        setLinkDraft(null);
        setLinkPointer(null);
      }
    },
    [viewMode]
  );

  const handleThemeModeChange = useCallback((nextMode: ThemeMode): void => {
    setThemeMode(nextMode);
    persistThemeMode(nextMode);
    applyThemeMode(nextMode);
    window.dispatchEvent(new Event("moddyland-theme-change"));
  }, []);

  useEffect(() => {
    if (viewMode !== "canvas" || !shouldCenterCanvasRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      centerViewportOnBlocks();
      shouldCenterCanvasRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [boardMetrics.height, boardMetrics.width, centerViewportOnBlocks, positionedBlocks, viewMode, zoom]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="surface-panel lift-enter inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-slate-700">
          <Sparkles size={16} />
          Завантаження workspace...
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden">
      <PwaRegister />

      <section
        ref={canvasSectionRef}
        className="lift-enter relative isolate h-full w-full overflow-hidden"
      >
        <div className="absolute inset-0 z-0 bg-slate-100 dark:bg-slate-950" />

        <div className="canvas-grid-overlay pointer-events-none absolute inset-0 z-0 opacity-20 dark:opacity-38 [background-image:linear-gradient(rgba(15,23,42,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.09)_1px,transparent_1px)] dark:[background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:36px_36px]" />

        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 md:inset-x-4 md:top-4">
          <div className="pointer-events-auto relative flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 md:absolute md:left-1/2 md:-translate-x-1/2">
              <button
                type="button"
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition",
                  viewMode === "canvas"
                    ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                onClick={(event) => {
                  event.currentTarget.blur();
                  handleChangeViewMode("canvas");
                }}
              >
                Канвас
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition",
                  viewMode === "list"
                    ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                onClick={(event) => {
                  event.currentTarget.blur();
                  handleChangeViewMode("list");
                }}
              >
                Список
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition",
                  viewMode === "flow"
                    ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                onClick={(event) => {
                  event.currentTarget.blur();
                  handleChangeViewMode("flow");
                }}
              >
                Потік
              </button>
            </div>
            <div className="ml-auto flex items-center gap-2">
            {viewMode === "canvas" ? (
              <button
                type="button"
                className="soft-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-100"
                onClick={() => setIsAddBlockOpen(true)}
              >
                <Plus size={15} />
                Новий блок
              </button>
            ) : (
              <button
                type="button"
                className="soft-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={openCreateTaskModal}
                disabled={blocks.length === 0}
              >
                <Plus size={15} />
                Нова задача
              </button>
            )}
            <div ref={moreMenuRef} className="relative">
              <button
                type="button"
                className="soft-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setIsMoreMenuOpen((current) => !current)}
              >
                <MoreHorizontal size={16} />
              </button>
              {isMoreMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setIsBlockListOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    <ListTree size={15} />
                    Блоки
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setIsEdgeManagerOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    <Link2 size={15} />
                    Звʼязки
                  </button>
                  <a
                    href={`/${workspace}/dashboard`}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => setIsMoreMenuOpen(false)}
                  >
                    <LayoutDashboard size={15} />
                    Dashboard
                  </a>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      void reloadData();
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    <RefreshCcw size={15} />
                    Оновити
                  </button>
                  <div className="my-1 border-t border-slate-200/80 dark:border-slate-700/80" />
                  <div className="px-2 pb-1 pt-0.5">
                    <div className="mb-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      Назва канваса
                    </div>
                    <input
                      className={cn(
                        "soft-input w-full px-2 py-1.5 text-xs font-semibold",
                        savingCanvasTitle ? "opacity-70" : ""
                      )}
                      value={canvasTitleDraft}
                      onChange={(event) => setCanvasTitleDraft(event.target.value)}
                      onBlur={() => {
                        void handleCanvasTitleUpdate();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                          return;
                        }

                        if (event.key === "Escape") {
                          setCanvasTitleDraft(canvasTitle);
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </div>
                  {viewMode === "list" ? (
                    <div className="px-2 pb-1 pt-1">
                      <div className="mb-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Сортування списку
                      </div>
                      <select
                        className="soft-input w-full px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-100"
                        value={taskListSortMode}
                        onChange={(event) => setTaskListSortMode(event.target.value as TaskListSortMode)}
                        aria-label="Сортування списку задач"
                      >
                        <option value="default">Дефолтний</option>
                        <option value="custom">Кастомний (drag)</option>
                      </select>
                    </div>
                  ) : null}
                  <div className="my-1 border-t border-slate-200/80 dark:border-slate-700/80" />
                  <div className="px-1 pb-1 pt-0.5">
                    <div className="mb-1 px-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      Тема
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-semibold transition",
                          themeMode === "light"
                            ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950"
                            : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        )}
                        onClick={() => handleThemeModeChange("light")}
                        title="Світла тема"
                        aria-label="Світла тема"
                      >
                        <Sun size={13} />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-semibold transition",
                          themeMode === "dark"
                            ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950"
                            : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        )}
                        onClick={() => handleThemeModeChange("dark")}
                        title="Темна тема"
                        aria-label="Темна тема"
                      >
                        <Moon size={13} />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-semibold transition",
                          themeMode === "system"
                            ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950"
                            : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        )}
                        onClick={() => handleThemeModeChange("system")}
                        title="Системна тема"
                        aria-label="Системна тема"
                      >
                        <Monitor size={13} />
                      </button>
                    </div>
                  </div>
                  {viewMode === "canvas" ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => {
                        resetZoom();
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <span className="inline-flex h-[15px] w-[15px] items-center justify-center text-[11px] sm:text-xs font-bold">
                        %
                      </span>
                      Масштаб 100%
                    </button>
                  ) : null}
                  {viewMode === "canvas" && linkDraft ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-amber-800 transition hover:bg-amber-50"
                      onClick={() => {
                        setLinkDraft(null);
                        setLinkPointer(null);
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <X size={15} />
                      Скасувати зʼєднання
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </div>

        {viewMode === "canvas" ? (
          <div className="absolute bottom-3 right-3 z-30 inline-flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 backdrop-blur transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => zoomByFactor(1 / 1.12)}
              aria-label="Зменшити масштаб"
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 backdrop-blur transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => zoomByFactor(1.12)}
              aria-label="Збільшити масштаб"
            >
              <ZoomIn size={15} />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="absolute right-4 top-[84px] z-30 inline-flex max-w-[420px] items-start gap-2 rounded-lg border border-destructive bg-red-50 px-3 py-2 text-xs font-semibold text-destructive shadow-card dark:border-rose-500/50 dark:bg-rose-950/70 dark:text-rose-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {viewMode === "canvas" && linkDraft ? (
          <div className="absolute left-1/2 top-[84px] z-30 -translate-x-1/2 rounded-lg border border-amber-300 bg-white/90 px-3 py-2 text-xs font-semibold text-amber-900 shadow-card backdrop-blur dark:border-amber-400/60 dark:bg-slate-900/90 dark:text-amber-200">
            Зʼєднання активне: обери точку на іншому блоці або натисни `Esc`.
          </div>
        ) : null}

        {viewMode === "canvas" ? (
          <div
            ref={boardViewportRef}
            className="absolute inset-0 z-10 overflow-auto px-4 pb-20 pt-4 md:px-6 md:pb-24"
          >
            <div
              className="relative"
              style={{
                width: `${boardMetrics.width * zoom}px`,
                height: `${boardMetrics.height * zoom}px`
              }}
            >
              <div
                className="relative"
                style={{
                  width: `${boardMetrics.width}px`,
                  height: `${boardMetrics.height}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left"
                }}
                onPointerDown={handleCanvasBoardPointerDown}
              >
                {selectionRect && (selectionRect.width > 1 || selectionRect.height > 1) ? (
                  <div
                    className="pointer-events-none absolute z-[5] rounded-md border border-sky-400/70 bg-sky-300/15 dark:border-sky-500/70 dark:bg-sky-500/20"
                    style={{
                      left: selectionRect.x,
                      top: selectionRect.y,
                      width: selectionRect.width,
                      height: selectionRect.height
                    }}
                  />
                ) : null}
                <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full" aria-hidden>
                {edgePaths.map((edge) => {
                  const flowTheme =
                    edge.kind === "task_dependency"
                      ? getFlowThemeColors(edge.flowColorIndex ?? 0, resolvedTheme)
                      : null;

                  return (
                  <g key={edge.id}>
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={
                        edge.kind === "task_dependency"
                          ? flowTheme?.edgeBase ?? "#a78bfa"
                          : edge.blocked
                          ? resolvedTheme === "dark"
                            ? "#64748b"
                            : "#d6d3d1"
                          : resolvedTheme === "dark"
                            ? "#64748b"
                            : "#cbd5e1"
                      }
                      strokeWidth={1.4}
                      strokeOpacity={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? 0.62
                            : 0.72
                          : resolvedTheme === "dark"
                            ? 0.56
                            : edge.blocked
                              ? 0.82
                              : 0.78
                      }
                      strokeDasharray={edge.blocked ? "4 6" : undefined}
                      strokeLinecap="round"
                    />
                    <path
                      d={edge.d}
                      fill="none"
                      className={cn(
                        "connector-flow connector-flow-glow",
                        edge.kind === "task_dependency"
                          ? "connector-flow-glow-auto"
                          : edge.blocked
                            ? "connector-flow-glow-blocked"
                            : "connector-flow-glow-active"
                      )}
                      stroke={
                        edge.kind === "task_dependency"
                          ? flowTheme?.edgeGlow ?? "#8b5cf6"
                          : edge.blocked
                          ? resolvedTheme === "dark"
                            ? "#fcd34d"
                            : "#fef3c7"
                          : resolvedTheme === "dark"
                            ? "#93c5fd"
                            : "#dbeafe"
                      }
                      strokeWidth={2.1}
                      strokeOpacity={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? 0.78
                            : 0.56
                          : resolvedTheme === "dark"
                            ? 0.64
                            : edge.blocked
                              ? 0.44
                              : 0.46
                      }
                      strokeDasharray={edge.kind === "task_dependency" ? "15 33" : edge.blocked ? "14 34" : "16 32"}
                      strokeLinecap="round"
                    />
                    <path
                      d={edge.d}
                      fill="none"
                      className={cn(
                        "connector-flow connector-flow-core",
                        edge.kind === "task_dependency"
                          ? "connector-flow-core-auto"
                          : edge.blocked
                            ? "connector-flow-core-blocked"
                            : "connector-flow-core-active"
                      )}
                      stroke={
                        edge.kind === "task_dependency"
                          ? flowTheme?.edgeCore ?? "#ede9fe"
                          : edge.blocked
                          ? resolvedTheme === "dark"
                            ? "#fef3c7"
                            : "#fffbeb"
                          : resolvedTheme === "dark"
                            ? "#e0f2fe"
                            : "#ffffff"
                      }
                      strokeWidth={1.1}
                      strokeOpacity={edge.kind === "task_dependency" ? 0.95 : edge.blocked ? 0.97 : 0.98}
                      strokeDasharray={edge.kind === "task_dependency" ? "8 40" : edge.blocked ? "8 40" : "8 40"}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={edge.startX}
                      cy={edge.startY}
                      r={1.8}
                      fill={
                        edge.kind === "task_dependency"
                          ? flowTheme?.edgeDot ?? "#a78bfa"
                          : resolvedTheme === "dark"
                            ? "#94a3b8"
                            : "#cbd5e1"
                      }
                      opacity={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? 0.72
                            : 0.78
                          : resolvedTheme === "dark"
                            ? 0.58
                            : 0.75
                      }
                    />
                    <circle
                      cx={edge.endX}
                      cy={edge.endY}
                      r={1.8}
                      fill={
                        edge.kind === "task_dependency"
                          ? flowTheme?.edgeDot ?? "#a78bfa"
                          : resolvedTheme === "dark"
                            ? "#94a3b8"
                            : "#cbd5e1"
                      }
                      opacity={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? 0.72
                            : 0.78
                          : resolvedTheme === "dark"
                            ? 0.58
                            : 0.75
                      }
                    />
                    {edge.kind === "task_dependency" && edge.step ? (
                      <g>
                        <circle
                          cx={edge.midX}
                          cy={edge.midY}
                          r={8}
                          fill={flowTheme?.edgeStepBg ?? (resolvedTheme === "dark" ? "#4c1d95" : "#6d28d9")}
                          fillOpacity={resolvedTheme === "dark" ? 0.92 : 0.9}
                          stroke={flowTheme?.edgeStepBorder ?? (resolvedTheme === "dark" ? "#c4b5fd" : "#ede9fe")}
                          strokeWidth={1}
                        />
                        <text
                          x={edge.midX}
                          y={edge.midY + 0.8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={flowTheme?.edgeStepText ?? (resolvedTheme === "dark" ? "#f5f3ff" : "#ffffff")}
                          fontSize="8"
                          fontWeight="700"
                        >
                          {edge.step}
                        </text>
                      </g>
                    ) : null}
                  </g>
                  );
                })}
                  {draftConnector ? (
                  <g>
                    <path
                      d={draftConnector.d}
                      fill="none"
                      stroke={resolvedTheme === "dark" ? "#38bdf8" : "#0ea5e9"}
                      strokeWidth={2}
                      strokeOpacity={0.8}
                      strokeDasharray="4 5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={draftConnector.startX}
                      cy={draftConnector.startY}
                      r={2.2}
                      fill={resolvedTheme === "dark" ? "#38bdf8" : "#0284c7"}
                    />
                    <circle
                      cx={draftConnector.endX}
                      cy={draftConnector.endY}
                      r={2.2}
                      fill={resolvedTheme === "dark" ? "#38bdf8" : "#0284c7"}
                      opacity={0.8}
                    />
                  </g>
                  ) : null}
                </svg>

                {positionedBlocks.map(({ block, left, top }) => (
                  <article
                  key={block.id}
                  className={cn(
                    "group absolute z-10 w-[272px] cursor-grab rounded-2xl border p-3 shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition duration-100 active:cursor-grabbing",
                    "dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]",
                    "border-slate-200/85 bg-white dark:border-slate-700/90 dark:bg-slate-900/92",
                    draggingBlockId === block.id
                      ? "z-20 border-slate-400 shadow-[0_24px_42px_rgba(15,23,42,0.2)] dark:border-slate-500 dark:shadow-[0_24px_48px_rgba(2,6,23,0.52)]"
                      : canUseHoverInteractions
                        ? "hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-500"
                        : "",
                    selectedBlockId === block.id || selectedCanvasBlockIds.includes(block.id)
                      ? "ring-2 ring-slate-300/70 dark:ring-slate-500/70"
                      : "",
                    linkDraft?.sourceBlockId === block.id ? "ring-2 ring-amber-300/80 dark:ring-amber-400/80" : ""
                  )}
                  style={{
                    left,
                    top,
                    touchAction: "none",
                    userSelect: "none"
                  }}
                  onPointerEnter={() => {
                    if (!canUseHoverInteractions) {
                      return;
                    }
                    setHoveredBlockId(block.id);
                  }}
                  onPointerLeave={() => {
                    if (!canUseHoverInteractions) {
                      return;
                    }
                    setHoveredBlockId((current) => (current === block.id ? null : current));
                  }}
                  onPointerDown={(event) => startBlockDrag(event, block.id)}
                  data-canvas-block-card="true"
                >
                  {(() => {
                    const resolvedIconName = resolveBlockIconName(block);
                    const iconOption = getBlockIconOption(resolvedIconName);
                    const BlockIcon = iconOption.icon;
                    const iconColor = block.color ?? "#4B5563";
                    const workflow = workflowMetricsByBlock[block.id] ?? {
                      todo: 0,
                      inProgress: 0,
                      blocked: 0,
                      totalOpen: 0
                    };
                    const showAnchors = (canUseHoverInteractions && hoveredBlockId === block.id) || linkDraft !== null;
                    const hasInProgress = workflow.inProgress > 0;
                    const indicatorColor = hasInProgress ? "#22c55e" : "#94a3b8";
                    const blockTasksPreview = tasks
                      .filter((task) => task.blockId === block.id)
                      .sort(
                        (left, right) =>
                          taskStatusOrder[left.status] - taskStatusOrder[right.status] ||
                          left.order - right.order ||
                          left.updatedAt.localeCompare(right.updatedAt)
                      )
                      .slice(0, 3);

                    return (
                      <>
                        {showAnchors
                          ? ANCHOR_SIDES.map((side) => (
                              <button
                                key={side}
                                type="button"
                                aria-label={`Точка зʼєднання ${side}`}
                                className={cn(
                                  "absolute z-20 h-4 w-4 rounded-full border border-sky-300 bg-white shadow-sm transition hover:scale-110 hover:border-sky-500 hover:bg-sky-100 dark:border-sky-500 dark:bg-slate-900 dark:hover:border-sky-400 dark:hover:bg-sky-900/60",
                                  side === "top" && "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
                                  side === "right" && "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
                                  side === "bottom" && "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
                                  side === "left" && "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
                                  linkDraft?.sourceBlockId === block.id && linkDraft.sourceSide === side
                                    ? "border-amber-400 bg-amber-100 dark:bg-amber-900/70"
                                    : ""
                                )}
                                onPointerDown={(event) => void handleAnchorPointerDown(event, block.id, side)}
                              />
                            ))
                          : null}
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span
                              className="mb-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg"
                              style={{
                                backgroundColor: `${iconColor}1A`,
                                color: iconColor
                              }}
                            >
                              <BlockIcon size={17} />
                            </span>
                            <div className="line-clamp-1 text-base font-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                              {block.title}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="relative inline-flex h-3 w-3 items-center justify-center">
                              {hasInProgress ? (
                                <span
                                  className="absolute inset-0 rounded-full animate-ping"
                                  style={{ backgroundColor: indicatorColor, opacity: 0.42 }}
                                />
                              ) : null}
                              <span
                                className="relative inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: indicatorColor }}
                              />
                            </span>
                          </div>
                        </div>

                        {blockedMap[block.id] ? (
                          <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] sm:text-xs font-semibold text-amber-900">
                            <AlertTriangle size={12} />
                            Є блокуючі залежності
                          </div>
                        ) : null}

                        <div className="space-y-0.5">
                          {blockTasksPreview.map((task) => {
                            const taskDueTone = getTaskDueTone(task);
                            const isDependentTask = Boolean(task.dependsOnTaskId);
                            const isDependencySourceTask = dependencySourceTaskIds.has(task.id);
                            const flowStep = taskFlowStepById.get(task.id) ?? null;
                            return (
                              <button
                                key={task.id}
                                type="button"
                                  className={cn(
                                    "flex w-full items-center gap-1.5 rounded-md border border-transparent px-1 py-1 text-left text-[13px] font-medium leading-tight transition duration-100",
                                    canUseHoverInteractions
                                      ? isDependentTask
                                        ? "text-slate-700 hover:border-violet-400 dark:text-slate-200 dark:hover:border-violet-400"
                                        : isDependencySourceTask
                                          ? "text-slate-700 hover:border-violet-300 dark:text-slate-200 dark:hover:border-violet-500/70"
                                          : taskDueTone === "overdue"
                                            ? "text-slate-700 hover:border-rose-300 dark:text-slate-200 dark:hover:border-rose-400"
                                            : taskDueTone === "warning"
                                              ? "text-slate-700 hover:border-amber-300 dark:text-slate-200 dark:hover:border-amber-400"
                                              : "text-slate-700 hover:border-slate-300 dark:text-slate-200 dark:hover:border-slate-500"
                                      : "text-slate-700 dark:text-slate-200",
                                    isDependentTask
                                      ? "ring-1 ring-violet-300/85 dark:ring-violet-500/75"
                                      : isDependencySourceTask
                                        ? "ring-1 ring-violet-200/70 dark:ring-violet-500/40"
                                        : ""
                                )}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openBlockDrawer(block.id);
                                }}
                                title={task.title}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
                                    canUseHoverInteractions
                                      ? "hover:border-sky-300 hover:text-sky-700 dark:hover:border-sky-500 dark:hover:text-sky-300"
                                      : ""
                                  )}
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleUpdateTask(task.id, {
                                      status: task.status === "done" ? "todo" : "done"
                                    });
                                  }}
                                  aria-label={
                                    task.status === "done"
                                      ? "Позначити як не виконано"
                                      : "Позначити як виконано"
                                  }
                                >
                                  {task.status === "done" ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                                </button>
                                <span className="min-w-0 flex flex-1 items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "min-w-0 flex-1 truncate",
                                      task.status === "done"
                                        ? "line-through text-slate-500 dark:text-slate-400"
                                        : "",
                                      taskDueTone === "overdue"
                                        ? "text-rose-700 dark:text-rose-300"
                                        : taskDueTone === "warning"
                                          ? "text-amber-700 dark:text-amber-300"
                                          : ""
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                  {flowStep ? (
                                    <span className="inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-100 px-1 text-[10px] font-bold text-violet-700 dark:border-violet-500/60 dark:bg-violet-900/55 dark:text-violet-100">
                                      {flowStep}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            className={cn(
                              "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-1 py-1 text-[11px] sm:text-xs font-semibold text-sky-700 transition duration-100 dark:text-sky-300",
                              canUseHoverInteractions ? "hover:text-sky-800 dark:hover:text-sky-200" : ""
                            )}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleQuickAddTaskForBlock(block.id);
                            }}
                            aria-label={`Додати задачу у блок ${block.title}`}
                          >
                            <Plus size={12} />
                            Додати нове завдання
                          </button>
                        </div>
                      </>
                    );
                  })()}
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={listViewportRef}
            className="absolute inset-0 z-10 overflow-auto px-4 pb-20 pt-[65px] md:px-6 md:pb-24 md:pt-[106px]"
            onScroll={(event) => {
              listScrollTopRef.current = event.currentTarget.scrollTop;
            }}
          >
            <div className="mx-auto max-w-6xl space-y-3">
              {viewMode !== "flow" && taskSectionsForList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                  Немає задач.
                </div>
              ) : null}
              {viewMode === "flow" && flowChainsForList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                  Немає потоків. Додай залежності між задачами, щоб побачити Потік.
                </div>
              ) : null}

              <div
                className="space-y-2.5"
                onPointerDownCapture={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (!target) {
                    setExpandedListTaskId(null);
                    setListQuickEditor(null);
                    return;
                  }

                  if (target.closest("[data-list-task-item='true']")) {
                    return;
                  }

                  if (target.closest("[data-list-quick-editor='true']")) {
                    return;
                  }

                  setExpandedListTaskId(null);
                  setListQuickEditor(null);
                  setListChecklistComposerOpenByTask({});
                  setListDependencyEditorOpenByTask({});
                }}
              >
                {sectionsForCurrentView.map((section) => {
                      const canToggleCompleted = section.id === "mine" || section.id === "delegated";
                      const sectionFlowTheme =
                        viewMode === "flow" && typeof section.flowColorIndex === "number"
                          ? getFlowThemeColors(section.flowColorIndex, resolvedTheme)
                          : null;
                      const sectionCompletedVisible = canToggleCompleted
                        ? showCompletedBySection[section.id as "mine" | "delegated"]
                        : false;
                      const visibleItems = sectionCompletedVisible
                        ? section.completedItems
                        : section.activeItems;
                      const hasCompleted = canToggleCompleted && section.completedItems.length > 0;
                      return (
                      <section
                        key={section.id}
                        className={cn(
                          "space-y-2",
                          viewMode === "flow"
                            ? "rounded-2xl border px-3 py-3 md:px-4 md:py-4"
                            : ""
                        )}
                        style={
                          sectionFlowTheme
                            ? {
                                borderColor: sectionFlowTheme.frameBorder,
                                backgroundColor: sectionFlowTheme.frameBg
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {sectionFlowTheme ? (
                              <span
                                className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: sectionFlowTheme.edgeGlow }}
                              />
                            ) : null}
                            {section.title}
                          </div>
                          {hasCompleted ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-sky-700 transition hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                              onClick={() => {
                                if (!canToggleCompleted) {
                                  return;
                                }
                                setShowCompletedBySection((prev) => ({
                                  ...prev,
                                  [section.id]: !prev[section.id as "mine" | "delegated"]
                                }));
                              }}
                            >
                              {sectionCompletedVisible ? "Сховати" : "Показати"}
                            </button>
                          ) : null}
                        </div>
                        <div className="space-y-2.5">
                          {visibleItems.map(
                            ({
                              task,
                              block,
                              computedStatus,
                              dueTone,
                              dependencyTask,
                              dependencyBlock,
                              flowStep,
                              flowConnectorAfter,
                              flowColorIndex
                            }) => {
                              if (!block) {
                                return null;
                              }

                              const resolvedIconName = resolveBlockIconName(block);
                              const iconOption = getBlockIconOption(resolvedIconName);
                              const BlockIcon = iconOption.icon;
                              const iconColor = block.color ?? "#4B5563";
                              const isExpanded = expandedListTaskId === task.id;
                              const draftTitle = listTaskTitleDrafts[task.id] ?? task.title;
                              const checklistDraft = listChecklistDrafts[task.id] ?? "";
                              const isChecklistComposerOpen = Boolean(
                                listChecklistComposerOpenByTask[task.id]
                              );
                              const isDependencyEditorOpen = Boolean(
                                listDependencyEditorOpenByTask[task.id]
                              );
                              const isStatusEditorOpen =
                                listQuickEditor?.taskId === task.id && listQuickEditor.type === "status";
                              const isDueDateEditorOpen =
                                listQuickEditor?.taskId === task.id && listQuickEditor.type === "dueDate";
                              const isOwnershipEditorOpen =
                                listQuickEditor?.taskId === task.id && listQuickEditor.type === "ownership";
                              const flowTheme =
                                typeof flowColorIndex === "number"
                                  ? getFlowThemeColors(flowColorIndex, resolvedTheme)
                                  : null;
                              const taskDependencyOptions = dependencyTaskOptionsForList.filter(
                                (candidate) => candidate.id !== task.id
                              );

                              return (
                                <div key={task.id}>
                                <article
                                  data-list-task-item="true"
                                  draggable={viewMode !== "flow" && taskListSortMode === "custom"}
                                  onDragStart={() => {
                                    if (viewMode === "flow" || taskListSortMode !== "custom") {
                                      return;
                                    }
                                    setDraggingTaskIdInList(task.id);
                                  }}
                                  onDragEnter={() => {
                                    if (viewMode === "flow" || taskListSortMode !== "custom" || !draggingTaskIdInList) {
                                      return;
                                    }
                                    moveManualTaskOrder(draggingTaskIdInList, task.id);
                                  }}
                                  onDragOver={(event) => {
                                    if (viewMode === "flow" || taskListSortMode !== "custom") {
                                      return;
                                    }
                                    event.preventDefault();
                                  }}
                                  onDragEnd={() => setDraggingTaskIdInList(null)}
                                  onDrop={() => setDraggingTaskIdInList(null)}
                                  onClick={() =>
                                    setExpandedListTaskId((current) => (current === task.id ? null : task.id))
                                  }
                                className={cn(
                                  "group relative overflow-visible w-full rounded-2xl border bg-white px-4 py-3 transition",
                                  viewMode !== "flow" && taskListSortMode === "custom"
                                    ? "cursor-grab active:cursor-grabbing"
                                    : "",
                                  draggingTaskIdInList === task.id ? "opacity-45" : "",
                                  task.ownership === "delegated"
                                    ? canUseHoverInteractions
                                      ? "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/90 dark:hover:border-slate-500"
                                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/90"
                                    : dueTone === "overdue"
                                      ? canUseHoverInteractions
                                        ? "border-rose-200 bg-rose-100 hover:border-rose-300 dark:border-rose-500/55 dark:bg-rose-950 dark:hover:border-rose-400"
                                        : "border-rose-200 bg-rose-100 dark:border-rose-500/55 dark:bg-rose-950"
                                      : dueTone === "warning"
                                        ? canUseHoverInteractions
                                          ? "border-amber-200 bg-amber-100 hover:border-amber-300 dark:border-amber-500/55 dark:bg-amber-950 dark:hover:border-amber-400"
                                          : "border-amber-200 bg-amber-100 dark:border-amber-500/55 dark:bg-amber-950"
                                        : canUseHoverInteractions
                                          ? "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/90 dark:hover:border-slate-500"
                                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/90"
                                )}
                              >
                                  <div className="flex items-start gap-2.5">
                                    <button
                                      type="button"
                                      className={cn(
                                        "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
                                        canUseHoverInteractions
                                          ? "hover:border-sky-300 hover:text-sky-700 dark:hover:border-sky-500 dark:hover:text-sky-300"
                                          : ""
                                      )}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleUpdateTask(task.id, {
                                          status: task.status === "done" ? "todo" : "done"
                                        });
                                      }}
                                      aria-label={
                                        task.status === "done"
                                          ? "Позначити як не виконано"
                                          : "Позначити як виконано"
                                      }
                                    >
                                      {task.status === "done" ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className={cn(
                                          "text-base font-semibold break-words whitespace-normal",
                                          task.status === "done"
                                            ? "text-slate-500 line-through dark:text-slate-400"
                                            : dueTone === "overdue"
                                              ? "text-rose-700 dark:text-rose-300"
                                              : dueTone === "warning"
                                                ? "text-amber-700 dark:text-amber-300"
                                                : "text-slate-900 dark:text-slate-100"
                                        )}
                                      >
                                        {isExpanded ? (
                                          <textarea
                                            className={cn(
                                              "w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold leading-tight outline-none transition focus:border-slate-300 dark:focus:border-slate-600",
                                              task.status === "done"
                                                ? "text-slate-500 line-through dark:text-slate-400"
                                                : dueTone === "overdue"
                                                  ? "text-rose-700 dark:text-rose-300"
                                                  : dueTone === "warning"
                                                    ? "text-amber-700 dark:text-amber-300"
                                                    : "text-slate-900 dark:text-slate-100"
                                            )}
                                            rows={1}
                                            value={draftTitle}
                                            onClick={(event) => event.stopPropagation()}
                                            onFocus={() => setExpandedListTaskId(task.id)}
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
                                              setListTaskTitleDrafts((prev) => ({
                                                ...prev,
                                                [task.id]: event.target.value
                                              }));
                                            }}
                                            onBlur={() => {
                                              const nextTitle = draftTitle.trim();
                                              if (nextTitle && nextTitle !== task.title) {
                                                void handleUpdateTask(task.id, { title: nextTitle });
                                              }
                                            }}
                                          ></textarea>
                                        ) : (
                                          <div
                                            className={cn(
                                              "w-full whitespace-normal break-words px-1 py-0.5 text-base font-semibold leading-tight",
                                              task.status === "done"
                                                ? "text-slate-500 line-through dark:text-slate-400"
                                                : dueTone === "overdue"
                                                  ? "text-rose-700 dark:text-rose-300"
                                                  : dueTone === "warning"
                                                    ? "text-amber-700 dark:text-amber-300"
                                                    : "text-slate-900 dark:text-slate-100"
                                            )}
                                          >
                                            {task.title}
                                          </div>
                                        )}
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <div className="relative" data-list-quick-editor="true">
                                          <button
                                            type="button"
                                            className={cn(
                                              "inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs sm:text-sm font-bold uppercase tracking-[0.07em] leading-none transition duration-100",
                                              canUseHoverInteractions ? "hover:brightness-95" : "",
                                              taskStatusBadgeClasses[computedStatus]
                                            )}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setListQuickEditor((current) =>
                                                current?.taskId === task.id && current.type === "status"
                                                  ? null
                                                  : { taskId: task.id, type: "status" }
                                              );
                                            }}
                                          >
                                            {taskStatusLabel[computedStatus]}
                                          </button>
                                          {isStatusEditorOpen ? (
                                            <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                              {taskStatusOptions.map((option) => (
                                                <button
                                                  key={option.value}
                                                  type="button"
                                                  className={cn(
                                                    "mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition duration-100 last:mb-0",
                                                    option.value === task.status
                                                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/55 dark:text-sky-100"
                                                      : canUseHoverInteractions
                                                        ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                                        : "text-slate-700 dark:text-slate-200"
                                                  )}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    void handleUpdateTask(task.id, { status: option.value });
                                                    setListQuickEditor(null);
                                                  }}
                                                >
                                                  {option.label}
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                        </div>
                                        <div className="relative" data-list-quick-editor="true">
                                          <button
                                            type="button"
                                            className={cn(
                                              "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-xs sm:text-sm font-semibold leading-none transition duration-100",
                                              canUseHoverInteractions ? "hover:brightness-95" : "",
                                              dueTone === "overdue"
                                                ? "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/55 dark:bg-rose-900/50 dark:text-rose-100"
                                                : dueTone === "warning"
                                                  ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/55 dark:bg-amber-900/55 dark:text-amber-100"
                                                  : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                            )}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setListQuickEditor((current) =>
                                                current?.taskId === task.id && current.type === "dueDate"
                                                  ? null
                                                  : { taskId: task.id, type: "dueDate" }
                                              );
                                            }}
                                          >
                                            <CalendarClock size={12} />
                                            {formatTaskDueDate(task.dueDate)}
                                          </button>
                                          {isDueDateEditorOpen ? (
                                            <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                              <div className="mb-2 flex flex-wrap gap-1">
                                                {quickDueDateOptions.map((option) => (
                                                  <button
                                                    key={option.value}
                                                    type="button"
                                                    className="soft-button whitespace-nowrap px-2.5 py-1.5 text-xs font-semibold"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      void handleUpdateTask(task.id, {
                                                        dueDate: getQuickDueDateValue(option.value)
                                                      });
                                                      setListQuickEditor(null);
                                                    }}
                                                  >
                                                    {option.label}
                                                  </button>
                                                ))}
                                              </div>
                                              <button
                                                type="button"
                                                className="soft-button inline-flex w-full items-center justify-center px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void handleUpdateTask(task.id, { dueDate: null });
                                                  setListQuickEditor(null);
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
                                              await handleUpdateTask(taskId, payload);
                                            }}
                                          />
                                        ) : null}
                                        {typeof flowStep === "number" ? (
                                          <span
                                            className="ml-auto inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border px-2 py-1 text-xs sm:text-sm font-bold leading-none"
                                            style={
                                              flowTheme
                                                ? {
                                                    borderColor: flowTheme.edgeStepBorder,
                                                    backgroundColor: flowTheme.edgeStepBg,
                                                    color: flowTheme.edgeStepText
                                                  }
                                                : undefined
                                            }
                                          >
                                            {flowStep}
                                          </span>
                                        ) : null}
                                        {isExpanded ? (
                                          <div className="relative" data-list-quick-editor="true">
                                            <button
                                              type="button"
                                              className={cn(
                                                "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-xs sm:text-sm font-semibold leading-none transition duration-100",
                                                task.ownership === "mine"
                                                  ? canUseHoverInteractions
                                                    ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200/80 dark:border-sky-500/55 dark:bg-sky-900/55 dark:text-sky-100 dark:hover:bg-sky-900"
                                                    : "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/55 dark:bg-sky-900/55 dark:text-sky-100"
                                                  : canUseHoverInteractions
                                                    ? "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                                    : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                              )}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setListQuickEditor((current) =>
                                                  current?.taskId === task.id && current.type === "ownership"
                                                    ? null
                                                    : { taskId: task.id, type: "ownership" }
                                                );
                                              }}
                                            >
                                              {task.ownership === "mine" ? "Моє" : "Делеговано"}
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
                                                        : canUseHoverInteractions
                                                          ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                                          : "text-slate-700 dark:text-slate-200"
                                                    )}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      if (option.value !== task.ownership) {
                                                        void handleUpdateTask(task.id, {
                                                          ownership: option.value
                                                        });
                                                      }
                                                      setListQuickEditor(null);
                                                    }}
                                                  >
                                                    {option.label}
                                                  </button>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {isExpanded ? (
                                          <button
                                            type="button"
                                            className="inline-flex min-h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs sm:text-sm font-semibold leading-none text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              openBlockDrawer(task.blockId);
                                            }}
                                          >
                                            <span
                                              className="inline-flex h-4 w-4 items-center justify-center rounded"
                                              style={{
                                                backgroundColor: `${iconColor}18`,
                                                color: iconColor
                                              }}
                                            >
                                              <BlockIcon size={12} />
                                            </span>
                                            {block.title}
                                          </button>
                                        ) : null}
                                      </div>
                                      {task.checklist.length > 0 ? (
                                        <div className="mt-2 ml-3 space-y-1.5">
                                          {task.checklist.map((item) => (
                                            <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                              <button
                                                type="button"
                                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  const nextChecklist = task.checklist.map((entry) =>
                                                    entry.id === item.id ? { ...entry, done: !entry.done } : entry
                                                  );
                                                  void handleUpdateTask(task.id, { checklist: nextChecklist });
                                                }}
                                              >
                                                {item.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                                              </button>
                                              {isExpanded ? (
                                                <>
                                                  <input
                                                    className={cn(
                                                      "soft-input min-w-0 flex-1 px-2.5 py-2 text-base sm:text-sm",
                                                      item.done ? "line-through text-slate-500" : ""
                                                    )}
                                                    value={listEditingChecklistByItem[`${task.id}:${item.id}`] ?? item.text}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={(event) => {
                                                      const key = `${task.id}:${item.id}`;
                                                      setListEditingChecklistByItem((prev) => ({
                                                        ...prev,
                                                        [key]: event.target.value
                                                      }));
                                                    }}
                                                    onBlur={(event) => {
                                                      const key = `${task.id}:${item.id}`;
                                                      const nextText = event.target.value.trim();
                                                      if (!nextText) {
                                                        setListEditingChecklistByItem((prev) => ({
                                                          ...prev,
                                                          [key]: item.text
                                                        }));
                                                        return;
                                                      }
                                                      if (nextText !== item.text) {
                                                        const nextChecklist = task.checklist.map((entry) =>
                                                          entry.id === item.id ? { ...entry, text: nextText } : entry
                                                        );
                                                        void handleUpdateTask(task.id, { checklist: nextChecklist });
                                                      }
                                                      setListEditingChecklistByItem((prev) => {
                                                        const next = { ...prev };
                                                        delete next[key];
                                                        return next;
                                                      });
                                                    }}
                                                  />
                                                  <button
                                                    type="button"
                                                    className="soft-button inline-flex h-7 w-7 items-center justify-center border-destructive text-destructive"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      const nextChecklist = task.checklist.filter(
                                                        (entry) => entry.id !== item.id
                                                      );
                                                      void handleUpdateTask(task.id, { checklist: nextChecklist });
                                                    }}
                                                  >
                                                    <Trash2 size={12} />
                                                  </button>
                                                </>
                                              ) : (
                                                <span className={cn(item.done ? "line-through text-slate-500" : "")}>
                                                  {item.text}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                      {isExpanded ? (
                                        isChecklistComposerOpen ? (
                                          <div className="mt-2 ml-3 flex gap-2">
                                            <input
                                              className="soft-input w-full px-2.5 py-2 text-base sm:text-sm"
                                              placeholder="Нова підзадача"
                                              value={checklistDraft}
                                              onClick={(event) => event.stopPropagation()}
                                              onChange={(event) => {
                                                setListChecklistDrafts((prev) => ({
                                                  ...prev,
                                                  [task.id]: event.target.value
                                                }));
                                              }}
                                            />
                                            <button
                                              type="button"
                                              className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold sm:text-xs"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                const text = checklistDraft.trim();
                                                if (!text) {
                                                  return;
                                                }
                                                const nextChecklist = [
                                                  ...task.checklist,
                                                  { id: crypto.randomUUID(), text, done: false }
                                                ];
                                                void handleUpdateTask(task.id, { checklist: nextChecklist });
                                                setListChecklistDrafts((prev) => ({ ...prev, [task.id]: "" }));
                                                setListChecklistComposerOpenByTask((prev) => ({
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
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setListChecklistComposerOpenByTask((prev) => ({
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
                                            className={cn(
                                              "mt-2 ml-3 inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sky-700 transition duration-100 sm:text-xs dark:text-sky-300",
                                              canUseHoverInteractions ? "hover:text-sky-800 dark:hover:text-sky-200" : ""
                                            )}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setListChecklistComposerOpenByTask((prev) => ({
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
                                      {computedStatus === "blocked" && dependencyTask ? (
                                        <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] sm:text-xs font-semibold text-amber-900">
                                          <AlertTriangle size={12} />
                                          <span className="truncate">
                                            Блокує: {dependencyBlock?.title ?? "Блок"} / {dependencyTask.title}
                                          </span>
                                        </div>
                                      ) : null}
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
                                                  onClick={(event) => event.stopPropagation()}
                                                  onChange={(event) => {
                                                    const nextTaskId = event.target.value || null;
                                                    void handleUpdateTask(task.id, { dependsOnTaskId: nextTaskId });
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
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    void handleUpdateTask(task.id, { dependsOnTaskId: null });
                                                  }}
                                                >
                                                  Очистити
                                                </button>
                                                <button
                                                  type="button"
                                                  className="soft-button inline-flex items-center justify-center px-2.5 py-1.5 text-sm font-semibold sm:text-xs"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    setListDependencyEditorOpenByTask((prev) => ({
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
                                              className={cn(
                                                "mb-3 inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sky-700 transition duration-100 sm:text-xs dark:text-sky-300",
                                                canUseHoverInteractions ? "hover:text-sky-800 dark:hover:text-sky-200" : ""
                                              )}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setListDependencyEditorOpenByTask((prev) => ({
                                                  ...prev,
                                                  [task.id]: true
                                                }));
                                              }}
                                            >
                                              <Plus size={12} />
                                              {task.dependsOnTaskId ? "Змінити залежність" : "Додати залежність"}
                                            </button>
                                          )}

                                          <div className="flex justify-end">
                                            <button
                                              type="button"
                                              className="soft-button inline-flex items-center gap-1 border-destructive px-2.5 py-1 text-xs font-semibold text-destructive"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                void handleDeleteTask(task.id);
                                              }}
                                            >
                                              <Trash2 size={12} />
                                              Видалити
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </article>
                                {viewMode === "flow" && flowConnectorAfter ? (
                                  <div
                                    className="ml-7 mt-1 h-4 w-px"
                                    style={{
                                      backgroundColor:
                                        flowTheme?.connector ??
                                        (resolvedTheme === "dark"
                                          ? "rgba(139, 92, 246, 0.6)"
                                          : "rgba(167, 139, 250, 0.8)")
                                    }}
                                  />
                                ) : null}
                                </div>
                              );
                            }
                          )}
                          {visibleItems.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-900/60">
                              {sectionCompletedVisible
                                ? "Немає виконаних задач."
                                : "Немає активних задач."}
                            </div>
                          ) : null}
                        </div>
                      </section>
                    );
                    })}
              </div>
            </div>
          </div>
        )}

        {blocks.length === 0 ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
            <div className="surface-panel max-w-md rounded-2xl p-6 text-center">
              <div className="mb-2 font-display text-lg font-semibold tracking-tight">Почнемо з першого блоку</div>
              <p className="mb-4 text-sm text-muted-foreground">
                Додай напрям бізнесу, щоб сформувати візуальну карту задач.
              </p>
              <button
                type="button"
                className="primary-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
                onClick={() => setIsAddBlockOpen(true)}
              >
                <Plus size={14} />
                Додати блок
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {isAddTaskOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          onClick={() => setIsAddTaskOpen(false)}
        >
          <div
            className="surface-panel w-full max-w-md rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <Sparkles size={13} />
                  Нова задача
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Створи задачу зі списку і привʼяжи її до потрібного блоку.
                </div>
              </div>
              <button
                type="button"
                className="soft-button inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setIsAddTaskOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <input
              className="soft-input mb-2 w-full px-3 py-2 text-base"
              placeholder="Назва задачі"
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                void handleCreateTaskFromList();
              }}
            />
            <select
              className="soft-input mb-3 w-full px-3 py-2 text-sm"
              value={newTaskBlockId}
              onChange={(event) => setNewTaskBlockId(event.target.value)}
            >
              <option value="">Оберіть блок</option>
              {blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.title}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="soft-button px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setIsAddTaskOpen(false)}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="primary-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleCreateTaskFromList()}
                disabled={!newTaskTitle.trim() || !newTaskBlockId}
              >
                <Plus size={14} />
                Додати
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddBlockOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          onClick={() => setIsAddBlockOpen(false)}
        >
          <div
            className="surface-panel w-full max-w-md rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <Sparkles size={13} />
                  Новий бізнес-блок
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Блок зʼявиться на канвасі й одразу буде доступний для задач.
                </div>
              </div>
              <button
                type="button"
                className="soft-button inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setIsAddBlockOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <input
              className="soft-input mb-2 w-full px-3 py-2 text-base"
              placeholder="Назва блоку"
              value={newBlockTitle}
              onChange={(event) => setNewBlockTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                void handleAddBlock();
              }}
            />
            <div className="mb-3">
              <select
                className="soft-input w-full px-3 py-2 text-sm"
                value={newBlockType}
                onChange={(event) => {
                  const nextType = event.target.value as BlockType;
                  setNewBlockType(nextType);
                  setNewBlockIconName(getDefaultIconNameForBlockType(nextType));
                }}
              >
                {blockTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Іконка блоку
              </div>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {blockIconOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = option.value === newBlockIconName;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 transition duration-100",
                        isActive
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50"
                      )}
                      onClick={() => setNewBlockIconName(option.value)}
                      title={option.label}
                      aria-label={option.label}
                    >
                      <Icon size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-3 inline-flex items-start gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
              <Link2 className="mt-0.5" size={12} />
              Після створення відкрий блок і додай задачі в окремому попапі.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="soft-button px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setIsAddBlockOpen(false)}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="primary-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold"
                onClick={() => void handleAddBlock()}
              >
                <Plus size={14} />
                Додати блок
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEdgeManagerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          onClick={() => setIsEdgeManagerOpen(false)}
        >
          <div
            className="surface-panel w-full max-w-2xl rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold tracking-tight">Керування залежностями</div>
                <div className="text-xs text-muted-foreground">
                  Формат: A → B означає, що A залежить від B.
                </div>
              </div>
              <button
                type="button"
                className="soft-button inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setIsEdgeManagerOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center">
              <select
                className="soft-input px-3 py-2 text-sm"
                value={edgeSourceId}
                onChange={(event) => setEdgeSourceId(event.target.value)}
              >
                <option value="">Блок A (залежний)</option>
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.title}
                  </option>
                ))}
              </select>
              <div className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                залежить від
              </div>
              <select
                className="soft-input px-3 py-2 text-sm"
                value={edgeTargetId}
                onChange={(event) => setEdgeTargetId(event.target.value)}
              >
                <option value="">Блок B (блокує)</option>
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primary-button px-3 py-2 text-sm font-semibold"
                onClick={() => void handleCreateEdge()}
              >
                Додати
              </button>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {edges.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/75 p-4 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/55">
                  Поки що немає залежностей.
                </div>
              ) : null}
              {edges.map((edge) => (
                <div
                  key={edge.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {formatEdgeName(edge, blocksById)}
                  </div>
                  <button
                    type="button"
                    className="soft-button inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
                    onClick={() => void handleDeleteEdge(edge.id)}
                  >
                    <Unlink size={12} />
                    Видалити
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isBlockListOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          onClick={() => setIsBlockListOpen(false)}
        >
          <div
            className="surface-panel w-full max-w-xl rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold tracking-tight">Список блоків</div>
                <div className="text-xs text-muted-foreground">
                  Обери блок, щоб відкрити задачі у попапі.
                </div>
              </div>
              <button
                type="button"
                className="soft-button inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setIsBlockListOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {blocks.map((block) => {
                const resolvedIconName = resolveBlockIconName(block);
                const iconOption = getBlockIconOption(resolvedIconName);
                const BlockIcon = iconOption.icon;
                const iconColor = block.color ?? "#4B5563";

                return (
                  <button
                    key={block.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50/60"
                    onClick={() => {
                      openBlockDrawer(block.id);
                      setIsBlockListOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border"
                        style={{
                          backgroundColor: `${iconColor}18`,
                          borderColor: `${iconColor}38`,
                          color: iconColor
                        }}
                      >
                        <BlockIcon size={14} />
                      </span>
                      <span className="text-base font-semibold text-slate-800">{block.title}</span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {openTaskCountByBlock[block.id] ?? 0} задач
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {selectedBlock ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/45 p-0 backdrop-blur-[1px] md:items-center md:p-4"
          onClick={closeBlockDrawer}
        >
          <div
            className="h-[100dvh] w-full md:h-[94vh] md:min-h-[60vh] md:w-[50vw] md:max-w-[1100px]"
            onClick={(event) => event.stopPropagation()}
          >
            <TaskDrawer
              block={selectedBlock}
              blocks={blocks}
              tasks={selectedBlockTasks}
              allTasks={tasks}
              taskFlowStepById={taskFlowStepById}
              autoStartCreateToken={taskDrawerCreateToken}
              autoStartCreateBlockId={taskDrawerCreateBlockId}
              dependencyBlockedTaskIds={dependencyBlockedTaskIds}
              onClose={closeBlockDrawer}
              onRenameBlock={handleRenameBlock}
              onUpdateBlockIcon={handleUpdateBlockIcon}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onMoveTask={handleMoveTask}
              onArchiveBlock={handleArchiveBlock}
              className="h-full min-h-0 rounded-none md:min-h-[60vh] md:rounded-2xl"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
