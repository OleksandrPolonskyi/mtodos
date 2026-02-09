"use client";

import { useEffect } from "react";

export function PwaRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const reloadKey = "moddyland-sw-reset-v1";

    const disableLegacySw = async (): Promise<void> => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let unregisteredAny = false;

      for (const registration of registrations) {
        const wasUnregistered = await registration.unregister();
        if (wasUnregistered) {
          unregisteredAny = true;
        }
      }

      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys
            .filter((key) => key.startsWith("moddyland-canvas-"))
            .map((key) => caches.delete(key))
        );
      }

      if (
        unregisteredAny &&
        navigator.serviceWorker.controller &&
        !sessionStorage.getItem(reloadKey)
      ) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      }
    };

    void disableLegacySw();
  }, []);

  return null;
}
