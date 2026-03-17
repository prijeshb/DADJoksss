"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { DadJoke } from "@/lib/types";
import { getShuffledJokes } from "@/data/jokes";
import { useSessionStore } from "@/lib/store";
import JokeCard from "./JokeCard";

interface Props {
  initialJokeId?: string;
}

export default function SwipeStack({ initialJokeId }: Props) {
  const languageFilterStored = useSessionStore((s) => s.languageFilter);
  // Defer localStorage-backed value until after hydration so server/client match
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const languageFilter = mounted ? languageFilterStored : "mix";

  const [currentIndex, setCurrentIndex] = useState(0);
  // Constant seed on initial render so server and client produce identical HTML;
  // updated to Date.now() only inside effects/callbacks (client-only).
  const [seed, setSeed] = useState(0);
  const historyRef = useRef<number[]>([]);

  // Get shuffled jokes based on language filter
  const jokeStack = useMemo(() => {
    return getShuffledJokes(languageFilter, [], seed);
  }, [languageFilter, seed]);

  // If an initial joke ID was requested, surface it first
  useEffect(() => {
    if (!initialJokeId) return;
    const idx = jokeStack.findIndex((j) => j.id === initialJokeId);
    if (idx !== -1) setCurrentIndex(idx);
  }, [initialJokeId, jokeStack]);

  // Reset index when language changes
  useEffect(() => {
    setCurrentIndex(0);
    setSeed(Date.now());
    historyRef.current = [];
  }, [languageFilter]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      historyRef.current = [...historyRef.current.slice(-29), prev];
      const next = prev + 1;
      if (next >= jokeStack.length) {
        setSeed(Date.now());
        return 0;
      }
      return next;
    });
  }, [jokeStack.length]);

  const goPrev = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const lastIdx = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setCurrentIndex(lastIdx);
  }, []);

  // Show 2 cards stacked
  const visibleJokes = useMemo(() => {
    const result: DadJoke[] = [];
    for (let i = 0; i < Math.min(2, jokeStack.length); i++) {
      const idx = (currentIndex + i) % jokeStack.length;
      result.push(jokeStack[idx]);
    }
    return result;
  }, [currentIndex, jokeStack]);

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

      {/* Counter */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-0">
        <span className="text-xs text-white/20">
          {currentIndex + 1} / {jokeStack.length}
        </span>
      </div>
    </div>
  );
}
