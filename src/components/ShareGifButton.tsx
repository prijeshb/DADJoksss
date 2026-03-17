"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import type { DadJoke } from "@/lib/types";

type State = "idle" | "generating" | "done" | "error";

interface Props {
  joke: DadJoke;
}

export default function ShareGifButton({ joke }: Props) {
  const [state, setState] = useState<State>("idle");

  // AbortController so generation is cancelled if the component unmounts
  const abortRef = useRef<AbortController | null>(null);
  // Blob URL — must be revoked to avoid memory leaks
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup on unmount: cancel any in-flight generation and revoke blob URL
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (state === "generating") return;

    // Revoke any previous blob URL before generating a new one
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState("generating");

    try {
      // Lazy-import so the GIF encoder is only loaded when actually needed
      const { generateJokeGif } = await import("@/lib/generateJokeGif");
      const blob = await generateJokeGif(joke, controller.signal);

      // Component may have unmounted while awaiting — check abort state
      if (controller.signal.aborted) return;

      const file = new File([blob], `dadjoksss-${joke.id}.gif`, { type: "image/gif" });

      if (navigator.canShare?.({ files: [file] })) {
        // Mobile: native share sheet with the actual GIF file
        await navigator.share({ files: [file] });
      } else {
        // Desktop: trigger a file download — user can then attach it to WhatsApp Web etc.
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          if (blobUrlRef.current === url) blobUrlRef.current = null;
        }, 5_000);
      }

      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // unmounted — don't update state
      console.error("[ShareGifButton] GIF generation failed:", err);
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    } finally {
      abortRef.current = null;
    }
  }, [joke, state]);

  const label = {
    idle: "GIF",
    generating: "…",
    done: "Done!",
    error: "Error",
  }[state];

  const icon = {
    idle: "🎞️",
    generating: "⏳",
    done: "✅",
    error: "⚠️",
  }[state];

  return (
    <motion.button
      onClick={handleClick}
      disabled={state === "generating"}
      whileTap={{ scale: 0.88 }}
      animate={
        state === "done"
          ? { backgroundColor: "rgba(52,211,153,0.15)", borderColor: "rgba(52,211,153,0.35)" }
          : state === "error"
          ? { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.35)" }
          : { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" }
      }
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border font-semibold text-white/70 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-xs">{label}</span>
    </motion.button>
  );
}
