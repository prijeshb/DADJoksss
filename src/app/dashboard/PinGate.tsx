"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

export default function PinGate() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: input }),
      });
      if (res.ok) {
        // Cookie is now set server-side — refresh so the server component re-evaluates
        router.refresh();
      } else {
        setError(true);
        setInput("");
        setTimeout(() => setError(false), 1200);
      }
    } catch {
      setError(true);
      setInput("");
      setTimeout(() => setError(false), 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs"
      >
        <h1 className="text-center text-white/60 text-sm font-semibold mb-6 uppercase tracking-widest">
          Dashboard Access
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="Enter PIN"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            className={`w-full bg-surface border rounded-xl px-4 py-3 text-center text-white text-lg tracking-[0.4em] outline-none transition-colors ${
              error ? "border-red-500/60" : "border-white/10 focus:border-white/30"
            }`}
          />
          {error && (
            <p className="text-center text-red-400 text-xs">Incorrect PIN</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
        <Link
          href="/"
          className="block text-center text-white/20 text-xs mt-6 hover:text-white/40 transition-colors"
        >
          ← Back to jokes
        </Link>
      </motion.div>
    </main>
  );
}
