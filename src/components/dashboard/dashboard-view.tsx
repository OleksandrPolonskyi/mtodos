"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  KanbanSquare,
  Loader2,
  ShieldAlert,
  Target
} from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type {
  BlocksResponse,
  BusinessBlock,
  DashboardWeeklyResponse,
  TaskItem,
  TaskStatus,
  TasksResponse
} from "@/types/domain";

interface DashboardViewProps {
  workspace: string;
}

interface DashboardDataset {
  weekly: DashboardWeeklyResponse;
  tasks: TaskItem[];
  blocks: BusinessBlock[];
}

interface BlockRisk {
  blockId: string;
  blockTitle: string;
  overdue: number;
  blocked: number;
  dueSoon: number;
  open: number;
  score: number;
}

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Невідома помилка";
};

const toDateKeyInZone = (date: Date, timezone: string): string => {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

const toDateKeyFromIso = (isoValue: string | null, timezone: string): string | null => {
  if (!isoValue) {
    return null;
  }

  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toDateKeyInZone(parsed, timezone);
};

const shiftDateKey = (key: string, days: number): string => {
  const parsed = new Date(`${key}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const formatHours = (seconds: number): string => {
  const hours = seconds / 3600;
  if (hours < 1) {
    return `${Math.round(seconds / 60)} хв`;
  }
  return `${hours.toFixed(1)} год`;
};

const formatPercent = (value: number): string => `${Math.round(value)}%`;

const isOpenStatus = (status: TaskStatus): boolean => {
  return status === "todo" || status === "in_progress" || status === "blocked";
};

export function DashboardView({ workspace }: DashboardViewProps): React.ReactElement {
  const [data, setData] = useState<DashboardDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const [weekly, tasksResponse, blocksResponse] = await Promise.all([
          apiGet<DashboardWeeklyResponse>("/api/dashboard/weekly"),
          apiGet<TasksResponse>("/api/tasks"),
          apiGet<BlocksResponse>("/api/blocks")
        ]);

        setData({
          weekly,
          tasks: tasksResponse.tasks,
          blocks: blocksResponse.blocks
        });
      } catch (loadError) {
        setError(extractErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const analytics = useMemo(() => {
    if (!data) {
      return null;
    }

    const { weekly, tasks, blocks } = data;
    const timezone = weekly.timezone;
    const todayKey = toDateKeyInZone(new Date(), timezone);
    const weekStartKey = weekly.weekStart;
    const weekEndKey = weekly.weekEnd;
    const next7EndKey = shiftDateKey(todayKey, 6);

    let doneToday = 0;
    let doneWeek = 0;
    let focusWeek = 0;

    let weeklyPlanned = 0;
    let weeklyPlannedDone = 0;

    let overdueCount = 0;
    let blockedCount = 0;
    let dueSoonCount = 0;
    let openTotal = 0;

    const blockRisksMap = new Map<string, BlockRisk>(
      blocks.map((block) => [
        block.id,
        {
          blockId: block.id,
          blockTitle: block.title,
          overdue: 0,
          blocked: 0,
          dueSoon: 0,
          open: 0,
          score: 0
        }
      ])
    );

    for (const task of tasks) {
      const completedKey = toDateKeyFromIso(task.completedAt, timezone);
      const isOpen = isOpenStatus(task.status);
      const dueDate = task.dueDate;
      const inWeeklyPlan = dueDate !== null && dueDate >= weekStartKey && dueDate <= weekEndKey;

      if (task.status === "done" && completedKey === todayKey) {
        doneToday += 1;
      }

      if (
        task.status === "done" &&
        completedKey !== null &&
        completedKey >= weekStartKey &&
        completedKey <= weekEndKey
      ) {
        doneWeek += 1;
        focusWeek += Math.max(0, task.pomodoroSeconds);
      }

      if (inWeeklyPlan) {
        weeklyPlanned += 1;
        if (task.status === "done") {
          weeklyPlannedDone += 1;
        }
      }

      if (!isOpen) {
        continue;
      }

      openTotal += 1;
      const blockRisk = blockRisksMap.get(task.blockId);
      if (blockRisk) {
        blockRisk.open += 1;
      }

      if (dueDate !== null && dueDate < todayKey) {
        overdueCount += 1;
        if (blockRisk) {
          blockRisk.overdue += 1;
        }
      }

      if (task.status === "blocked") {
        blockedCount += 1;
        if (blockRisk) {
          blockRisk.blocked += 1;
        }
      }

      if (dueDate !== null && dueDate >= todayKey && dueDate <= next7EndKey) {
        dueSoonCount += 1;
        if (blockRisk) {
          blockRisk.dueSoon += 1;
        }
      }
    }

    const bottlenecks = Array.from(blockRisksMap.values())
      .map((risk) => {
        const score = risk.overdue * 4 + risk.blocked * 3 + risk.dueSoon * 2 + Math.min(risk.open, 4);
        return {
          ...risk,
          score
        };
      })
      .filter((risk) => risk.score > 0)
      .sort((left, right) => right.score - left.score || right.overdue - left.overdue || right.blocked - left.blocked)
      .slice(0, 3);

    const weeklyPlanRate = weeklyPlanned > 0 ? (weeklyPlannedDone / weeklyPlanned) * 100 : 0;
    const weeklyPlanLeft = Math.max(0, weeklyPlanned - weeklyPlannedDone);

    const actions: string[] = [];
    if (overdueCount > 0) {
      actions.push(`Закрити або перепланувати ${overdueCount} прострочених задач до кінця дня.`);
    }
    if (blockedCount > 0) {
      actions.push(`Розблокувати ${blockedCount} задач(і): призначити власника і дедлайн рішення сьогодні.`);
    }
    if (dueSoonCount > 0) {
      actions.push(`Підтвердити пріоритет для ${dueSoonCount} задач з дедлайном на 7 днів.`);
    }
    if (weeklyPlanned > 0 && weeklyPlanRate < 60) {
      actions.push(`Темп плану ${formatPercent(weeklyPlanRate)}: скоротити scope або делегувати частину робіт.`);
    }
    if (actions.length === 0) {
      actions.push("Критичних ризиків не виявлено. Фокус: виконання пріоритетів тижня.");
    }

    return {
      weekly,
      doneToday,
      doneWeek,
      focusWeek,
      weeklyPlanned,
      weeklyPlannedDone,
      weeklyPlanRate,
      weeklyPlanLeft,
      overdueCount,
      blockedCount,
      dueSoonCount,
      openTotal,
      bottlenecks,
      actions: actions.slice(0, 3)
    };
  }, [data]);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="surface-panel lift-enter mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-4 md:px-5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Dashboard керування бізнесом
          </h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock size={14} />
            Два блоки для рішень: результат і ризики
          </p>
        </div>
        <a
          href={`/${workspace}`}
          className="soft-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          <KanbanSquare size={15} />
          До канвасу
        </a>
      </header>

      {loading ? (
        <div className="surface-panel inline-flex items-center gap-2 rounded-xl p-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Loader2 size={16} className="animate-spin" />
          Завантаження dashboard...
        </div>
      ) : null}

      {error ? (
        <div className="surface-panel inline-flex items-start gap-2 rounded-xl border-destructive bg-red-50 p-5 text-sm font-semibold text-destructive">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {analytics ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <article className="surface-panel rounded-2xl p-4 md:p-5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display inline-flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  <Target size={18} className="text-emerald-600 dark:text-emerald-400" />
                  Результат
                </h2>
                <p className="text-xs text-muted-foreground">
                  Тиждень {analytics.weekly.weekStart} - {analytics.weekly.weekEnd} ({analytics.weekly.timezone})
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-900/35 dark:text-emerald-100">
                Задачі тижня: {analytics.weeklyPlannedDone}/{analytics.weeklyPlanned}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Автоматично рахується по задачах із дедлайном у межах поточного тижня.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Виконано сьогодні</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{analytics.doneToday}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Виконано тиждень</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{analytics.doneWeek}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Фокус за тиждень</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100">
                  <Clock3 size={15} />
                  {formatHours(analytics.focusWeek)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Темп плану</div>
                <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {analytics.weeklyPlanned > 0 ? formatPercent(analytics.weeklyPlanRate) : "—"}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
              {analytics.weeklyPlanned === 0 ? (
                <span>
                  На цей тиждень ще немає задач із дедлайном. Додай дедлайни в межах тижня, щоб бачити темп.
                </span>
              ) : analytics.weeklyPlanLeft > 0 ? (
                <span>
                  До завершення плану тижня лишилось <span className="font-semibold">{analytics.weeklyPlanLeft}</span> задач.
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={14} />
                  Усі задачі цього тижня виконані.
                </span>
              )}
            </div>
          </article>

          <article className="surface-panel rounded-2xl p-4 md:p-5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display inline-flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400" />
                  Ризики
                </h2>
                <p className="text-xs text-muted-foreground">Що може зірвати виконання найближчими днями</p>
              </div>
              <div className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Відкритий хвіст: {analytics.openTotal}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center dark:border-red-500/40 dark:bg-red-900/30">
                <div className="text-[11px] uppercase tracking-[0.08em] text-red-700 dark:text-red-200">Прострочені</div>
                <div className="mt-0.5 text-xl font-semibold text-red-800 dark:text-red-100">{analytics.overdueCount}</div>
              </div>
              <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-center dark:border-slate-500/60 dark:bg-slate-800">
                <div className="text-[11px] uppercase tracking-[0.08em] text-slate-700 dark:text-slate-200">Заблоковані</div>
                <div className="mt-0.5 text-xl font-semibold text-slate-800 dark:text-slate-100">{analytics.blockedCount}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center dark:border-amber-500/40 dark:bg-amber-900/30">
                <div className="text-[11px] uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200">Дедлайни 7 днів</div>
                <div className="mt-0.5 text-xl font-semibold text-amber-800 dark:text-amber-100">{analytics.dueSoonCount}</div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Топ вузькі місця</h3>
              {analytics.bottlenecks.length > 0 ? (
                analytics.bottlenecks.map((block) => (
                  <div
                    key={block.blockId}
                    className="grid grid-cols-[minmax(120px,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/70"
                  >
                    <div className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">{block.blockTitle}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      простр: {block.overdue} · блок: {block.blocked} · 7д: {block.dueSoon}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-900/30 dark:text-emerald-100">
                  Критичних вузьких місць по блоках немає.
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Що робити сьогодні</h3>
              <div className="space-y-1.5">
                {analytics.actions.map((action, index) => (
                  <div
                    key={action}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                  >
                    <span className="mr-2 font-semibold text-slate-900 dark:text-slate-100">{index + 1}.</span>
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
