"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAnalyticsStore, useSessionStore, useFeedStore } from "@/lib/store";
import { jokes, getJokeById } from "@/data/jokes";
import type { JokeAnalytics } from "@/lib/types";
import ABTestPanel from "@/components/ABTestPanel";

function PinGate({ onAuth }: { onAuth: () => void }) {
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
        sessionStorage.setItem("dash_auth", "1");
        onAuth();
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
        <h1 className="text-center text-white/60 text-sm font-semibold mb-6 uppercase tracking-widest">Dashboard Access</h1>
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
        <Link href="/" className="block text-center text-white/20 text-xs mt-6 hover:text-white/40 transition-colors">
          ← Back to jokes
        </Link>
      </motion.div>
    </main>
  );
}

type Tab = "overview" | "jokes" | "abtests" | "algorithm";

export default function DashboardPage() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // All hooks MUST be called before any early return (React rules of hooks)
  const { jokeStats } = useAnalyticsStore();
  const { jokesViewed } = useSessionStore();
const { weights, updateWeights } = useFeedStore();

  const allStats = useMemo(() => Object.values(jokeStats), [jokeStats]);

  useEffect(() => {
    if (sessionStorage.getItem("dash_auth") === "1") setAuthed(true);
  }, []);

  if (!authed) return <PinGate onAuth={() => setAuthed(true)} />;

  const totalImpressions = allStats.reduce((sum, s) => sum + s.impressions, 0);
  const totalLikes = allStats.reduce((sum, s) => sum + s.likes, 0);
  const totalShares = allStats.reduce((sum, s) => sum + s.shares, 0);
  const avgEngagement = allStats.length > 0
    ? allStats.reduce((sum, s) => sum + s.engagementScore, 0) / allStats.length
    : 0;

  const topLiked = [...allStats].sort((a, b) => b.likes - a.likes).slice(0, 10);
  const topShared = [...allStats].sort((a, b) => b.shares - a.shares).slice(0, 10);
  const topEngaged = [...allStats].sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 10);
  const mostViewed = [...allStats].sort((a, b) => b.impressions - a.impressions).slice(0, 10);

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "overview", label: "Overview", emoji: "📊" },
    { id: "jokes", label: "Jokes", emoji: "😂" },
    { id: "abtests", label: "A/B Tests", emoji: "🧪" },
    { id: "algorithm", label: "Algorithm", emoji: "⚙️" },
  ];

  return (
    <main className="min-h-dvh bg-background text-foreground overflow-auto">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-surface/50 border border-white/5 text-white/50 hover:text-white/80 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Dashboard</h1>
              <p className="text-xs text-white/40">Analytics & Management</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-2">
          <div className="flex gap-1 bg-surface/30 rounded-xl p-1 border border-white/5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === tab.id ? "text-primary" : "text-white/50 hover:text-white/70"
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="dashTab"
                    className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg"
                  />
                )}
                <span className="relative flex items-center justify-center gap-1.5">
                  <span>{tab.emoji}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Jokes" value={jokes.length} emoji="📝" />
                <StatCard label="Impressions" value={totalImpressions} emoji="👁️" />
                <StatCard label="Likes" value={totalLikes} emoji="❤️" />
                <StatCard label="Shares" value={totalShares} emoji="📤" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatCard label="Jokes Viewed" value={jokesViewed.length} emoji="👀" />
                <StatCard label="Avg Engagement" value={`${avgEngagement.toFixed(1)}%`} emoji="📈" />
              </div>

              {/* Top Jokes Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <JokeList title="Top Liked" emoji="❤️" items={topLiked} metric="likes" />
                <JokeList title="Top Shared" emoji="📤" items={topShared} metric="shares" />
                <JokeList title="Most Viewed" emoji="👁️" items={mostViewed} metric="impressions" />
                <JokeList title="Top Engaged" emoji="🏆" items={topEngaged} metric="engagementScore" />
              </div>
            </motion.div>
          )}

          {activeTab === "jokes" && (
            <motion.div
              key="jokes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <JokesTable stats={jokeStats} />
            </motion.div>
          )}

          {activeTab === "abtests" && (
            <motion.div
              key="abtests"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <ABTestPanel jokeStats={jokeStats} />
            </motion.div>
          )}

          {activeTab === "algorithm" && (
            <motion.div
              key="algorithm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <AlgorithmPanel weights={weights} updateWeights={updateWeights} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

// ==================== SUB-COMPONENTS ====================

function StatCard({ label, value, emoji }: { label: string; value: string | number; emoji: string }) {
  return (
    <div className="bg-surface/50 border border-white/5 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{emoji}</span>
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function JokeList({ title, emoji, items, metric }: {
  title: string;
  emoji: string;
  items: JokeAnalytics[];
  metric: keyof JokeAnalytics;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-surface/30 border border-white/5 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span>{emoji}</span> {title}
        </h3>
        <p className="text-xs text-white/30">No data yet. Start swiping!</p>
      </div>
    );
  }

  return (
    <div className="bg-surface/30 border border-white/5 rounded-2xl p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, i) => {
          const joke = getJokeById(item.jokeId);
          if (!joke) return null;
          const val = item[metric];
          return (
            <div key={item.jokeId} className="flex items-center gap-3 text-xs">
              <span className="text-white/30 w-4">{i + 1}.</span>
              <span className="flex-1 text-white/70 truncate">{joke.question}</span>
              <span className="text-primary font-semibold">
                {typeof val === "number" ? (metric === "engagementScore" ? `${val.toFixed(1)}%` : val) : val}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JokesTable({ stats }: { stats: Record<string, JokeAnalytics> }) {
  const [sortBy, setSortBy] = useState<"impressions" | "likes" | "shares" | "engagementScore">("impressions");
  const [langFilter, setLangFilter] = useState<"all" | "english" | "hinglish">("all");

  const filtered = useMemo(() => {
    let list = jokes;
    if (langFilter !== "all") list = list.filter((j) => j.language === langFilter);
    return list
      .map((j) => ({ joke: j, stats: stats[j.id] || { jokeId: j.id, likes: 0, shares: 0, impressions: 0, correctAnswers: 0, wrongAnswers: 0, avgTimeOnCard: 0, skipRate: 0, engagementScore: 0 } }))
      .sort((a, b) => (b.stats[sortBy] as number) - (a.stats[sortBy] as number));
  }, [stats, sortBy, langFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value as typeof langFilter)}
          className="bg-surface/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80"
        >
          <option value="all">All Languages</option>
          <option value="english">English</option>
          <option value="hinglish">Hinglish</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-surface/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80"
        >
          <option value="impressions">Sort by Views</option>
          <option value="likes">Sort by Likes</option>
          <option value="shares">Sort by Shares</option>
          <option value="engagementScore">Sort by Engagement</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-surface/50">
            <tr className="text-white/40">
              <th className="text-left px-4 py-3 font-medium">Joke</th>
              <th className="text-left px-3 py-3 font-medium">Lang</th>
              <th className="text-right px-3 py-3 font-medium">Views</th>
              <th className="text-right px-3 py-3 font-medium">Likes</th>
              <th className="text-right px-3 py-3 font-medium">Shares</th>
              <th className="text-right px-3 py-3 font-medium">Correct</th>
              <th className="text-right px-3 py-3 font-medium">Avg Time</th>
              <th className="text-right px-4 py-3 font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map(({ joke, stats: s }) => (
              <tr key={joke.id} className="hover:bg-surface/20 transition-colors">
                <td className="px-4 py-3 max-w-[200px] truncate text-white/70">{joke.question}</td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    joke.language === "hinglish" ? "bg-orange-500/20 text-orange-300" : "bg-blue-500/20 text-blue-300"
                  }`}>
                    {joke.language === "hinglish" ? "HI" : "EN"}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-white/60">{s.impressions}</td>
                <td className="px-3 py-3 text-right text-rose-400">{s.likes}</td>
                <td className="px-3 py-3 text-right text-blue-400">{s.shares}</td>
                <td className="px-3 py-3 text-right text-emerald-400">{s.correctAnswers}</td>
                <td className="px-3 py-3 text-right text-white/60">{s.avgTimeOnCard.toFixed(1)}s</td>
                <td className="px-4 py-3 text-right font-semibold text-primary">{s.engagementScore.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlgorithmPanel({ weights, updateWeights }: {
  weights: ReturnType<typeof useFeedStore.getState>["weights"];
  updateWeights: ReturnType<typeof useFeedStore.getState>["updateWeights"];
}) {
  const sliders: { key: keyof typeof weights; label: string; emoji: string; color: string }[] = [
    { key: "likeWeight", label: "Like Weight", emoji: "❤️", color: "bg-rose-500" },
    { key: "shareWeight", label: "Share Weight", emoji: "📤", color: "bg-blue-500" },
    { key: "timeOnCardWeight", label: "Time on Card", emoji: "⏱️", color: "bg-amber-500" },
    { key: "correctAnswerWeight", label: "Correct Answer", emoji: "✅", color: "bg-emerald-500" },
    { key: "recencyWeight", label: "Recency", emoji: "🕐", color: "bg-purple-500" },
    { key: "diversityWeight", label: "Diversity", emoji: "🌈", color: "bg-cyan-500" },
  ];

  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-1">Feed Algorithm Weights</h2>
        <p className="text-xs text-white/40">
          Adjust how the algorithm ranks jokes in the feed. Total should equal 1.0 (current: {total.toFixed(2)})
        </p>
      </div>

      <div className="space-y-4">
        {sliders.map(({ key, label, emoji, color }) => (
          <div key={key} className="bg-surface/30 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span>{emoji}</span> {label}
              </span>
              <span className="text-sm font-bold text-primary">{(weights[key] * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights[key] * 100}
              onChange={(e) => updateWeights({ [key]: Number(e.target.value) / 100 })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-primary) ${weights[key] * 100}%, rgba(255,255,255,0.1) ${weights[key] * 100}%)`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Algorithm explanation */}
      <div className="bg-surface/30 border border-white/5 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>📖</span> How it works
        </h3>
        <div className="text-xs text-white/50 space-y-1.5">
          <p>The feed algorithm scores each joke based on weighted factors:</p>
          <p><strong className="text-white/70">Engagement Score</strong> = (LikeRate x LikeWeight) + (ShareRate x ShareWeight) + (TimeScore x TimeWeight) + (CorrectRate x CorrectWeight) + (RecencyBonus x RecencyWeight) + (DiversityBonus x DiversityWeight)</p>
          <p>Jokes with higher scores appear earlier in the feed. The algorithm continuously improves based on your interactions.</p>
        </div>
      </div>

      {/* Demo section */}
      <div className="bg-surface/30 border border-primary/20 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>🔗</span> Test Your Feed
        </h3>
        <p className="text-xs text-white/40 mb-3">
          Preview how your algorithm changes affect the joke feed ordering.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold hover:bg-primary/30 transition-colors"
        >
          Open Joke Feed →
        </Link>
      </div>
    </div>
  );
}
