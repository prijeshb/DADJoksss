"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language, JokeAnalytics, FeedAlgorithmWeights, ABTest, ABVariant } from "./types";
import { v4 as uuidv4 } from "uuid";

// ==================== ANALYTICS STORE ====================
interface AnalyticsState {
  jokeStats: Record<string, JokeAnalytics>;
  trackImpression: (jokeId: string) => void;
  trackLike: (jokeId: string) => void;
  trackShare: (jokeId: string) => void;
  trackCorrectAnswer: (jokeId: string) => void;
  trackWrongAnswer: (jokeId: string) => void;
  trackTimeOnCard: (jokeId: string, seconds: number) => void;
  trackSkip: (jokeId: string) => void;
  getTopJokes: (sortBy: keyof JokeAnalytics, limit?: number) => JokeAnalytics[];
  getEngagementScore: (jokeId: string) => number;
}

function computeEngagement(stats: JokeAnalytics): number {
  if (stats.impressions === 0) return 0;
  const likeRate = stats.likes / stats.impressions;
  const shareRate = stats.shares / stats.impressions;
  const correctRate = stats.correctAnswers / Math.max(1, stats.correctAnswers + stats.wrongAnswers);
  const timeScore = Math.min(stats.avgTimeOnCard / 15, 1); // cap at 15 seconds
  const skipPenalty = 1 - stats.skipRate;
  return (likeRate * 0.3 + shareRate * 0.25 + correctRate * 0.15 + timeScore * 0.15 + skipPenalty * 0.15) * 100;
}

function getDefaultStats(jokeId: string): JokeAnalytics {
  return {
    jokeId,
    likes: 0,
    shares: 0,
    impressions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    avgTimeOnCard: 0,
    skipRate: 0,
    engagementScore: 0,
  };
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      jokeStats: {},
      trackImpression: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const updated = { ...existing, impressions: existing.impressions + 1 };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackLike: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const updated = { ...existing, likes: existing.likes + 1 };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackShare: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const updated = { ...existing, shares: existing.shares + 1 };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackCorrectAnswer: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const updated = { ...existing, correctAnswers: existing.correctAnswers + 1 };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackWrongAnswer: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const updated = { ...existing, wrongAnswers: existing.wrongAnswers + 1 };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackTimeOnCard: (jokeId, seconds) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const totalTime = existing.avgTimeOnCard * (existing.impressions - 1) + seconds;
          const updated = {
            ...existing,
            avgTimeOnCard: totalTime / Math.max(1, existing.impressions),
          };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      trackSkip: (jokeId) =>
        set((state) => {
          const existing = state.jokeStats[jokeId] || getDefaultStats(jokeId);
          const totalSkips = existing.skipRate * (existing.impressions - 1) + 1;
          const updated = {
            ...existing,
            skipRate: totalSkips / Math.max(1, existing.impressions),
          };
          updated.engagementScore = computeEngagement(updated);
          return { jokeStats: { ...state.jokeStats, [jokeId]: updated } };
        }),
      getTopJokes: (sortBy, limit = 10) => {
        const stats = Object.values(get().jokeStats);
        return stats
          .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number))
          .slice(0, limit);
      },
      getEngagementScore: (jokeId) => {
        const stats = get().jokeStats[jokeId];
        return stats ? stats.engagementScore : 0;
      },
    }),
    { name: "dad-jokes-analytics" }
  )
);

// ==================== USER SESSION STORE ====================
interface SessionState {
  sessionId: string;
  languageFilter: Language | "mix";
  jokesViewed: string[];
  jokesLiked: string[];
  jokesShared: string[];
  abTestGroup: string;
  setLanguageFilter: (filter: Language | "mix") => void;
  addViewed: (jokeId: string) => void;
  addLiked: (jokeId: string) => void;
  removeLiked: (jokeId: string) => void;
  addShared: (jokeId: string) => void;
  isLiked: (jokeId: string) => boolean;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: uuidv4(),
      languageFilter: "mix",
      jokesViewed: [],
      jokesLiked: [],
      jokesShared: [],
      abTestGroup: Math.random() > 0.5 ? "A" : "B",
      setLanguageFilter: (filter) => set({ languageFilter: filter }),
      addViewed: (jokeId) =>
        set((state) => ({
          jokesViewed: state.jokesViewed.includes(jokeId)
            ? state.jokesViewed
            : [...state.jokesViewed, jokeId],
        })),
      addLiked: (jokeId) =>
        set((state) => ({
          jokesLiked: state.jokesLiked.includes(jokeId)
            ? state.jokesLiked
            : [...state.jokesLiked, jokeId],
        })),
      removeLiked: (jokeId) =>
        set((state) => ({
          jokesLiked: state.jokesLiked.filter((id) => id !== jokeId),
        })),
      addShared: (jokeId) =>
        set((state) => ({
          jokesShared: state.jokesShared.includes(jokeId)
            ? state.jokesShared
            : [...state.jokesShared, jokeId],
        })),
      isLiked: (jokeId) => get().jokesLiked.includes(jokeId),
    }),
    { name: "dad-jokes-session" }
  )
);

// ==================== FEED ALGORITHM ====================
interface FeedState {
  weights: FeedAlgorithmWeights;
  updateWeights: (weights: Partial<FeedAlgorithmWeights>) => void;
}

export const useFeedStore = create<FeedState>()(
  persist(
    (set) => ({
      weights: {
        likeWeight: 0.25,
        shareWeight: 0.25,
        timeOnCardWeight: 0.15,
        correctAnswerWeight: 0.10,
        recencyWeight: 0.15,
        diversityWeight: 0.10,
      },
      updateWeights: (newWeights) =>
        set((state) => ({
          weights: { ...state.weights, ...newWeights },
        })),
    }),
    { name: "dad-jokes-feed" }
  )
);

// ==================== A/B TEST STORE ====================
interface ABTestState {
  tests: ABTest[];
  createTest: (test: Omit<ABTest, "id">) => string;
  updateTest: (id: string, updates: Partial<ABTest>) => void;
  deleteTest: (id: string) => void;
  trackVariantImpression: (testId: string, variantId: string) => void;
  trackVariantLike: (testId: string, variantId: string) => void;
  trackVariantShare: (testId: string, variantId: string) => void;
}

export const useABTestStore = create<ABTestState>()(
  persist(
    (set) => ({
      tests: [
        {
          id: "test-001",
          name: "Classic vs Hinglish First Impression",
          description: "Test whether starting with classic English or Hinglish jokes leads to better engagement",
          variants: [
            { id: "v1", name: "English First", jokeIds: ["en-001", "en-003", "en-005", "en-010", "en-015"], impressions: 142, likes: 38, shares: 12, avgEngagement: 72 },
            { id: "v2", name: "Hinglish First", jokeIds: ["hi-001", "hi-005", "hi-010", "hi-015", "hi-020"], impressions: 138, likes: 45, shares: 18, avgEngagement: 81 },
          ],
          startDate: "2026-03-01",
          status: "running",
        },
        {
          id: "test-002",
          name: "Timer Duration Test",
          description: "Test 5s vs 8s timer for answer reveal",
          variants: [
            { id: "v1", name: "5 Second Timer", jokeIds: ["en-002", "en-007", "en-012"], impressions: 95, likes: 28, shares: 8, avgEngagement: 68 },
            { id: "v2", name: "8 Second Timer", jokeIds: ["en-002", "en-007", "en-012"], impressions: 89, likes: 31, shares: 11, avgEngagement: 74 },
          ],
          startDate: "2026-03-05",
          status: "running",
        },
      ],
      createTest: (test) => {
        const id = `test-${uuidv4().slice(0, 8)}`;
        set((state) => ({
          tests: [...state.tests, { ...test, id }],
        }));
        return id;
      },
      updateTest: (id, updates) =>
        set((state) => ({
          tests: state.tests.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTest: (id) =>
        set((state) => ({
          tests: state.tests.filter((t) => t.id !== id),
        })),
      trackVariantImpression: (testId, variantId) =>
        set((state) => ({
          tests: state.tests.map((t) =>
            t.id === testId
              ? {
                  ...t,
                  variants: t.variants.map((v) =>
                    v.id === variantId ? { ...v, impressions: v.impressions + 1 } : v
                  ),
                }
              : t
          ),
        })),
      trackVariantLike: (testId, variantId) =>
        set((state) => ({
          tests: state.tests.map((t) =>
            t.id === testId
              ? {
                  ...t,
                  variants: t.variants.map((v) =>
                    v.id === variantId ? { ...v, likes: v.likes + 1 } : v
                  ),
                }
              : t
          ),
        })),
      trackVariantShare: (testId, variantId) =>
        set((state) => ({
          tests: state.tests.map((t) =>
            t.id === testId
              ? {
                  ...t,
                  variants: t.variants.map((v) =>
                    v.id === variantId ? { ...v, shares: v.shares + 1 } : v
                  ),
                }
              : t
          ),
        })),
    }),
    { name: "dad-jokes-abtests" }
  )
);
