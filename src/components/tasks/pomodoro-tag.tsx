"use client";

import { ChevronDown, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { TaskItem } from "@/types/domain";
import { cn } from "@/lib/utils";

interface PomodoroTagProps {
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

const POMODORO_SESSION_SECONDS = 60 * 60;
const POMODORO_BREAK_SECONDS = 15 * 60;

const formatElapsed = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export function PomodoroTag({ task, onPersist, className }: PomodoroTagProps): React.ReactElement {
  const [running, setRunning] = useState(false);
  const [baseSeconds, setBaseSeconds] = useState<number>(() =>
    toNormalizedSeconds(task.pomodoroSeconds)
  );
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBreakMode, setIsBreakMode] = useState(false);
  const [breakRunning, setBreakRunning] = useState(false);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(POMODORO_BREAK_SECONDS);
  const [isBreakPromptOpen, setIsBreakPromptOpen] = useState(false);
  const [isBreakDonePromptOpen, setIsBreakDonePromptOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const persistInFlightRef = useRef(false);
  const lastCompletedSessionRef = useRef<number>(
    Math.floor(toNormalizedSeconds(task.pomodoroSeconds) / POMODORO_SESSION_SECONDS)
  );
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

  const playGentleChime = useCallback((): void => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const audioWindow = window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      const ctx = new AudioContextCtor();
      const now = ctx.currentTime;
      const sequence = [783.99, 987.77];

      sequence.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.16;
        const end = start + 0.24;

        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end);
      });

      window.setTimeout(() => {
        void ctx.close();
      }, 800);
    } catch {
      // Ignore audio-related errors.
    }
  }, []);

  useEffect(() => {
    if (running) {
      return;
    }

    const nextSeconds = toNormalizedSeconds(task.pomodoroSeconds);
    setBaseSeconds(nextSeconds);
    lastCompletedSessionRef.current = Math.floor(nextSeconds / POMODORO_SESSION_SECONDS);
    lastSavedRef.current = {
      seconds: nextSeconds,
      sessions: Math.max(0, Math.floor(Number(task.pomodoroSessions ?? 0)))
    };
  }, [running, task.pomodoroSeconds, task.pomodoroSessions]);

  useEffect(() => {
    setRunning(false);
    setStartedAtMs(null);
    setNowMs(Date.now());
    setIsHistoryOpen(false);
    setIsBreakMode(false);
    setBreakRunning(false);
    setBreakRemainingSeconds(POMODORO_BREAK_SECONDS);
    setIsBreakPromptOpen(false);
    setIsBreakDonePromptOpen(false);
    lastCompletedSessionRef.current = Math.floor(
      toNormalizedSeconds(task.pomodoroSeconds) / POMODORO_SESSION_SECONDS
    );
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
    if (!isBreakMode || !breakRunning) {
      return;
    }

    const timerId = window.setInterval(() => {
      setBreakRemainingSeconds((current) => {
        if (current <= 1) {
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isBreakMode, breakRunning]);

  useEffect(() => {
    if (!isBreakMode || !breakRunning || breakRemainingSeconds > 0) {
      return;
    }

    setBreakRunning(false);
    setIsBreakMode(false);
    playGentleChime();
    setIsBreakDonePromptOpen(true);
  }, [breakRemainingSeconds, breakRunning, isBreakMode, playGentleChime]);

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

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsHistoryOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isHistoryOpen]);

  const elapsedSeconds = useMemo(() => {
    if (!running || !startedAtMs) {
      return baseSeconds;
    }

    return baseSeconds + Math.floor((nowMs - startedAtMs) / 1000);
  }, [baseSeconds, nowMs, running, startedAtMs]);

  useEffect(() => {
    if (!running || isBreakMode) {
      return;
    }

    const completedSessions = Math.floor(elapsedSeconds / POMODORO_SESSION_SECONDS);
    if (completedSessions <= lastCompletedSessionRef.current) {
      return;
    }

    lastCompletedSessionRef.current = completedSessions;
    setRunning(false);
    setStartedAtMs(null);
    setBaseSeconds(elapsedSeconds);
    setNowMs(Date.now());
    void persistPomodoro(elapsedSeconds);
    playGentleChime();
    setIsBreakPromptOpen(true);
  }, [elapsedSeconds, isBreakMode, persistPomodoro, playGentleChime, running]);

  const tomatoCount = Math.floor(elapsedSeconds / POMODORO_SESSION_SECONDS);
  const visibleTomatoes = Math.min(tomatoCount, 8);
  const hiddenTomatoes = Math.max(0, tomatoCount - visibleTomatoes);

  const handleToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation();
      if (isBreakMode) {
        setBreakRunning((current) => !current);
        return;
      }

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
    },
    [baseSeconds, isBreakMode, persistPomodoro, running, startedAtMs]
  );

  const handleStartBreak = useCallback(() => {
    setIsBreakPromptOpen(false);
    setIsBreakDonePromptOpen(false);
    setIsBreakMode(true);
    setBreakRemainingSeconds(POMODORO_BREAK_SECONDS);
    setBreakRunning(true);
  }, []);

  const handleContinueFocus = useCallback(() => {
    setIsBreakPromptOpen(false);
    const startTs = Date.now();
    setNowMs(startTs);
    setStartedAtMs(startTs);
    setRunning(true);
  }, []);

  const handleResumeAfterBreak = useCallback(() => {
    setIsBreakDonePromptOpen(false);
    const startTs = Date.now();
    setNowMs(startTs);
    setStartedAtMs(startTs);
    setRunning(true);
  }, []);

  const handleResetTimer = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation();
      setRunning(false);
      setStartedAtMs(null);
      setBaseSeconds(0);
      setNowMs(Date.now());
      setIsBreakMode(false);
      setBreakRunning(false);
      setBreakRemainingSeconds(POMODORO_BREAK_SECONDS);
      setIsBreakPromptOpen(false);
      setIsBreakDonePromptOpen(false);
      lastCompletedSessionRef.current = 0;
      void persistPomodoro(0);
    },
    [persistPomodoro]
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border px-1 py-0.5 text-[11px] sm:text-xs",
          isBreakMode
            ? "border-amber-300 bg-amber-100 dark:border-amber-500/60 dark:bg-amber-900/55"
            : "border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full border transition",
            isBreakMode
              ? breakRunning
                ? "border-amber-300 bg-amber-200 text-amber-800 dark:border-amber-500/60 dark:bg-amber-900/80 dark:text-amber-100"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-100"
              : running
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-900/55 dark:text-emerald-100"
              : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          )}
          onClick={handleToggle}
          aria-label={
            isBreakMode
              ? breakRunning
                ? "Пауза перерви"
                : "Продовжити перерву"
              : running
                ? "Пауза Pomodoro"
                : "Старт Pomodoro"
          }
          title={
            isBreakMode
              ? breakRunning
                ? "Пауза перерви"
                : "Продовжити перерву"
              : running
                ? "Пауза"
                : "Старт"
          }
        >
          {isBreakMode ? (
            breakRunning ? (
              <Pause size={11} />
            ) : (
              <Play size={11} className="translate-x-[0.5px]" />
            )
          ) : running ? (
            <Pause size={11} />
          ) : (
            <Play size={11} className="translate-x-[0.5px]" />
          )}
        </button>
        <span
          className={cn(
            "px-1 font-mono font-semibold tabular-nums",
            isBreakMode ? "text-amber-900 dark:text-amber-100" : "text-slate-800 dark:text-slate-100"
          )}
        >
          {formatElapsed(isBreakMode ? breakRemainingSeconds : elapsedSeconds)}
        </span>
        {isBreakMode ? (
          <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-800/60 dark:text-amber-100">
            Перерва
          </span>
        ) : null}
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full transition",
            isBreakMode
              ? "text-amber-700 hover:bg-amber-200/80 dark:text-amber-200 dark:hover:bg-amber-800/70"
              : "text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700/70"
          )}
          onClick={(event) => {
            event.stopPropagation();
            setIsHistoryOpen((current) => !current);
          }}
          aria-label="Показати Pomodoro сесії"
        >
          <ChevronDown size={11} className={cn("transition", isHistoryOpen ? "rotate-180" : "")} />
        </button>
      </div>

      {isHistoryOpen ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[180px] rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">
            Pomodoro
          </div>
          <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Сесій: {tomatoCount}
          </div>
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
          <button
            type="button"
            className="soft-button mt-2 inline-flex w-full items-center justify-center px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-100"
            onClick={handleResetTimer}
          >
            Скинути таймер
          </button>
        </div>
      ) : null}

      {isBreakPromptOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Фокус-сесія завершена 🍅
            </div>
            <div className="mb-3 text-xs text-slate-600 dark:text-slate-300">
              Минуло 60 хв. Рекомендую коротку перерву 15 хвилин.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="soft-button inline-flex flex-1 items-center justify-center border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-500/60 dark:bg-amber-900/60 dark:text-amber-100"
                onClick={handleStartBreak}
              >
                Йду на відпочинок 15 хв
              </button>
              <button
                type="button"
                className="soft-button inline-flex items-center justify-center px-3 py-2 text-xs font-semibold"
                onClick={handleContinueFocus}
              >
                Продовжити
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isBreakDonePromptOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Перерва завершена
            </div>
            <div className="mb-3 text-xs text-slate-600 dark:text-slate-300">
              Час повертатись до фокус-режиму.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="soft-button inline-flex flex-1 items-center justify-center border-sky-300 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-800 dark:border-sky-500/60 dark:bg-sky-900/60 dark:text-sky-100"
                onClick={handleResumeAfterBreak}
              >
                Повернутись до задачі
              </button>
              <button
                type="button"
                className="soft-button inline-flex items-center justify-center px-3 py-2 text-xs font-semibold"
                onClick={() => setIsBreakDonePromptOpen(false)}
              >
                Пізніше
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
