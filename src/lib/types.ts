export type Language = "english" | "hinglish";
export type JokeCategory = "pun" | "wordplay" | "classic" | "science" | "food" | "animal" | "tech" | "general" | "adult";

export interface DadJoke {
  id: string;
  question: string;
  answer: string;
  language: Language;
  category: JokeCategory;
  wrongAnswers: string[];
  source?: string;
  difficulty: 1 | 2 | 3; // 1=easy, 2=medium, 3=hard
  tags: string[];
  featured?: boolean;
}

export interface JokeAnalytics {
  jokeId: string;
  likes: number;
  shares: number;
  impressions: number;
  correctAnswers: number;
  wrongAnswers: number;
  avgTimeOnCard: number; // in seconds
  skipRate: number; // 0-1
  engagementScore: number; // computed
}

export interface UserSession {
  sessionId: string;
  startedAt: number;
  jokesViewed: string[];
  jokesLiked: string[];
  jokesShared: string[];
  languageFilter: Language | "mix";
  abTestGroup: string;
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  startDate: string;
  endDate?: string;
  status: "draft" | "running" | "completed";
}

export interface ABVariant {
  id: string;
  name: string;
  jokeIds: string[];
  impressions: number;
  likes: number;
  shares: number;
  avgEngagement: number;
}

export interface FeedAlgorithmWeights {
  likeWeight: number;
  shareWeight: number;
  timeOnCardWeight: number;
  correctAnswerWeight: number;
  recencyWeight: number;
  diversityWeight: number;
}

export interface DashboardStats {
  totalJokes: number;
  totalImpressions: number;
  totalLikes: number;
  totalShares: number;
  topLiked: JokeAnalytics[];
  topShared: JokeAnalytics[];
  topEngaged: JokeAnalytics[];
  languageBreakdown: Record<Language, number>;
  dailyStats: DailyStat[];
}

export interface DailyStat {
  date: string;
  impressions: number;
  likes: number;
  shares: number;
  uniqueUsers: number;
}
