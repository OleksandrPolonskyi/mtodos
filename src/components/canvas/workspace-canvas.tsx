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
  Recurrence,
  TaskItem,
  TaskStatus
} from "@/types/domain";
import { TaskDrawer } from "@/components/tasks/task-drawer";
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

type WorkspaceViewMode = "canvas" | "list";
type TaskListSortMode = "due_date" | "status" | "custom";
type TaskListScope = "active" | "completed" | "flow";
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
type BlockDueTone = "normal" | "warning" | "overdue";
type TaskDueTone = "normal" | "warning" | "overdue";

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

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const pinchStateRef = useRef<{ distance: number; initialZoom: number } | null>(null);
  const gestureZoomStateRef = useRef<{ initialZoom: number } | null>(null);
  const dragStateRef = useRef<{
    blockId: string;
    startClientX: number;
    startClientY: number;
    startBlockX: number;
    startBlockY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const shouldCenterCanvasRef = useRef(true);

  const [blocks, setBlocks] = useState<BusinessBlock[]>([]);
  const [edges, setEdges] = useState<BlockEdge[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("list");
  const [taskListSortMode, setTaskListSortMode] = useState<TaskListSortMode>("due_date");
  const [taskListScope, setTaskListScope] = useState<TaskListScope>("active");
  const [taskListManualOrder, setTaskListManualOrder] = useState<string[]>([]);
  const [draggingTaskIdInList, setDraggingTaskIdInList] = useState<string | null>(null);
  const [canvasTitle, setCanvasTitle] = useState(DEFAULT_CANVAS_TITLE);
  const [canvasTitleDraft, setCanvasTitleDraft] = useState(DEFAULT_CANVAS_TITLE);
  const [savingCanvasTitle, setSavingCanvasTitle] = useState(false);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraftState | null>(null);
  const [linkPointer, setLinkPointer] = useState<{ x: number; y: number } | null>(null);
  const [edgeAnchorOverrides, setEdgeAnchorOverrides] = useState<Record<string, EdgeAnchorOverride>>({});

  const [loading, setLoading] = useState(true);
  const [, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false);
  const [isBlockListOpen, setIsBlockListOpen] = useState(false);
  const [isEdgeManagerOpen, setIsEdgeManagerOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newBlockType, setNewBlockType] = useState<BlockType>("custom");
  const [newBlockIconName, setNewBlockIconName] = useState(
    getDefaultIconNameForBlockType("custom")
  );
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

        try {
          await apiPost<{ created: number }>("/api/jobs/recurrence");
        } catch {
          // recurrence fallback on open is best-effort
        }

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
        return;
      }

      if (isAddBlockOpen) {
        setIsAddBlockOpen(false);
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
  }, [isAddBlockOpen, isBlockListOpen, isEdgeManagerOpen, isMoreMenuOpen, linkDraft, selectedBlockId]);

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

  const blockDueToneByBlock = useMemo(() => {
    const tones: Record<string, BlockDueTone> = {};
    const today = new Date();
    const todayStr = toLocalDateString(today);
    const warningBorder = new Date(today);
    warningBorder.setDate(today.getDate() + 1);
    const warningBorderStr = toLocalDateString(warningBorder);

    for (const task of tasks) {
      if (!openTaskStatuses.has(task.status) || !task.dueDate) {
        continue;
      }

      const currentTone = tones[task.blockId] ?? "normal";
      if (currentTone === "overdue") {
        continue;
      }

      if (task.dueDate < todayStr) {
        tones[task.blockId] = "overdue";
        continue;
      }

      if (task.dueDate <= warningBorderStr) {
        tones[task.blockId] = "warning";
      }
    }

    return tones;
  }, [tasks]);

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

    for (const chain of uniqueChains) {
      for (let index = 1; index < chain.length; index += 1) {
        const edgeKey = `${chain[index - 1]}::${chain[index]}`;
        const step = index;
        const current = taskEdgeStep.get(edgeKey);
        taskEdgeStep.set(edgeKey, current ? Math.min(current, step) : step);
      }
    }

    return { chains: uniqueChains, taskEdgeStep };
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
          steps
        };
      })
      .filter((flow) => flow.steps.length > 1)
      .sort((left, right) => right.steps.length - left.steps.length);
  }, [blocksById, dependencyBlockedTaskIds, flowInsights.chains, tasks]);

  const sortedTasksForList = useMemo(() => {
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
      .filter((item) => {
        if (!item.block) {
          return false;
        }

        if (taskListScope === "flow") {
          return false;
        }

        if (taskListScope === "active") {
          return item.computedStatus !== "done";
        }

        return item.computedStatus === "done";
      });

    visible.sort((a, b) => {
      if (taskListSortMode === "custom") {
        const aIndex = manualOrderIndex.get(a.task.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = manualOrderIndex.get(b.task.id) ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        return b.task.updatedAt.localeCompare(a.task.updatedAt);
      }

      if (taskListSortMode === "status") {
        const statusDiff = taskStatusOrder[a.computedStatus] - taskStatusOrder[b.computedStatus];
        if (statusDiff !== 0) {
          return statusDiff;
        }

        const dueDiff = toDateTimestamp(a.task.dueDate) - toDateTimestamp(b.task.dueDate);
        if (dueDiff !== 0) {
          return dueDiff;
        }

        return b.task.updatedAt.localeCompare(a.task.updatedAt);
      }

      const dueDiff = toDateTimestamp(a.task.dueDate) - toDateTimestamp(b.task.dueDate);
      if (dueDiff !== 0) {
        return dueDiff;
      }

      const statusDiff = taskStatusOrder[a.computedStatus] - taskStatusOrder[b.computedStatus];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return b.task.updatedAt.localeCompare(a.task.updatedAt);
    });

    return visible;
  }, [blocksById, dependencyBlockedTaskIds, taskListManualOrder, taskListScope, taskListSortMode, tasks]);

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

  const dependencyCount = useMemo(() => {
    const dependsOn: Record<string, number> = {};
    const requiredBy: Record<string, number> = {};

    for (const edge of edges) {
      dependsOn[edge.sourceBlockId] = (dependsOn[edge.sourceBlockId] ?? 0) + 1;
      requiredBy[edge.targetBlockId] = (requiredBy[edge.targetBlockId] ?? 0) + 1;
    }

    return { dependsOn, requiredBy };
  }, [edges]);

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

    return {
      width: Math.max(3600, maxX - minX + BOARD_PADDING * 2),
      height: Math.max(2400, maxY - minY + BOARD_PADDING * 2),
      shiftX: BOARD_PADDING - minX,
      shiftY: BOARD_PADDING - minY
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
      step: null
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

      if (existingPairs.has(pairKey)) {
        continue;
      }

      const existingAuto = autoEdgesByPair.get(pairKey);
      if (existingAuto) {
        autoEdgesByPair.set(pairKey, {
          ...existingAuto,
          step: existingAuto.step ? Math.min(existingAuto.step, edgeStep) : edgeStep
        });
        continue;
      }

      autoEdgesByPair.set(pairKey, {
        id: `task-link:${pairKey}`,
        sourceBlockId,
        targetBlockId,
        kind: "task_dependency",
        step: edgeStep
      });
    }

    return [...manualEdges, ...autoEdgesByPair.values()];
  }, [edges, flowInsights.taskEdgeStep, tasks]);

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

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        blockId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBlockX: block.x,
        startBlockY: block.y,
        lastX: block.x,
        lastY: block.y,
        moved: false
      };

      setDraggingBlockId(blockId);
    },
    [blocksById, linkDraft]
  );

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
      const nextX = Math.round(dragState.startBlockX + dx / scale);
      const nextY = Math.round(dragState.startBlockY + dy / scale);

      dragState.lastX = nextX;
      dragState.lastY = nextY;

      setBlocks((previous) =>
        previous.map((block) => {
          if (block.id !== dragState.blockId) {
            return block;
          }

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
        setSelectedBlockId(dragState.blockId);

        setDraggingBlockId(null);
        dragStateRef.current = null;
        return;
      }

      setBlocks((previous) => {
        const next = previous.map((block) =>
          block.id === dragState.blockId
            ? {
                ...block,
                x: dragState.lastX,
                y: dragState.lastY
              }
            : block
        );

        persistCurrentBlockPositions(next);
        return next;
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
  }, [draggingBlockId, persistCurrentBlockPositions]);

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
      setSelectedBlockId(response.block.id);
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
      setSelectedBlockId(null);
    } catch (archiveError) {
      setError(extractErrorMessage(archiveError));
    }
  }, []);

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

  const handleCreateTask = useCallback(
    async (payload: {
      title: string;
      dueDate: string | null;
      recurrence: Recurrence;
    }): Promise<void> => {
      if (!selectedBlockId) {
        return;
      }

      try {
        const order = tasks.filter((task) => task.blockId === selectedBlockId).length;
        const response = await apiPost<{ task: TaskItem }>("/api/tasks", {
          blockId: selectedBlockId,
          title: payload.title,
          dueDate: payload.dueDate,
          recurrence: payload.recurrence,
          order,
          status: "todo"
        });

        setTasks((previous) => [...previous, response.task]);
      } catch (createError) {
        setError(extractErrorMessage(createError));
      }
    },
    [selectedBlockId, tasks]
  );

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
      if (nextMode === "canvas") {
        shouldCenterCanvasRef.current = true;
      }

      setViewMode(nextMode);
      if (nextMode === "list") {
        setLinkDraft(null);
        setLinkPointer(null);
      }
    },
    []
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

        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-3 md:inset-x-4 md:top-4">
          <div className="pointer-events-auto px-1 py-1">
            <input
              className={cn(
                "font-display w-[min(72vw,520px)] rounded-md border border-transparent bg-transparent px-1 py-1 text-base font-semibold tracking-tight text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white/90 md:text-lg",
                "dark:text-slate-100 dark:focus:border-slate-600 dark:focus:bg-slate-900/80",
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

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
              <button
                type="button"
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition",
                  viewMode === "canvas"
                    ? "bg-slate-900 text-slate-50 dark:bg-sky-500 dark:text-slate-950"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                onClick={() => handleChangeViewMode("canvas")}
              >
                Canvas
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-2 text-sm font-semibold transition",
                  viewMode === "list"
                    ? "bg-slate-900 text-slate-50 dark:bg-sky-500 dark:text-slate-950"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
                onClick={() => handleChangeViewMode("list")}
              >
                Список
              </button>
            </div>
            <button
              type="button"
              className="primary-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold"
              onClick={() => setIsAddBlockOpen(true)}
            >
              <Plus size={15} />
              Новий блок
            </button>
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
                  <div className="px-1 pb-1 pt-0.5">
                    <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
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
                      <span className="inline-flex h-[15px] w-[15px] items-center justify-center text-[11px] font-bold">
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

        {viewMode === "canvas" ? (
          <div className="absolute bottom-3 right-3 z-30 inline-flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => zoomByFactor(1 / 1.12)}
              aria-label="Зменшити масштаб"
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800"
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
              onPointerDown={() => {
                if (!linkDraft) {
                  return;
                }

                setLinkDraft(null);
                setLinkPointer(null);
              }}
              >
                <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full" aria-hidden>
                {edgePaths.map((edge) => (
                  <g key={edge.id}>
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? "#6d28d9"
                            : "#a78bfa"
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
                          ? resolvedTheme === "dark"
                            ? "#c4b5fd"
                            : "#8b5cf6"
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
                      strokeDasharray={edge.kind === "task_dependency" ? "15 30" : edge.blocked ? "14 34" : "16 32"}
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
                          ? resolvedTheme === "dark"
                            ? "#f5f3ff"
                            : "#ede9fe"
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
                      strokeDasharray={edge.kind === "task_dependency" ? "8 36" : edge.blocked ? "8 40" : "8 38"}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={edge.startX}
                      cy={edge.startY}
                      r={1.8}
                      fill={
                        edge.kind === "task_dependency"
                          ? resolvedTheme === "dark"
                            ? "#8b5cf6"
                            : "#a78bfa"
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
                          ? resolvedTheme === "dark"
                            ? "#8b5cf6"
                            : "#a78bfa"
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
                          fill={resolvedTheme === "dark" ? "#4c1d95" : "#6d28d9"}
                          fillOpacity={resolvedTheme === "dark" ? 0.92 : 0.9}
                          stroke={resolvedTheme === "dark" ? "#c4b5fd" : "#ede9fe"}
                          strokeWidth={1}
                        />
                        <text
                          x={edge.midX}
                          y={edge.midY + 0.8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={resolvedTheme === "dark" ? "#f5f3ff" : "#ffffff"}
                          fontSize="8"
                          fontWeight="700"
                        >
                          {edge.step}
                        </text>
                      </g>
                    ) : null}
                  </g>
                ))}
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
                    blockDueToneByBlock[block.id] === "overdue"
                      ? "border-rose-200 bg-rose-100 dark:border-rose-500/55 dark:bg-rose-950"
                      : blockDueToneByBlock[block.id] === "warning"
                        ? "border-amber-200 bg-amber-100 dark:border-amber-500/55 dark:bg-amber-950"
                        : "border-slate-200/85 bg-white dark:border-slate-700/90 dark:bg-slate-900/92",
                    draggingBlockId === block.id
                      ? "z-20 border-sky-300 shadow-[0_24px_42px_rgba(14,165,233,0.24)] dark:border-sky-500 dark:shadow-[0_24px_48px_rgba(56,189,248,0.28)]"
                      : blockDueToneByBlock[block.id] === "overdue"
                        ? "hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100/70 dark:hover:border-rose-400 dark:hover:bg-rose-900/45"
                        : blockDueToneByBlock[block.id] === "warning"
                          ? "hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100/70 dark:hover:border-amber-400 dark:hover:bg-amber-900/40"
                          : "hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/70 dark:hover:border-sky-500 dark:hover:bg-sky-900/30",
                    selectedBlockId === block.id ? "ring-2 ring-sky-300/70 dark:ring-sky-500/70" : "",
                    linkDraft?.sourceBlockId === block.id ? "ring-2 ring-amber-300/80 dark:ring-amber-400/80" : ""
                  )}
                  style={{
                    left,
                    top,
                    touchAction: "none",
                    userSelect: "none"
                  }}
                  onPointerEnter={() => setHoveredBlockId(block.id)}
                  onPointerLeave={() => setHoveredBlockId((current) => (current === block.id ? null : current))}
                  onPointerDown={(event) => startBlockDrag(event, block.id)}
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
                    const dependsOn = dependencyCount.dependsOn[block.id] ?? 0;
                    const requiredBy = dependencyCount.requiredBy[block.id] ?? 0;
                    const showAnchors = hoveredBlockId === block.id || linkDraft !== null;
                    const todoPercent = workflow.totalOpen
                      ? Math.round((workflow.todo / workflow.totalOpen) * 100)
                      : 0;
                    const inProgressPercent = workflow.totalOpen
                      ? Math.round((workflow.inProgress / workflow.totalOpen) * 100)
                      : 0;
                    const blockedPercent = workflow.totalOpen
                      ? Math.round((workflow.blocked / workflow.totalOpen) * 100)
                      : 0;
                    const hasInProgress = workflow.inProgress > 0;
                    const indicatorColor = hasInProgress ? "#22c55e" : "#94a3b8";

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
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-all duration-100 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300",
                                hoveredBlockId === block.id
                                  ? "translate-x-0 opacity-100"
                                  : "pointer-events-none translate-x-1 opacity-0"
                              )}
                            >
                              <Link2 size={11} />
                              {dependsOn} → {requiredBy}
                            </span>
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
                          <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] font-semibold text-amber-900">
                            <AlertTriangle size={12} />
                            Є блокуючі залежності
                          </div>
                        ) : null}

                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-1.5 py-1 dark:border-sky-600/40 dark:bg-sky-900/35">
                            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-sky-700 sm:text-[10px] dark:text-sky-200">
                              <span>До</span>
                              <span>{workflow.todo}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-sky-100/80 dark:bg-sky-800/60">
                              <div
                                className="h-full rounded-full bg-sky-500 transition-all duration-100"
                                style={{ width: `${todoPercent}%` }}
                              />
                            </div>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/75 px-1.5 py-1 dark:border-emerald-600/40 dark:bg-emerald-900/35">
                            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-emerald-700 sm:text-[10px] dark:text-emerald-200">
                              <span>В роботі</span>
                              <span>{workflow.inProgress}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100/80 dark:bg-emerald-800/60">
                              <div
                                className="relative h-full overflow-hidden rounded-full bg-emerald-500 transition-all duration-100"
                                style={{ width: `${inProgressPercent}%` }}
                              >
                                {hasInProgress ? (
                                  <span
                                    className="progress-wave absolute inset-y-0 -left-1/2 w-1/2"
                                    aria-hidden
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800/80">
                            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700 sm:text-[10px] dark:text-slate-200">
                              <span>Блок</span>
                              <span>{workflow.blocked}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/85 dark:bg-slate-700/85">
                              <div
                                className="h-full rounded-full bg-slate-500 transition-all duration-100"
                                style={{ width: `${blockedPercent}%` }}
                              />
                            </div>
                          </div>
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
          <div className="absolute inset-0 z-10 overflow-auto px-4 pb-20 pt-[152px] md:px-6 md:pb-24 md:pt-[114px]">
            <div className="mx-auto max-w-6xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/92">
                <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition",
                      taskListScope === "active"
                        ? "bg-slate-900 text-slate-50 dark:bg-sky-500 dark:text-slate-950"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                    onClick={() => setTaskListScope("active")}
                  >
                    В роботі
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition",
                      taskListScope === "completed"
                        ? "bg-slate-900 text-slate-50 dark:bg-sky-500 dark:text-slate-950"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                    onClick={() => setTaskListScope("completed")}
                  >
                    Виконані
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition",
                      taskListScope === "flow"
                        ? "bg-slate-900 text-slate-50 dark:bg-sky-500 dark:text-slate-950"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                    onClick={() => setTaskListScope("flow")}
                  >
                    Flow
                  </button>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <select
                    className="soft-input min-w-[150px] px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-100"
                    value={taskListSortMode}
                    onChange={(event) => setTaskListSortMode(event.target.value as TaskListSortMode)}
                    aria-label="Сортування списку задач"
                    disabled={taskListScope === "flow"}
                  >
                    <option value="due_date">За датою</option>
                    <option value="status">За статусом</option>
                    <option value="custom">Кастомне (drag)</option>
                  </select>
                </div>
              </div>

              {taskListScope !== "flow" && sortedTasksForList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                  Немає задач за поточним фільтром.
                </div>
              ) : null}
              {taskListScope === "flow" && flowChainsForList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                  Немає потоків. Додай залежності між задачами, щоб побачити Flow.
                </div>
              ) : null}

              <div className="space-y-2.5">
                {taskListScope === "flow"
                  ? flowChainsForList.map((flow, flowIndex) => (
                      <article
                        key={flow.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/90"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Flow {flowIndex + 1}
                          </div>
                          <div className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-500/50 dark:bg-violet-900/45 dark:text-violet-100">
                            {flow.steps.length} кроки
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {flow.steps.map((step, stepIndex) => {
                            const resolvedIconName = resolveBlockIconName(step.block!);
                            const iconOption = getBlockIconOption(resolvedIconName);
                            const BlockIcon = iconOption.icon;
                            const iconColor = step.block?.color ?? "#4B5563";

                            return (
                              <div key={`${flow.id}-${step.task.id}`}>
                                <button
                                  type="button"
                                  className={cn(
                                    "flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition",
                                    step.dueTone === "overdue"
                                      ? "border-rose-200 bg-rose-100 dark:border-rose-500/55 dark:bg-rose-950"
                                      : step.dueTone === "warning"
                                        ? "border-amber-200 bg-amber-100 dark:border-amber-500/55 dark:bg-amber-950"
                                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/92"
                                  )}
                                  onClick={() => setSelectedBlockId(step.task.blockId)}
                                >
                                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-100 text-[11px] font-bold text-violet-700 dark:border-violet-500/60 dark:bg-violet-900/60 dark:text-violet-100">
                                    {stepIndex + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {step.task.title}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.07em]",
                                          taskStatusBadgeClasses[step.computedStatus]
                                        )}
                                      >
                                        {taskStatusLabel[step.computedStatus]}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                                        <span
                                          className="inline-flex h-4 w-4 items-center justify-center rounded"
                                          style={{
                                            backgroundColor: `${iconColor}18`,
                                            color: iconColor
                                          }}
                                        >
                                          <BlockIcon size={10} />
                                        </span>
                                        {step.block?.title}
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold",
                                          step.dueTone === "overdue"
                                            ? "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/55 dark:bg-rose-900/50 dark:text-rose-100"
                                            : step.dueTone === "warning"
                                              ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/55 dark:bg-amber-900/55 dark:text-amber-100"
                                              : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                        )}
                                      >
                                        {formatTaskDueDate(step.task.dueDate)}
                                      </span>
                                    </div>
                                  </div>
                                </button>

                                {stepIndex < flow.steps.length - 1 ? (
                                  <div className="ml-6 mt-1 h-4 w-px bg-violet-300/80 dark:bg-violet-500/60" />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))
                  : sortedTasksForList.map(
                  ({ task, block, computedStatus, dueTone, dependencyTask, dependencyBlock }) => {
                    if (!block) {
                      return null;
                    }

                    const resolvedIconName = resolveBlockIconName(block);
                    const iconOption = getBlockIconOption(resolvedIconName);
                    const BlockIcon = iconOption.icon;
                    const iconColor = block.color ?? "#4B5563";

                    const isDelegated = task.ownership === "delegated";

                    return (
                      <article
                        key={task.id}
                        draggable={taskListSortMode === "custom"}
                        onDragStart={() => {
                          if (taskListSortMode !== "custom") {
                            return;
                          }
                          setDraggingTaskIdInList(task.id);
                        }}
                        onDragEnter={() => {
                          if (taskListSortMode !== "custom" || !draggingTaskIdInList) {
                            return;
                          }
                          moveManualTaskOrder(draggingTaskIdInList, task.id);
                        }}
                        onDragOver={(event) => {
                          if (taskListSortMode !== "custom") {
                            return;
                          }
                          event.preventDefault();
                        }}
                        onDragEnd={() => setDraggingTaskIdInList(null)}
                        onDrop={() => setDraggingTaskIdInList(null)}
                        className={cn(
                          "group w-full rounded-2xl border bg-white px-4 py-3 transition",
                          taskListSortMode === "custom" ? "cursor-grab active:cursor-grabbing" : "",
                          draggingTaskIdInList === task.id ? "opacity-45" : "",
                          isDelegated ? "opacity-55 saturate-60" : "",
                          dueTone === "overdue"
                            ? "border-rose-200 bg-rose-100 hover:border-rose-300 dark:border-rose-500/55 dark:bg-rose-950 dark:hover:border-rose-400"
                            : dueTone === "warning"
                              ? "border-amber-200 bg-amber-100 hover:border-amber-300 dark:border-amber-500/55 dark:bg-amber-950 dark:hover:border-amber-400"
                              : "border-slate-200 hover:border-sky-300 hover:bg-sky-50/60 dark:border-slate-700 dark:bg-slate-900/90 dark:hover:border-sky-500 dark:hover:bg-sky-900/30"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition duration-100 hover:border-sky-300 hover:text-sky-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:text-sky-300"
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
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setSelectedBlockId(task.blockId)}
                          >
                            <div
                              className={cn(
                                "line-clamp-2 text-base font-semibold",
                                task.status === "done"
                                  ? "text-slate-500 line-through dark:text-slate-400"
                                  : "text-slate-900 dark:text-slate-100"
                              )}
                            >
                              {task.title}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.07em]",
                                  taskStatusBadgeClasses[computedStatus]
                                )}
                              >
                                {taskStatusLabel[computedStatus]}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold",
                                  dueTone === "overdue"
                                    ? "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/55 dark:bg-rose-900/50 dark:text-rose-100"
                                    : dueTone === "warning"
                                      ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/55 dark:bg-amber-900/55 dark:text-amber-100"
                                      : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                )}
                              >
                                {formatTaskDueDate(task.dueDate)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                                <span
                                  className="inline-flex h-4 w-4 items-center justify-center rounded"
                                  style={{
                                    backgroundColor: `${iconColor}18`,
                                    color: iconColor
                                  }}
                                >
                                  <BlockIcon size={10} />
                                </span>
                                {block.title}
                              </span>
                            </div>
                            {task.checklist.length > 0 ? (
                              <div className="mt-2 ml-3 space-y-1.5">
                                {task.checklist.map((item) => (
                                  <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                      {item.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                                    </span>
                                    <span className={cn(item.done ? "line-through text-slate-500" : "")}>
                                      {item.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {computedStatus === "blocked" && dependencyTask ? (
                              <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100/85 px-2 py-1 text-[11px] font-semibold text-amber-900">
                                <AlertTriangle size={12} />
                                <span className="truncate">
                                  Блокує: {dependencyBlock?.title ?? "Блок"} / {dependencyTask.title}
                                </span>
                              </div>
                            ) : null}
                          </button>
                        </div>
                      </article>
                    );
                  }
                )}
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
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                          ? "border-sky-300 bg-sky-100 text-sky-700 shadow-sm"
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
            <div className="mb-3 inline-flex items-start gap-1.5 text-[11px] text-muted-foreground">
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
              <div className="text-center text-xs font-semibold text-slate-500">залежить від</div>
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
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/75 p-4 text-sm text-muted-foreground">
                  Поки що немає залежностей.
                </div>
              ) : null}
              {edges.map((edge) => (
                <div
                  key={edge.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2"
                >
                  <div className="text-sm font-semibold text-slate-800">
                    {formatEdgeName(edge, blocksById)}
                  </div>
                  <button
                    type="button"
                    className="soft-button inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700"
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
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/60"
                    onClick={() => {
                      setSelectedBlockId(block.id);
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-2 backdrop-blur-[1px] md:items-center md:p-4"
          onClick={() => setSelectedBlockId(null)}
        >
          <div
            className="h-[94vh] min-h-[60vh] w-full md:w-[50vw] md:max-w-[1100px]"
            onClick={(event) => event.stopPropagation()}
          >
            <TaskDrawer
              block={selectedBlock}
              blocks={blocks}
              tasks={selectedBlockTasks}
              allTasks={tasks}
              dependencyBlockedTaskIds={dependencyBlockedTaskIds}
              onClose={() => setSelectedBlockId(null)}
              onRenameBlock={handleRenameBlock}
              onUpdateBlockIcon={handleUpdateBlockIcon}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onMoveTask={handleMoveTask}
              onArchiveBlock={handleArchiveBlock}
              className="h-full min-h-[60vh]"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
