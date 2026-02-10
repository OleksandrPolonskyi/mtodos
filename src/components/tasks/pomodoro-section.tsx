"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskItem } from "@/types/domain";
import { cn } from "@/lib/utils";

interface PomodoroSectionProps {
  task: Pick<TaskItem, "id" | "pomodoroSeconds" | "pomodoroSessions">;
  onPersist: (
    taskId: string,
    payload: Pick<TaskItem, "pomodoroSeconds" | "pomodoroSessions">
  ) => Promise<void>;
  className?: string;
}

interface SavedState {
  seconds: number;
  sessions: number;
}

const toNormalizedSeconds = (value: number | null | undefined): number =>
  Math.max(0, Math.floor(Number(value ?? 0)));

const formatElapsed = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export function PomodoroSection({
  task,
  onPersist,
  className
}: PomodoroSectionProps): React.ReactElement {
  const [running, setRunning] = useState(false);
  const [baseSeconds, setBaseSeconds] = useState<number>(() =>
    toNormalizedSeconds(task.pomodoroSeconds)
  );
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const persistInFlightRef = useRef(false);
  const lastSavedRef = useRef<SavedState>({
    seconds: toNormalizedSeconds(task.pomodoroSeconds),
    sessions: Math.max(0, Math.floor(Number(task.pomodoroSessions ?? 0)))
  });

  const persistPomodoro = useCallback(
    async (secondsInput: number): Promise<void> => {
      const seconds = toNormalizedSeconds(secondsInput);
      const sessions = Math.floor(seconds / 3600);
      const lastSaved = lastSavedRef.current;

      if (lastSaved.seconds === seconds && lastSaved.sessions === sessions) {
        return;
      }

      if (persistInFlightRef.current) {
        return;
      }

      persistInFlightRef.current = true;
      try {
        await onPersist(task.id, {
          pomodoroSeconds: seconds,
          pomodoroSessions: sessions
        });
        lastSavedRef.current = { seconds, sessions };
      } finally {
        persistInFlightRef.current = false;
      }
    },
    [onPersist, task.id]
  );

  useEffect(() => {
    if (running) {
      return;
    }

    const nextSeconds = toNormalizedSeconds(task.pomodoroSeconds);
    setBaseSeconds(nextSeconds);
    lastSavedRef.current = {
      seconds: nextSeconds,
      sessions: Math.max(0, Math.floor(Number(task.pomodoroSessions ?? 0)))
    };
  }, [running, task.pomodoroSeconds, task.pomodoroSessions]);

  useEffect(() => {
    setRunning(false);
    setStartedAtMs(null);
    setNowMs(Date.now());
  }, [task.id]);

  useEffect(() => {
    if (!running) {
      return;
    }

    const tickerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(tickerId);
  }, [running]);

  useEffect(() => {
    if (!running || !startedAtMs) {
      return;
    }

    const persistInterval = window.setInterval(() => {
      const elapsed = baseSeconds + Math.floor((Date.now() - startedAtMs) / 1000);
      void persistPomodoro(elapsed);
    }, 60000);

    return () => window.clearInterval(persistInterval);
  }, [baseSeconds, persistPomodoro, running, startedAtMs]);

  useEffect(() => {
    return () => {
      if (!running || !startedAtMs) {
        return;
      }

      const elapsed = baseSeconds + Math.floor((Date.now() - startedAtMs) / 1000);
      void persistPomodoro(elapsed);
    };
  }, [baseSeconds, persistPomodoro, running, startedAtMs]);

  const elapsedSeconds = useMemo(() => {
    if (!running || !startedAtMs) {
      return baseSeconds;
    }

    return baseSeconds + Math.floor((nowMs - startedAtMs) / 1000);
  }, [baseSeconds, nowMs, running, startedAtMs]);

  const tomatoCount = Math.floor(elapsedSeconds / 3600);
  const visibleTomatoes = Math.min(tomatoCount, 8);
  const hiddenTomatoes = Math.max(0, tomatoCount - visibleTomatoes);

  const handleToggle = useCallback(() => {
    if (!running) {
      const startTs = Date.now();
      setNowMs(startTs);
      setStartedAtMs(startTs);
      setRunning(true);
      return;
    }

    const stopTs = Date.now();
    const finalSeconds = baseSeconds + Math.floor((stopTs - (startedAtMs ?? stopTs)) / 1000);
    setRunning(false);
    setStartedAtMs(null);
    setNowMs(stopTs);
    setBaseSeconds(finalSeconds);
    void persistPomodoro(finalSeconds);
  }, [baseSeconds, persistPomodoro, running, startedAtMs]);

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/85",
        className
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
        Pomodoro
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
            running
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-500/60 dark:bg-emerald-900/50 dark:text-emerald-100 dark:hover:bg-emerald-900/70"
              : "border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:text-sky-200"
          )}
          onClick={handleToggle}
          aria-label={running ? "Пауза Pomodoro" : "Запустити Pomodoro"}
          title={running ? "Пауза" : "Старт"}
        >
          {running ? <Pause size={14} /> : <Play size={14} className="translate-x-[0.5px]" />}
        </button>

        <span className="font-mono text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {formatElapsed(elapsedSeconds)}
        </span>

        <div className="h-5 w-px bg-slate-300/80 dark:bg-slate-600/80" />

        <div className="flex min-h-5 items-center gap-1.5 text-sm">
          {visibleTomatoes === 0 ? (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">0</span>
          ) : (
            <>
              {Array.from({ length: visibleTomatoes }).map((_, index) => (
                <span key={`tomato-${index}`} role="img" aria-label="Помідор">
                  🍅
                </span>
              ))}
              {hiddenTomatoes > 0 ? (
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  +{hiddenTomatoes}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
