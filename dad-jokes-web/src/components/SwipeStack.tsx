"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { DadJoke } from "@/lib/types";
import { useSessionStore } from "@/lib/store";
import JokeCard from "./JokeCard";

interface Props {
  initialJokeId?: string;
}

export default function SwipeStack({ initialJokeId }: Props) {
  const languageFilterStored = useSessionStore((s) => s.languageFilter);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const languageFilter = mounted ? languageFilterStored : "mix";

  const [jokeStack, setJokeStack] = useState<DadJoke[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const historyRef = useRef<number[]>([]);

  // Fetch from DB-backed API whenever language changes
  useEffect(() => {
    let cancelled = false;
    setLoadStatus("loading");
    setCurrentIndex(0);
    historyRef.current = [];

    const params = new URLSearchParams({ shuffle: "true", limit: "100" });
    if (languageFilter !== "mix") params.set("language", languageFilter);

    fetch(`/api/jokes?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) {
          setJokeStack(Array.isArray(body.jokes) ? body.jokes : []);
          setLoadStatus("ok");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });

    return () => { cancelled = true; };
  }, [languageFilter]);

  // Surface the requested joke first after load
  useEffect(() => {
    if (!initialJokeId || jokeStack.length === 0) return;
    const idx = jokeStack.findIndex((j) => j.id === initialJokeId);
    if (idx !== -1) setCurrentIndex(idx);
  }, [initialJokeId, jokeStack]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      historyRef.current = [...historyRef.current.slice(-29), prev];
      const next = prev + 1;
      if (next >= jokeStack.length) {
        // Re-fetch a freshly shuffled batch instead of wrapping to the same order
        const params = new URLSearchParams({ shuffle: "true", limit: "100" });
        if (languageFilter !== "mix") params.set("language", languageFilter);
        fetch(`/api/jokes?${params.toString()}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((body) => {
            if (Array.isArray(body.jokes)) setJokeStack(body.jokes);
          })
          .catch(() => {});
        return 0;
      }
      return next;
    });
  }, [jokeStack.length, languageFilter]);

  const goPrev = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const lastIdx = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setCurrentIndex(lastIdx);
  }, []);

  const visibleJokes = useMemo(() => {
    const result: DadJoke[] = [];
    for (let i = 0; i < Math.min(2, jokeStack.length); i++) {
      result.push(jokeStack[(currentIndex + i) % jokeStack.length]);
    }
    return result;
  }, [currentIndex, jokeStack]);

  if (loadStatus === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-white/40">
        <p className="text-sm animate-pulse">Loading jokes…</p>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="flex items-center justify-center h-full text-white/40 px-6 text-center">
        <p className="text-sm">Could not load jokes. Check your connection and try again.</p>
      </div>
    );
  }

  if (jokeStack.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/40">
        <p>No jokes found for this language. Try &quot;Mix&quot;!</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="popLayout">
        {visibleJokes.map((joke, i) => (
          <JokeCard
            key={`${joke.id}-${currentIndex + i}`}
            joke={joke}
            onSwipeLeft={goNext}
            onSwipeRight={historyRef.current.length > 0 ? goPrev : goNext}
            isTop={i === 0}
            zIndex={10 - i}
          />
        ))}
      </AnimatePresence>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-0">
        <span className="text-xs text-white/20">
          {currentIndex + 1} / {jokeStack.length}
        </span>
      </div>
    </div>
  );
}
