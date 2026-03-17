"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SwipeStack from "@/components/SwipeStack";
import LanguageFilter from "@/components/LanguageFilter";
import Link from "next/link";

export default function Home() {
  const [key, setKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

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
          <SwipeStack key={key} />
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-3 pb-2 relative">
        <div className="max-w-md mx-auto">
          <div className="bg-surface/30 border border-white/5 rounded-xl px-3 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">📅</span>
              <span className="text-[10px] text-white/40">Today&apos;s Pick</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="text-white/30 hover:text-white/60 transition-colors px-1 py-0.5 text-sm leading-none"
                aria-label="More options"
              >
                ···
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full right-0 mb-2 z-50 bg-surface border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[140px]"
                    >
                      <Link
                        href="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                        Dashboard
                      </Link>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
