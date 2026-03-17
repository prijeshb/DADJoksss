"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import SwipeStack from "@/components/SwipeStack";
import LanguageFilter from "@/components/LanguageFilter";

interface Props {
  initialJokeId?: string;
}

export default function HomeClient({ initialJokeId }: Props) {
  const [key, setKey] = useState(0);

  return (
    <main className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-3 pt-3 pb-1">
        <div className="flex items-center justify-between gap-2">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <h1 className="text-base font-black gradient-text leading-tight">DADjoksss</h1>
          </motion.div>

          <div className="flex items-center gap-1.5">
            <LanguageFilter onChange={() => setKey((k) => k + 1)} />
          </div>
        </div>
      </header>

      {/* Card Stack */}
      <div className="flex-1 px-3 pb-2 pt-1 min-h-0">
        <div className="relative w-full h-full max-w-md mx-auto">
          <SwipeStack key={key} initialJokeId={initialJokeId} />
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-3 pb-2">
        <div className="max-w-md mx-auto">
          <div className="bg-surface/30 border border-white/5 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
            <span className="text-xs">📅</span>
            <span className="text-[10px] text-white/40">Today&apos;s Pick</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
