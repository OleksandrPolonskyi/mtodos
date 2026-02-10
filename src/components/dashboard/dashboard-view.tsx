"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Clock3,
  KanbanSquare,
  Loader2
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

const statusLabelMap: Record<TaskStatus, string> = {
  todo: "До виконання",
  in_progress: "В роботі",
  blocked: "Заблоковано",
  done: "Виконано"
};

const statusColorMap: Record<TaskStatus, string> = {
  todo: "#0ea5e9",
  in_progress: "#10b981",
  blocked: "#64748b",
  done: "#8b5cf6"
};

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
    const monthStartKey = `${todayKey.slice(0, 7)}-01`;
    const weekStartKey = weekly.weekStart;
    const weekEndKey = weekly.weekEnd;

    const completedByDate = new Map<string, number>();
    const focusByDate = new Map<string, number>();

    const sumIfInRange = (
      valueKey: string | null,
      start: string,
      end: string,
      value: number
    ): number => {
      if (!valueKey || valueKey < start || valueKey > end) {
        return 0;
      }
      return value;
    };

    let doneToday = 0;
    let doneWeek = 0;
    let doneMonth = 0;
    let focusToday = 0;
    let focusWeek = 0;
    let focusMonth = 0;
    let monthScopeTotal = 0;

    for (const task of tasks) {
      const completedKey = toDateKeyFromIso(task.completedAt, timezone);

      if (completedKey) {
        completedByDate.set(completedKey, (completedByDate.get(completedKey) ?? 0) + 1);
        focusByDate.set(
          completedKey,
          (focusByDate.get(completedKey) ?? 0) + Math.max(0, task.pomodoroSeconds)
        );
      }

      if (task.status === "done" && completedKey === todayKey) {
        doneToday += 1;
      }
      if (task.status === "done" && completedKey && completedKey >= weekStartKey && completedKey <= weekEndKey) {
        doneWeek += 1;
      }
      if (task.status === "done" && completedKey && completedKey >= monthStartKey && completedKey <= todayKey) {
        doneMonth += 1;
      }
      if (task.dueDate && task.dueDate >= monthStartKey && task.dueDate <= todayKey) {
        monthScopeTotal += 1;
      }

      focusToday += sumIfInRange(completedKey, todayKey, todayKey, Math.max(0, task.pomodoroSeconds));
      focusWeek += sumIfInRange(
        completedKey,
        weekStartKey,
        weekEndKey,
        Math.max(0, task.pomodoroSeconds)
      );
      focusMonth += sumIfInRange(
        completedKey,
        monthStartKey,
        todayKey,
        Math.max(0, task.pomodoroSeconds)
      );
    }

    const days30: Array<{ key: string; label: string; done: number; focusSeconds: number }> = [];
    for (let index = 29; index >= 0; index -= 1) {
      const key = shiftDateKey(todayKey, -index);
      days30.push({
        key,
        label: key.slice(5),
        done: completedByDate.get(key) ?? 0,
        focusSeconds: focusByDate.get(key) ?? 0
      });
    }

    const maxDoneInDay = Math.max(1, ...days30.map((item) => item.done));
    const maxFocusInDay = Math.max(1, ...days30.map((item) => item.focusSeconds));

    const upcomingDays: Array<{ key: string; label: string; due: number }> = [];
    for (let index = 0; index < 14; index += 1) {
      const key = shiftDateKey(todayKey, index);
      const due = tasks.filter(
        (task) => isOpenStatus(task.status) && task.dueDate !== null && task.dueDate === key
      ).length;
      upcomingDays.push({
        key,
        label: key.slice(5),
        due
      });
    }

    const maxDueInDay = Math.max(1, ...upcomingDays.map((item) => item.due));

    const statusTotals: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 0
    };
    for (const task of tasks) {
      statusTotals[task.status] += 1;
    }
    const totalTasks = tasks.length;

    const blockById = new Map(blocks.map((block) => [block.id, block]));
    const byBlock = blocks
      .map((block) => ({
        blockId: block.id,
        blockTitle: block.title,
        total: 0,
        done: 0,
        inProgress: 0,
        blocked: 0,
        todo: 0,
        focusSeconds: 0
      }))
      .map((entry) => {
        const blockTasks = tasks.filter((task) => task.blockId === entry.blockId);
        for (const task of blockTasks) {
          entry.total += 1;
          entry.focusSeconds += Math.max(0, task.pomodoroSeconds);
          if (task.status === "done") {
            entry.done += 1;
          } else if (task.status === "in_progress") {
            entry.inProgress += 1;
          } else if (task.status === "blocked") {
            entry.blocked += 1;
          } else {
            entry.todo += 1;
          }
        }
        return entry;
      })
      .filter((entry) => blockById.has(entry.blockId))
      .sort((a, b) => b.focusSeconds - a.focusSeconds || b.done - a.done || b.total - a.total);

    const maxBlockFocus = Math.max(1, ...byBlock.map((item) => item.focusSeconds));

    const doneShare = totalTasks > 0 ? (statusTotals.done / totalTasks) * 100 : 0;
    const completionRateMonth = monthScopeTotal > 0 ? (doneMonth / monthScopeTotal) * 100 : 0;

    return {
      weekly,
      totalTasks,
      doneToday,
      doneWeek,
      doneMonth,
      focusToday,
      focusWeek,
      focusMonth,
      days30,
      maxDoneInDay,
      maxFocusInDay,
      upcomingDays,
      maxDueInDay,
      statusTotals,
      byBlock,
      maxBlockFocus,
      doneShare,
      completionRateMonth
    };
  }, [data]);

  const statusDonutStyle = useMemo(() => {
    if (!analytics || analytics.totalTasks === 0) {
      return {
        background: "conic-gradient(#cbd5e1 0 360deg)"
      } as React.CSSProperties;
    }

    const order: TaskStatus[] = ["done", "in_progress", "todo", "blocked"];
    let cursor = 0;
    const segments: string[] = [];

    for (const status of order) {
      const count = analytics.statusTotals[status];
      if (count <= 0) {
        continue;
      }

      const degrees = (count / analytics.totalTasks) * 360;
      const start = cursor;
      const end = cursor + degrees;
      segments.push(`${statusColorMap[status]} ${start}deg ${end}deg`);
      cursor = end;
    }

    if (segments.length === 0) {
      segments.push("#cbd5e1 0deg 360deg");
    }

    return {
      background: `conic-gradient(${segments.join(", ")})`
    } as React.CSSProperties;
  }, [analytics]);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="surface-panel lift-enter mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-4 md:px-5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Тижневий Dashboard
          </h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock size={14} />
            Візуальна аналітика задач, часу та навантаження
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
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Виконано сьогодні</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{analytics.doneToday}</div>
            </article>
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Виконано тиждень</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{analytics.doneWeek}</div>
            </article>
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Виконано місяць</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{analytics.doneMonth}</div>
            </article>
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Фокус сьогодні</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100">
                <Clock3 size={16} />
                {formatHours(analytics.focusToday)}
              </div>
            </article>
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Фокус тиждень</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100">
                <Clock3 size={16} />
                {formatHours(analytics.focusWeek)}
              </div>
            </article>
            <article className="surface-panel rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Фокус місяць</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xl font-semibold text-slate-900 dark:text-slate-100">
                <Clock3 size={16} />
                {formatHours(analytics.focusMonth)}
              </div>
            </article>
          </section>

          <section className="surface-panel rounded-2xl p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Динаміка: виконання і фокус (останні 30 днів)
                </h2>
                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BarChart3 size={13} />
                {analytics.weekly.timezone}
              </div>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[980px] items-end gap-2">
                {analytics.days30.map((item) => {
                  const doneHeight = Math.max(
                    item.done > 0 ? 8 : 3,
                    (item.done / analytics.maxDoneInDay) * 92
                  );
                  const focusHeight = Math.max(
                    item.focusSeconds > 0 ? 8 : 3,
                    (item.focusSeconds / analytics.maxFocusInDay) * 92
                  );

                  return (
                    <div key={item.key} className="flex w-7 shrink-0 flex-col items-center gap-1">
                      <div className="flex h-24 w-full items-end gap-[3px]">
                        <span
                          className="w-1.5 rounded bg-violet-500/90"
                          style={{ height: `${doneHeight}px` }}
                          title={`${item.key}: виконано ${item.done}`}
                        />
                        <span
                          className="w-1.5 rounded bg-emerald-500/90"
                          style={{ height: `${focusHeight}px` }}
                          title={`${item.key}: фокус ${formatHours(item.focusSeconds)}`}
                        />
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {item.label.slice(3)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-700 dark:border-violet-500/50 dark:bg-violet-900/35 dark:text-violet-100">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                Виконані задачі
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-900/35 dark:text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Фокус-час
              </span>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <article className="surface-panel rounded-2xl p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Навантаження по дедлайнах (14 днів)
                </h3>
                <span className="text-xs text-muted-foreground">лише відкриті задачі</span>
              </div>
              <div className="space-y-2">
                {analytics.upcomingDays.map((item) => {
                  const width = item.due > 0 ? Math.max(6, (item.due / analytics.maxDueInDay) * 100) : 3;
                  return (
                    <div key={item.key} className="grid grid-cols-[56px_1fr_28px] items-center gap-2">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.label}</div>
                      <div className="h-3 rounded-full border border-slate-200 bg-slate-100/80 p-[1px] dark:border-slate-700 dark:bg-slate-800/80">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${width}%` }}
                          title={`Дедлайнів: ${item.due}`}
                        />
                      </div>
                      <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {item.due}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="surface-panel rounded-2xl p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Структура статусів
                </h3>
                <span className="text-xs text-muted-foreground">всі задачі</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative h-28 w-28 shrink-0 rounded-full p-2" style={statusDonutStyle}>
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center dark:bg-slate-900">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Done</div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {formatPercent(analytics.doneShare)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 gap-1.5">
                  {(Object.keys(statusLabelMap) as TaskStatus[]).map((status) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColorMap[status] }} />
                        {statusLabelMap[status]}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {analytics.statusTotals[status]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/80">
                Місячний ритм завершення:{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatPercent(analytics.completionRateMonth)}
                </span>
              </div>
            </article>
          </section>

          <section className="surface-panel rounded-2xl p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Ефективність по блоках
              </h3>
              <span className="text-xs text-muted-foreground">сортування за фокус-часом</span>
            </div>
            <div className="space-y-2.5">
              {analytics.byBlock.map((block) => {
                const focusWidth = block.focusSeconds > 0
                  ? Math.max(6, (block.focusSeconds / analytics.maxBlockFocus) * 100)
                  : 3;
                const doneRate = block.total > 0 ? (block.done / block.total) * 100 : 0;

                return (
                  <div
                    key={block.blockId}
                    className="grid grid-cols-[minmax(130px,1fr)_minmax(160px,1.3fr)_86px_90px] items-center gap-2"
                  >
                    <div className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {block.blockTitle}
                    </div>
                    <div className="h-4 rounded-full border border-slate-200 bg-slate-100/80 p-[1px] dark:border-slate-700 dark:bg-slate-800/80">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${focusWidth}%` }}
                        title={`Фокус: ${formatHours(block.focusSeconds)}`}
                      />
                    </div>
                    <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {formatHours(block.focusSeconds)}
                    </div>
                    <div className="text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {block.done}/{block.total} ({formatPercent(doneRate)})
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
