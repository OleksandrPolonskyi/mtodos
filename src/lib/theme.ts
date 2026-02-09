export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "moddyland:theme";
const THEME_CLASS_DARK = "theme-dark";
const THEME_CLASS_LIGHT = "theme-light";

const isThemeMode = (value: string | null): value is ThemeMode => {
  return value === "light" || value === "dark" || value === "system";
};

const getSystemResolvedTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!isThemeMode(stored)) {
    return "system";
  }

  return stored;
};

export const persistThemeMode = (mode: ThemeMode): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
};

export const applyThemeMode = (mode: ThemeMode): void => {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = mode === "system" ? getSystemResolvedTheme() : mode;
  const root = document.documentElement;

  root.classList.remove(THEME_CLASS_DARK, THEME_CLASS_LIGHT, "dark");
  root.classList.add(resolved === "dark" ? THEME_CLASS_DARK : THEME_CLASS_LIGHT);

  if (resolved === "dark") {
    root.classList.add("dark");
  }

  root.style.colorScheme = resolved;
  root.dataset.themeMode = mode;
};

