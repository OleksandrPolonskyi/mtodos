"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  KanbanSquare,
  Loader2
} from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { DashboardWeeklyResponse } from "@/types/domain";

interface DashboardViewProps {
  workspace: string;
}

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Невідома помилка";
};

export function DashboardView({ workspace }: DashboardViewProps): React.ReactElement {
  const [data, setData] = useState<DashboardWeeklyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiGet<DashboardWeeklyResponse>("/api/dashboard/weekly");
        setData(response);
      } catch (loadError) {
        setError(extractErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const blocksByLoad = data
    ? [...data.blocks].sort((a, b) => b.total - a.total || b.inProgress - a.inProgress)
    : [];
  const maxTotal = Math.max(1, ...blocksByLoad.map((block) => block.total));

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="surface-panel lift-enter mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-4 md:px-5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Тижневий Dashboard
          </h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock size={14} />
            Контроль прогресу блоків та операційного навантаження
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

      {data ? (
        <>
          <section className="surface-panel rounded-2xl p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Один графік: стан задач по блоках</h2>
              <div className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                {data.weekStart} - {data.weekEnd} ({data.timezone})
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
                До виконання
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                В роботі
              </span>
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-slate-700">
                Заблоковано
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
                Завершено
              </span>
            </div>

            <div className="space-y-2.5">
              {blocksByLoad.map((block) => {
                const loadWidth = block.total > 0 ? Math.max(8, (block.total / maxTotal) * 100) : 8;

                return (
                  <div key={block.blockId} className="grid grid-cols-[minmax(130px,180px)_1fr_auto] items-center gap-2">
                    <div className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{block.blockTitle}</div>
                    <div className="h-4 rounded-full border border-slate-200 bg-slate-100/80 p-[1px] dark:border-slate-700 dark:bg-slate-800/80">
                      {block.total > 0 ? (
                        <div
                          className="flex h-full overflow-hidden rounded-full bg-white dark:bg-slate-900"
                          style={{ width: `${loadWidth}%` }}
                        >
                          {block.todo > 0 ? (
                            <span
                              className="h-full bg-sky-500"
                              style={{ width: `${(block.todo / block.total) * 100}%` }}
                              title={`До виконання: ${block.todo}`}
                            />
                          ) : null}
                          {block.inProgress > 0 ? (
                            <span
                              className="relative h-full overflow-hidden bg-emerald-500"
                              style={{ width: `${(block.inProgress / block.total) * 100}%` }}
                              title={`В роботі: ${block.inProgress}`}
                            >
                              <span className="progress-wave absolute inset-y-0 -left-1/2 w-1/2" aria-hidden />
                            </span>
                          ) : null}
                          {block.blocked > 0 ? (
                            <span
                              className="h-full bg-slate-500"
                              style={{ width: `${(block.blocked / block.total) * 100}%` }}
                              title={`Заблоковано: ${block.blocked}`}
                            />
                          ) : null}
                          {block.done > 0 ? (
                            <span
                              className="h-full bg-violet-500"
                              style={{ width: `${(block.done / block.total) * 100}%` }}
                              title={`Завершено: ${block.done}`}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className="h-full w-[8%] rounded-full border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900" />
                      )}
                    </div>
                    <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {block.done}/{block.total}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
