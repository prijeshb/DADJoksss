"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useABTestStore } from "@/lib/store";
import { jokes, getJokeById } from "@/data/jokes";
import type { JokeAnalytics, ABTest, ABVariant } from "@/lib/types";

// ---- helpers ----

function computeVariantStats(variant: ABVariant, jokeStats: Record<string, JokeAnalytics>) {
  const impressions = variant.jokeIds.reduce((s, id) => s + (jokeStats[id]?.impressions ?? 0), 0);
  const likes = variant.jokeIds.reduce((s, id) => s + (jokeStats[id]?.likes ?? 0), 0);
  const shares = variant.jokeIds.reduce((s, id) => s + (jokeStats[id]?.shares ?? 0), 0);
  const watched = variant.jokeIds.filter((id) => (jokeStats[id]?.impressions ?? 0) > 0).length;
  const engagement = variant.jokeIds.reduce((s, id) => s + (jokeStats[id]?.engagementScore ?? 0), 0) / Math.max(1, variant.jokeIds.length);
  return { impressions, likes, shares, watched, engagement };
}

function feedLink(testId: string, variantId: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/feed/${testId}?v=${variantId}`;
}

// ---- sub-components ----

function CopyLinkButton({ testId, variantId }: { testId: string; variantId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(feedLink(testId, variantId));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
        copied
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          : "bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white/70"
      }`}
    >
      {copied ? "✓ Copied!" : "🔗 Copy Link"}
    </button>
  );
}

function VariantStatsRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <span className="text-white/30 text-[10px]">{label}</span>
      <p className={`font-semibold text-xs ${color}`}>{value}</p>
    </div>
  );
}

function JokePicker({
  variant,
  testId,
  onClose,
}: {
  variant: ABVariant;
  testId: string;
  onClose: () => void;
}) {
  const { updateVariantJokes } = useABTestStore();
  const [selected, setSelected] = useState<Set<string>>(new Set(variant.jokeIds));
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<"all" | "english" | "hinglish">("all");

  const filtered = useMemo(() => {
    return jokes.filter((j) => {
      if (langFilter !== "all" && j.language !== langFilter) return false;
      if (search && !j.question.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, langFilter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const save = () => {
    updateVariantJokes(testId, variant.id, Array.from(selected));
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-background/40 rounded-xl border border-white/10 p-3 space-y-3 mt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/70">
            Select jokes for <span className="text-primary">{variant.name}</span>
            <span className="ml-2 text-white/30">({selected.size} selected)</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={save}
              className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-semibold"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-white/5 text-white/40 border border-white/10 rounded-lg text-[10px]"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jokes..."
            className="flex-1 bg-background/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
          />
          <select
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value as typeof langFilter)}
            className="bg-background/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70"
          >
            <option value="all">All</option>
            <option value="english">English</option>
            <option value="hinglish">Hinglish</option>
          </select>
        </div>

        {/* Joke list */}
        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
          {filtered.map((joke) => (
            <label
              key={joke.id}
              className={`flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                selected.has(joke.id) ? "bg-primary/10 border border-primary/20" : "hover:bg-white/5 border border-transparent"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(joke.id)}
                onChange={() => toggle(joke.id)}
                className="mt-0.5 accent-[var(--color-primary)] flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-white/70 truncate">{joke.question}</p>
                <span className={`text-[9px] ${joke.language === "hinglish" ? "text-orange-400" : "text-blue-400"}`}>
                  {joke.language}
                </span>
              </div>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-white/30 text-xs py-4">No jokes match your search.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function WinnerSuggestion({ test, jokeStats }: { test: ABTest; jokeStats: Record<string, JokeAnalytics> }) {
  const [expanded, setExpanded] = useState(false);

  const winner = useMemo(() => {
    const ranked = test.variants
      .map((v) => ({ variant: v, stats: computeVariantStats(v, jokeStats) }))
      .filter((x) => x.stats.impressions > 0)
      .sort((a, b) => b.stats.engagement - a.stats.engagement);
    return ranked[0] ?? null;
  }, [test.variants, jokeStats]);

  if (!winner || test.status === "draft") return null;

  const topJokes = [...winner.variant.jokeIds]
    .map((id) => ({ id, score: jokeStats[id]?.engagementScore ?? 0, joke: getJokeById(id) }))
    .filter((x) => x.joke)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (topJokes.length === 0) return null;

  return (
    <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
          ✨ Suggestion — promote top jokes from <span className="italic">{winner.variant.name}</span>
        </span>
        <span className="text-white/30 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-white/40">
                These jokes scored highest in the winning variant. Consider adding them to the main feed.
              </p>
              {topJokes.map(({ id, score, joke }) => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <code className="text-[9px] text-white/25 w-16 flex-shrink-0">{id}</code>
                  <span className="flex-1 text-white/60 truncate">{joke!.question}</span>
                  <span className="text-amber-300 font-semibold flex-shrink-0">{score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TestCard({ test, jokeStats }: { test: ABTest; jokeStats: Record<string, JokeAnalytics> }) {
  const { updateTest, deleteTest } = useABTestStore();
  const [pickerVariantId, setPickerVariantId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-surface/30 border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{test.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                test.status === "running" ? "bg-emerald-500/20 text-emerald-400" :
                test.status === "completed" ? "bg-blue-500/20 text-blue-400" :
                "bg-white/10 text-white/50"
              }`}>
                {test.status}
              </span>
            </div>
            <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{test.description}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {test.status === "draft" && (
              <button onClick={() => updateTest(test.id, { status: "running" })} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px]">
                Start
              </button>
            )}
            {test.status === "running" && (
              <button onClick={() => updateTest(test.id, { status: "completed" })} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-[10px]">
                Complete
              </button>
            )}
            {confirmDelete ? (
              <>
                <button onClick={() => deleteTest(test.id)} className="px-2 py-1 bg-red-500/30 text-red-300 rounded-lg text-[10px]">Sure?</button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 bg-white/5 text-white/40 rounded-lg text-[10px]">No</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 bg-red-500/10 text-red-400/70 rounded-lg text-[10px]">Delete</button>
            )}
          </div>
        </div>

        {/* Variants */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {test.variants.map((variant) => {
            const stats = computeVariantStats(variant, jokeStats);
            const likeRate = stats.impressions > 0 ? (stats.likes / stats.impressions * 100).toFixed(1) : "—";
            const shareRate = stats.impressions > 0 ? (stats.shares / stats.impressions * 100).toFixed(1) : "—";
            const isWinner = test.variants.length === 2 &&
              stats.impressions > 0 &&
              test.variants.every((v) => computeVariantStats(v, jokeStats).impressions > 0) &&
              stats.engagement >= Math.max(...test.variants.map((v) => computeVariantStats(v, jokeStats).engagement));

            return (
              <div
                key={variant.id}
                className={`bg-background/30 rounded-xl p-3 border space-y-2 ${isWinner && test.status !== "draft" ? "border-emerald-500/30" : "border-white/5"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{variant.name}</span>
                  <div className="flex items-center gap-1">
                    {isWinner && test.status !== "draft" && (
                      <span className="text-[10px] text-emerald-400">Winner</span>
                    )}
                    <span className="text-[10px] text-white/30">{variant.jokeIds.length} jokes</span>
                  </div>
                </div>

                {/* Computed stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  <VariantStatsRow label="Views" value={stats.impressions} color="text-white/70" />
                  <VariantStatsRow label="Watched" value={`${stats.watched}/${variant.jokeIds.length}`} color="text-white/70" />
                  <VariantStatsRow label="Like Rate" value={likeRate === "—" ? "—" : `${likeRate}%`} color="text-rose-400" />
                  <VariantStatsRow label="Share Rate" value={shareRate === "—" ? "—" : `${shareRate}%`} color="text-blue-400" />
                  <VariantStatsRow label="Engagement" value={`${stats.engagement.toFixed(1)}%`} color="text-primary" />
                  <VariantStatsRow label="Likes" value={stats.likes} color="text-rose-300" />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <CopyLinkButton testId={test.id} variantId={variant.id} />
                  <button
                    onClick={() => setPickerVariantId(pickerVariantId === variant.id ? null : variant.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white/70 transition-colors"
                  >
                    ✏️ Edit Jokes
                  </button>
                </div>

                {/* Joke picker */}
                <AnimatePresence>
                  {pickerVariantId === variant.id && (
                    <JokePicker
                      variant={variant}
                      testId={test.id}
                      onClose={() => setPickerVariantId(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Winner suggestion */}
        <WinnerSuggestion test={test} jokeStats={jokeStats} />
      </div>
    </div>
  );
}

// ---- main export ----

export default function ABTestPanel({ jokeStats }: { jokeStats: Record<string, JokeAnalytics> }) {
  const { tests, createTest } = useABTestStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTest({
      name: newName,
      description: newDesc,
      variants: [
        { id: "v1", name: "Variant A", jokeIds: [], impressions: 0, likes: 0, shares: 0, avgEngagement: 0 },
        { id: "v2", name: "Variant B", jokeIds: [], impressions: 0, likes: 0, shares: 0, avgEngagement: 0 },
      ],
      startDate: new Date().toISOString().split("T")[0],
      status: "draft",
    });
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">A/B Tests</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold hover:bg-primary/30 transition-colors"
        >
          + New Test
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-surface/50 border border-white/10 rounded-2xl p-4 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Test name..."
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none h-20 outline-none focus:border-white/30"
              />
              <p className="text-[10px] text-white/30">
                After creating, use &quot;Edit Jokes&quot; on each variant to select jokes, then copy the feed link.
              </p>
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold">
                  Create
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-white/5 text-white/50 border border-white/10 rounded-xl text-xs">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {tests.map((test) => (
          <TestCard key={test.id} test={test} jokeStats={jokeStats} />
        ))}
        {tests.length === 0 && (
          <p className="text-center text-white/30 text-sm py-8">No A/B tests yet. Create one to start experimenting!</p>
        )}
      </div>
    </div>
  );
}
