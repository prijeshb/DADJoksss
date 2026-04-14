"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Capture the current controller before registration so we can detect genuine updates
    const prevController = navigator.serviceWorker.controller;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Check for a new SW version on every page load
        registration.update().catch(() => {});
      })
      .catch(() => {});

    let refreshing = false;
    const onControllerChange = () => {
      // Only reload if a SW was already controlling — this is a genuine update, not first install
      if (prevController && !refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
