const normalizeFlowIndex = (flowColorIndex: number, length: number): number => {
  return ((flowColorIndex % length) + length) % length;
};

export const FLOW_BLOCKED_BADGE_CLASSES = [
  "border border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-500/55 dark:bg-fuchsia-950/45 dark:text-fuchsia-100",
  "border border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-500/55 dark:bg-rose-950/45 dark:text-rose-100",
  "border border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-500/55 dark:bg-teal-950/45 dark:text-teal-100",
  "border border-indigo-300 bg-indigo-100 text-indigo-900 dark:border-indigo-500/55 dark:bg-indigo-950/45 dark:text-indigo-100"
] as const;

export const FLOW_BLOCKED_HINT_CLASSES = [
  "border border-fuchsia-300 bg-fuchsia-100/85 text-fuchsia-900 dark:border-fuchsia-500/50 dark:bg-fuchsia-950/50 dark:text-fuchsia-100",
  "border border-rose-300 bg-rose-100/85 text-rose-900 dark:border-rose-500/50 dark:bg-rose-950/50 dark:text-rose-100",
  "border border-teal-300 bg-teal-100/85 text-teal-900 dark:border-teal-500/50 dark:bg-teal-950/50 dark:text-teal-100",
  "border border-indigo-300 bg-indigo-100/85 text-indigo-900 dark:border-indigo-500/50 dark:bg-indigo-950/50 dark:text-indigo-100"
] as const;

export const FLOW_DEPENDENCY_ACTION_CLASSES = [
  "text-fuchsia-700 hover:text-fuchsia-800 dark:text-fuchsia-300 dark:hover:text-fuchsia-200",
  "text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200",
  "text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200",
  "text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
] as const;

const FLOW_DEPENDENCY_FOCUS_SHADOW_COLORS = [
  "rgba(192, 38, 211, 0.42)",
  "rgba(225, 29, 72, 0.42)",
  "rgba(13, 148, 136, 0.4)",
  "rgba(79, 70, 229, 0.42)"
] as const;

export const pickFlowBlockedBadgeClass = (flowColorIndex: number | undefined): string | null => {
  if (typeof flowColorIndex !== "number") {
    return null;
  }

  return FLOW_BLOCKED_BADGE_CLASSES[
    normalizeFlowIndex(flowColorIndex, FLOW_BLOCKED_BADGE_CLASSES.length)
  ];
};

export const pickFlowBlockedHintClass = (flowColorIndex: number | undefined): string | null => {
  if (typeof flowColorIndex !== "number") {
    return null;
  }

  return FLOW_BLOCKED_HINT_CLASSES[
    normalizeFlowIndex(flowColorIndex, FLOW_BLOCKED_HINT_CLASSES.length)
  ];
};

export const pickFlowDependencyActionClass = (flowColorIndex: number | undefined): string | null => {
  if (typeof flowColorIndex !== "number") {
    return null;
  }

  return FLOW_DEPENDENCY_ACTION_CLASSES[
    normalizeFlowIndex(flowColorIndex, FLOW_DEPENDENCY_ACTION_CLASSES.length)
  ];
};

export const pickFlowDependencyFocusShadow = (
  flowColorIndex: number | undefined
): string | null => {
  if (typeof flowColorIndex !== "number") {
    return null;
  }

  return FLOW_DEPENDENCY_FOCUS_SHADOW_COLORS[
    normalizeFlowIndex(flowColorIndex, FLOW_DEPENDENCY_FOCUS_SHADOW_COLORS.length)
  ];
};
