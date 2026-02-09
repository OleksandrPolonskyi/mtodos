"use client";

import { useEffect } from "react";
import {
  THEME_STORAGE_KEY,
  applyThemeMode,
  getStoredThemeMode
} from "@/lib/theme";

export function ThemeSync(): React.ReactElement | null {
  useEffect(() => {
    const syncTheme = (): void => {
      applyThemeMode(getStoredThemeMode());
    };

    syncTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMedia = (): void => {
      if (getStoredThemeMode() === "system") {
        applyThemeMode("system");
      }
    };
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === THEME_STORAGE_KEY) {
        syncTheme();
      }
    };
    const handleExternalChange = (): void => {
      syncTheme();
    };

    media.addEventListener("change", handleMedia);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("moddyland-theme-change", handleExternalChange);

    return () => {
      media.removeEventListener("change", handleMedia);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("moddyland-theme-change", handleExternalChange);
    };
  }, []);

  return null;
}

