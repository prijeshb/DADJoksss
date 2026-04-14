"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAnalyticsStore, useSessionStore, useFeedStore } from "@/lib/store";
import type { DadJoke, JokeAnalytics, JokeCandidate } from "@/lib/types";
import ABTestPanel from "@/components/ABTestPanel";

type Tab = "overview" | "jokes" | "candidates" | "abtests" | "algorithm";

export default function DashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [allJokes, setAllJokes] = useState<DadJoke[]>([]);
  const [candidates, setCandidates] = useState<JokeCandidate[]>([]);
  const [candidateStatus, setCandidateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  // Fetch published jokes once for analytics lookups
  useEffect(() => {
    fetch("/api/jokes?limit=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => { if (Array.isArray(body.jokes)) setAllJokes(body.jokes); })
      .catch(() => {});
  }, []);

  const getJokeById = (id: string) => allJokes.find((j) => j.id === id);

  const { jokeStats } = useAnalyticsStore();
  const { jokesViewed } = useSessionStore();
  const { weights, updateWeights } = useFeedStore();

  const allStats = useMemo(() => Object.values(jokeStats), [jokeStats]);

  const totalImpressions = allStats.reduce((sum, s) => sum + s.impressions, 0);
  const totalLikes = allStats.reduce((sum, s) => sum + s.likes, 0);
  const totalShares = allStats.reduce((sum, s) => sum + s.shares, 0);
  const avgEngagement =
    allStats.length > 0
      ? allStats.reduce((sum, s) => sum + s.engagementScore, 0) / allStats.length
      : 0;

  const topLiked = [...allStats].sort((a, b) => b.likes - a.likes).slice(0, 10);
  const topShared = [...allStats].sort((a, b) => b.shares - a.shares).slice(0, 10);
  const topEngaged = [...allStats].sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 10);
  const mostViewed = [...allStats].sort((a, b) => b.impressions - a.impressions).slice(0, 10);

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "overview", label: "Overview", emoji: "Stats" },
    { id: "jokes", label: "Jokes", emoji: "Feed" },
    { id: "candidates", label: "Candidates", emoji: "Queue" },
    { id: "abtests", label: "A/B Tests", emoji: "Labs" },
    { id: "algorithm", label: "Algorithm", emoji: "Tune" },
  ];

  useEffect(() => {
    if (activeTab !== "candidates") return;

    let cancelled = false;

    async function loadCandidates() {
      setCandidateStatus("loading");
      setCandidateMessage("");

      try {
        const res = await fetch("/api/joke-candidates", { cache: "no-store" });
        const body = await res.json();

        if (!res.ok) {
          throw new Error(typeof body.error === "string" ? body.error : "Failed to load candidates");
        }

        if (!cancelled) {
          setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
          setCandidateStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setCandidateStatus("error");
          setCandidateMessage(error instanceof Error ? error.message : "Failed to load candidates");
        }
      }
    }

    void loadCandidates();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  async function handleApproveCandidate(candidateId: string) {
    setActionId(candidateId);
    setCandidateMessage("");

    try {
      const res = await fetch(`/api/joke-candidates/${candidateId}/approve`, {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to approve candidate");
      }

      setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
      setCandidateMessage(`Candidate promoted as joke #${body.jokeId}`);
    } catch (error) {
      setCandidateMessage(error instanceof Error ? error.message : "Failed to approve candidate");
    } finally {
      setActionId(null);
    }
  }

  async function handleRejectCandidate(candidateId: string) {
    setActionId(candidateId);
    setCandidateMessage("");

    try {
      const res = await fetch(`/api/joke-candidates/${candidateId}?reviewNotes=rejected-from-dashboard`, {
        method: "DELETE",
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to reject candidate");
      }

      setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
      setCandidateMessage("Candidate rejected");
    } catch (error) {
      setCandidateMessage(error instanceof Error ? error.message : "Failed to reject candidate");
    } finally {
      setActionId(null);
    }
  }

  async function handleSaveCandidate(candidate: JokeCandidate) {
    setActionId(candidate.id);
    setCandidateMessage("");

    try {
      const res = await fetch(`/api/joke-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: candidate.question,
          answer: candidate.answer,
          category: candidate.category,
          difficulty: candidate.difficulty,
          wrongAnswers: candidate.wrongAnswers,
          tags: candidate.tags,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to save candidate");
      }

      setCandidates((current) =>
        current.map((item) => (item.id === candidate.id ? body.candidate : item))
      );
      setCandidateMessage("Candidate updated");
    } catch (error) {
      setCandidateMessage(error instanceof Error ? error.message : "Failed to save candidate");
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-dvh overflow-auto bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/5 bg-surface/50 p-2 text-white/50 transition-colors hover:text-white/80"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold">Dashboard</h1>
              <p className="text-xs text-white/40">Analytics and moderation</p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-2">
          <div className="flex gap-1 rounded-xl border border-white/5 bg-surface/30 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id ? "text-primary" : "text-white/50 hover:text-white/70"
                }`}
              >
                {activeTab === tab.id ? (
                  <motion.div
                    layoutId="dashTab"
                    className="absolute inset-0 rounded-lg border border-primary/20 bg-primary/10"
                  />
                ) : null}
                <span className="relative flex items-center justify-center gap-1.5">
                  <span>{tab.emoji}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Total Jokes" value={allJokes.length} emoji="Count" />
                <StatCard label="Impressions" value={totalImpressions} emoji="Views" />
                <StatCard label="Likes" value={totalLikes} emoji="Likes" />
                <StatCard label="Shares" value={totalShares} emoji="Shares" />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <StatCard label="Jokes Viewed" value={jokesViewed.length} emoji="Seen" />
                <StatCard label="Avg Engagement" value={`${avgEngagement.toFixed(1)}%`} emoji="Score" />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <JokeList title="Top Liked" emoji="Likes" items={topLiked} metric="likes" getJokeById={getJokeById} />
                <JokeList title="Top Shared" emoji="Shares" items={topShared} metric="shares" getJokeById={getJokeById} />
                <JokeList title="Most Viewed" emoji="Views" items={mostViewed} metric="impressions" getJokeById={getJokeById} />
                <JokeList title="Top Engaged" emoji="Best" items={topEngaged} metric="engagementScore" getJokeById={getJokeById} />
              </div>
            </motion.div>
          ) : null}

          {activeTab === "jokes" ? (
            <motion.div
              key="jokes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <JokesTable stats={jokeStats} allJokes={allJokes} />
            </motion.div>
          ) : null}

          {activeTab === "candidates" ? (
            <motion.div
              key="candidates"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <CandidatesPanel
                candidates={candidates}
                status={candidateStatus}
                message={candidateMessage}
                actionId={actionId}
                onApprove={handleApproveCandidate}
                onReject={handleRejectCandidate}
                onSave={handleSaveCandidate}
              />
            </motion.div>
          ) : null}

          {activeTab === "abtests" ? (
            <motion.div
              key="abtests"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <ABTestPanel jokeStats={jokeStats} allJokes={allJokes} />
            </motion.div>
          ) : null}

          {activeTab === "algorithm" ? (
            <motion.div
              key="algorithm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <AlgorithmPanel weights={weights} updateWeights={updateWeights} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string | number; emoji: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-surface/50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span>{emoji}</span>
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function JokeList({
  title,
  emoji,
  items,
  metric,
  getJokeById,
}: {
  title: string;
  emoji: string;
  items: JokeAnalytics[];
  metric: keyof JokeAnalytics;
  getJokeById: (id: string) => DadJoke | undefined;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-surface/30 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span>{emoji}</span> {title}
        </h3>
        <p className="text-xs text-white/30">No data yet. Start swiping!</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-surface/30 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span>{emoji}</span> {title}
      </h3>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, index) => {
          const joke = getJokeById(item.jokeId);
          if (!joke) return null;
          const value = item[metric];
          return (
            <div key={item.jokeId} className="flex items-center gap-3 text-xs">
              <span className="w-4 text-white/30">{index + 1}.</span>
              <span className="flex-1 truncate text-white/70">{joke.question}</span>
              <span className="font-semibold text-primary">
                {typeof value === "number"
                  ? metric === "engagementScore"
                    ? `${value.toFixed(1)}%`
                    : value
                  : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JokesTable({ stats, allJokes }: { stats: Record<string, JokeAnalytics>; allJokes: DadJoke[] }) {
  const [sortBy, setSortBy] = useState<"impressions" | "likes" | "shares" | "engagementScore">("impressions");
  const [langFilter, setLangFilter] = useState<"all" | "english" | "hinglish">("all");

  const filtered = useMemo(() => {
    const list = langFilter === "all" ? allJokes : allJokes.filter((joke) => joke.language === langFilter);
    return list
      .map((joke) => ({
        joke,
        stats: stats[joke.id] ?? {
          jokeId: joke.id,
          likes: 0,
          shares: 0,
          impressions: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          avgTimeOnCard: 0,
          skipRate: 0,
          engagementScore: 0,
        },
      }))
      .sort((a, b) => (b.stats[sortBy] as number) - (a.stats[sortBy] as number));
  }, [stats, sortBy, langFilter, allJokes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={langFilter}
          onChange={(event) => setLangFilter(event.target.value as typeof langFilter)}
          className="rounded-xl border border-white/10 bg-surface/50 px-3 py-2 text-xs text-white/80"
        >
          <option value="all">All Languages</option>
          <option value="english">English</option>
          <option value="hinglish">Hinglish</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          className="rounded-xl border border-white/10 bg-surface/50 px-3 py-2 text-xs text-white/80"
        >
          <option value="impressions">Sort by Views</option>
          <option value="likes">Sort by Likes</option>
          <option value="shares">Sort by Shares</option>
          <option value="engagementScore">Sort by Engagement</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-surface/50">
            <tr className="text-white/40">
              <th className="px-4 py-3 text-left font-medium">Joke</th>
              <th className="px-3 py-3 text-left font-medium">Lang</th>
              <th className="px-3 py-3 text-right font-medium">Views</th>
              <th className="px-3 py-3 text-right font-medium">Likes</th>
              <th className="px-3 py-3 text-right font-medium">Shares</th>
              <th className="px-3 py-3 text-right font-medium">Correct</th>
              <th className="px-3 py-3 text-right font-medium">Avg Time</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map(({ joke, stats: row }) => (
              <tr key={joke.id} className="transition-colors hover:bg-surface/20">
                <td className="max-w-[200px] truncate px-4 py-3 text-white/70">{joke.question}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      joke.language === "hinglish"
                        ? "bg-orange-500/20 text-orange-300"
                        : "bg-blue-500/20 text-blue-300"
                    }`}
                  >
                    {joke.language === "hinglish" ? "HI" : "EN"}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-white/60">{row.impressions}</td>
                <td className="px-3 py-3 text-right text-rose-400">{row.likes}</td>
                <td className="px-3 py-3 text-right text-blue-400">{row.shares}</td>
                <td className="px-3 py-3 text-right text-emerald-400">{row.correctAnswers}</td>
                <td className="px-3 py-3 text-right text-white/60">{row.avgTimeOnCard.toFixed(1)}s</td>
                <td className="px-4 py-3 text-right font-semibold text-primary">
                  {row.engagementScore.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandidatesPanel({
  candidates,
  status,
  message,
  actionId,
  onApprove,
  onReject,
  onSave,
}: {
  candidates: JokeCandidate[];
  status: "idle" | "loading" | "error";
  message: string;
  actionId: string | null;
  onApprove: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
  onSave: (candidate: JokeCandidate) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Pending Candidates</h2>
          <p className="text-xs text-white/40">
            Review imported jokes and promote them into the production joke tables.
          </p>
        </div>
        <div className="text-xs text-white/30">
          {status === "loading" ? "Loading..." : `${candidates.length} pending`}
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs text-primary">
          {message}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {message || "Failed to load candidates"}
        </div>
      ) : null}

      {status !== "error" && candidates.length === 0 && status !== "loading" ? (
        <div className="rounded-2xl border border-white/5 bg-surface/30 px-4 py-6 text-sm text-white/40">
          No pending candidates right now.
        </div>
      ) : null}

      <div className="space-y-3">
        {candidates.map((candidate) => (
          <EditableCandidateCard
            key={candidate.id}
            candidate={candidate}
            busy={actionId === candidate.id}
            onApprove={onApprove}
            onReject={onReject}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  );
}

function EditableCandidateCard({
  candidate,
  busy,
  onApprove,
  onReject,
  onSave,
}: {
  candidate: JokeCandidate;
  busy: boolean;
  onApprove: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
  onSave: (candidate: JokeCandidate) => Promise<void>;
}) {
  const [draft, setDraft] = useState(candidate);

  useEffect(() => {
    setDraft(candidate);
  }, [candidate]);

  function updateWrongAnswer(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      wrongAnswers: current.wrongAnswers.map((item, itemIndex) =>
        itemIndex === index ? value : item
      ),
    }));
  }

  function updateTags(value: string) {
    setDraft((current) => ({
      ...current,
      tags: value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    }));
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-surface/30 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-[11px] text-white/35">
            <span>{candidate.sourcePlatform}</span>
            <span>|</span>
            <span>{candidate.sourceHandle ?? "unknown source"}</span>
            <span>|</span>
            <span>{candidate.language}</span>
          </div>

          <input
            value={draft.question}
            onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-sm text-white"
          />

          <input
            value={draft.answer}
            onChange={(event) => setDraft((current) => ({ ...current, answer: event.target.value }))}
            className="w-full rounded-xl border border-primary/20 bg-background/40 px-3 py-2 text-sm text-primary"
          />

          <div className="grid gap-2 md:grid-cols-3">
            {draft.wrongAnswers.map((wrongAnswer, index) => (
              <input
                key={`${candidate.id}-wrong-${index}`}
                value={wrongAnswer}
                onChange={(event) => updateWrongAnswer(index, event.target.value)}
                className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-white/70"
              />
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value as JokeCandidate["category"],
                }))
              }
              className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-white/80"
            >
              <option value="pun">pun</option>
              <option value="wordplay">wordplay</option>
              <option value="classic">classic</option>
              <option value="science">science</option>
              <option value="food">food</option>
              <option value="animal">animal</option>
              <option value="tech">tech</option>
              <option value="general">general</option>
              <option value="adult">adult</option>
            </select>

            <select
              value={draft.difficulty}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  difficulty: Number(event.target.value) as 1 | 2 | 3,
                }))
              }
              className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-white/80"
            >
              <option value={1}>Difficulty 1</option>
              <option value={2}>Difficulty 2</option>
              <option value={3}>Difficulty 3</option>
            </select>

            <input
              value={draft.tags.join(", ")}
              onChange={(event) => updateTags(event.target.value)}
              className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-white/80"
            />
          </div>

          {candidate.transcriptSnippet ? (
            <p className="text-xs text-white/35">{candidate.transcriptSnippet}</p>
          ) : null}
        </div>

        <div className="flex min-w-[170px] flex-col items-stretch gap-2">
          <a
            href={/^https?:\/\//i.test(candidate.sourceUrl) ? candidate.sourceUrl : "#"}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/10 px-3 py-2 text-center text-xs text-white/60 transition-colors hover:text-white"
          >
            Open Source
          </a>
          <button
            onClick={() => void onSave(draft)}
            disabled={busy}
            className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void onApprove(candidate.id)}
            disabled={busy}
            className="rounded-xl border border-primary/30 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Working..." : "Approve"}
          </button>
          <button
            onClick={() => void onReject(candidate.id)}
            disabled={busy}
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Working..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlgorithmPanel({
  weights,
  updateWeights,
}: {
  weights: ReturnType<typeof useFeedStore.getState>["weights"];
  updateWeights: ReturnType<typeof useFeedStore.getState>["updateWeights"];
}) {
  const sliders: { key: keyof typeof weights; label: string; emoji: string }[] = [
    { key: "likeWeight", label: "Like Weight", emoji: "Like" },
    { key: "shareWeight", label: "Share Weight", emoji: "Share" },
    { key: "timeOnCardWeight", label: "Time on Card", emoji: "Time" },
    { key: "correctAnswerWeight", label: "Correct Answer", emoji: "Answer" },
    { key: "recencyWeight", label: "Recency", emoji: "Fresh" },
    { key: "diversityWeight", label: "Diversity", emoji: "Mix" },
  ];

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-bold">Feed Algorithm Weights</h2>
        <p className="text-xs text-white/40">
          Adjust how the algorithm ranks jokes in the feed. Total should equal 1.0 (current: {total.toFixed(2)})
        </p>
      </div>

      <div className="space-y-4">
        {sliders.map(({ key, label, emoji }) => (
          <div key={key} className="rounded-2xl border border-white/5 bg-surface/30 p-4">
            <div className="mb-2 flex items-center justify-between">
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
              onChange={(event) => updateWeights({ [key]: Number(event.target.value) / 100 })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-primary) ${weights[key] * 100}%, rgba(255,255,255,0.1) ${weights[key] * 100}%)`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface/30 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span>Guide</span> How it works
        </h3>
        <div className="space-y-1.5 text-xs text-white/50">
          <p>The feed algorithm scores each joke based on weighted factors.</p>
          <p>
            <strong className="text-white/70">Engagement Score</strong> = (LikeRate x LikeWeight) + (ShareRate x ShareWeight) + (TimeScore x TimeWeight) + (CorrectRate x CorrectWeight) + (RecencyBonus x RecencyWeight) + (DiversityBonus x DiversityWeight)
          </p>
          <p>Jokes with higher scores appear earlier in the feed.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-surface/30 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span>Preview</span> Test Your Feed
        </h3>
        <p className="mb-3 text-xs text-white/40">
          Preview how your algorithm changes affect the joke feed ordering.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/20 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/30"
        >
          Open Joke Feed
        </Link>
      </div>
    </div>
  );
}
