"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useABTestStore } from "@/lib/store";
import { getJokeById } from "@/data/jokes";
import type { DadJoke } from "@/lib/types";
import JokeCard from "@/components/JokeCard";

function TestFeedStack({ jokes, testId, variantId }: { jokes: DadJoke[]; testId: string; variantId: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const historyRef = useRef<number[]>([]);
  const { trackVariantImpression } = useABTestStore();

  const goNext = useCallback(() => {
    trackVariantImpression(testId, variantId);
    setCurrentIndex((prev) => {
      historyRef.current = [...historyRef.current.slice(-29), prev];
      const next = prev + 1;
      return next >= jokes.length ? 0 : next;
    });
  }, [jokes.length, testId, variantId, trackVariantImpression]);

  const goPrev = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const lastIdx = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setCurrentIndex(lastIdx);
  }, []);

  const visibleJokes = useMemo(() => {
    const result: DadJoke[] = [];
    for (let i = 0; i < Math.min(2, jokes.length); i++) {
      result.push(jokes[(currentIndex + i) % jokes.length]);
    }
    return result;
  }, [currentIndex, jokes]);

  if (jokes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm text-center px-6">
        No jokes in this variant yet. Add some from the dashboard.
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
        <span className="text-xs text-white/20">{currentIndex + 1} / {jokes.length}</span>
      </div>
    </div>
  );
}

export default function TestFeedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const testId = params.testId as string;
  const variantId = searchParams.get("v") ?? "v1";

  const { tests } = useABTestStore();
  const test = tests.find((t) => t.id === testId);
  const variant = test?.variants.find((v) => v.id === variantId);

  const jokes = useMemo(() => {
    if (!variant) return [];
    return variant.jokeIds.map((id) => getJokeById(id)).filter(Boolean) as DadJoke[];
  }, [variant]);

  if (!test || !variant) {
    return (
      <main className="h-dvh flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <p className="text-white/50 text-sm">Feed test not found.</p>
        <p className="text-white/30 text-xs">This link was generated on a different device or the test was deleted.</p>
        <Link href="/" className="text-primary text-sm underline underline-offset-2">← Back to jokes</Link>
      </main>
    );
  }

  return (
    <main className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Banner */}
      <header className="flex-shrink-0 px-3 pt-3 pb-1">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
              🧪 A/B Test
            </span>
            <span className="text-xs text-white/50 truncate max-w-[160px]">{test.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
              {variant.name}
            </span>
            <Link href="/" className="text-white/30 hover:text-white/60 transition-colors text-xs">✕</Link>
          </div>
        </motion.div>
      </header>

      {/* Card Stack */}
      <div className="flex-1 px-3 pb-2 pt-1 min-h-0">
        <div className="relative w-full h-full max-w-md mx-auto">
          <TestFeedStack jokes={jokes} testId={testId} variantId={variantId} />
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-3 pb-3">
        <div className="max-w-md mx-auto">
          <p className="text-center text-white/20 text-[10px]">
            Previewing test feed · <Link href="/dashboard" className="underline underline-offset-2 hover:text-white/40">View dashboard</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
