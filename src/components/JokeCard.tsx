"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DadJoke } from "@/lib/types";
import { useTimer } from "@/hooks/useTimer";
import TimerCircle from "./TimerCircle";
import AnswerOptions from "./AnswerOptions";
import { useAnalyticsStore, useSessionStore } from "@/lib/store";

interface JokeCardProps {
  joke: DadJoke;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  zIndex: number;
}

export default function JokeCard({ joke, onSwipeLeft, onSwipeRight, isTop, zIndex }: JokeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showLaughRipple, setShowLaughRipple] = useState(false);
  const [laughBurst, setLaughBurst] = useState(false);
  const [dragX, setDragX] = useState(0);
  const cardStartTime = useRef(Date.now());

  const { timeLeft, isRunning, isComplete, progress, start, reset, toggle } = useTimer(20);
  const isPaused = !isRunning && !isComplete && timeLeft < 20;
  const { trackImpression, trackLike, trackShare, trackCorrectAnswer, trackWrongAnswer, trackTimeOnCard, trackSkip } = useAnalyticsStore();
  const { addViewed, addLiked, removeLiked, addShared, isLiked: checkIsLiked } = useSessionStore();

  // Initialize
  useEffect(() => {
    if (isTop) {
      trackImpression(joke.id);
      addViewed(joke.id);
      start();
      cardStartTime.current = Date.now();
      setLiked(checkIsLiked(joke.id));
    }
    return () => {
      if (isTop) {
        const elapsed = (Date.now() - cardStartTime.current) / 1000;
        if (elapsed > 0.5) trackTimeOnCard(joke.id, elapsed);
      }
    };
  }, [joke.id, isTop]); // eslint-disable-line react-hooks/exhaustive-deps

  // On timer complete: reveal answer on front face so they can see options — don't auto-flip
  useEffect(() => {
    if (isComplete && !revealed) {
      setRevealed(true);
    }
  }, [isComplete, revealed]);

  const handleLike = useCallback(() => {
    if (liked) {
      removeLiked(joke.id);
      setLiked(false);
    } else {
      trackLike(joke.id);
      addLiked(joke.id);
      setLiked(true);
      setShowLaughRipple(true);
      setLaughBurst(true);
      // Play laugh sound
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}
      setTimeout(() => setShowLaughRipple(false), 600);
      setTimeout(() => setLaughBurst(false), 800);
    }
  }, [liked, joke.id, trackLike, addLiked, removeLiked]);

  const handleShare = useCallback(async () => {
    trackShare(joke.id);
    addShared(joke.id);
    const text = `😂 Dad Joke Alert!\n\nQ: ${joke.question}\nA: ${joke.answer}\n\nGet more at DadJokes Daily!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Dad Joke", text });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      // Show toast notification - we'll handle this via a simple alert-style animation
    }
  }, [joke, trackShare, addShared]);

  const handleCorrect = useCallback(() => {
    trackCorrectAnswer(joke.id);
    setRevealed(true);
    setFlipped(true);
  }, [joke.id, trackCorrectAnswer]);

  const handleWrong = useCallback(() => {
    trackWrongAnswer(joke.id);
  }, [joke.id, trackWrongAnswer]);

  const handleFlipManual = useCallback(() => {
    if (!revealed) {
      setRevealed(true);
      setFlipped(true);
      reset();
    } else {
      setFlipped((f) => !f);
    }
  }, [revealed, reset]);

  // Category emoji
  const categoryEmoji: Record<string, string> = {
    pun: "🎯", wordplay: "🔤", classic: "👴", science: "🔬",
    food: "🍔", animal: "🐻", tech: "💻", general: "🎪",
  };

  // Language badge
  const langBadge = joke.language === "hinglish"
    ? { label: "Hinglish", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" }
    : { label: "English", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };

  if (!isTop) {
    return (
      <div
        className="absolute inset-0 rounded-3xl bg-card-bg border border-white/5"
        style={{ zIndex, transform: `scale(${0.95}) translateY(${8}px)` }}
      />
    );
  }

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={{ zIndex }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDrag={(_, info) => setDragX(info.offset.x)}
      onDragEnd={(_, info) => {
        setDragX(0);
        const threshold = 100;
        if (info.offset.x > threshold) {
          trackSkip(joke.id);
          onSwipeRight();
        } else if (info.offset.x < -threshold) {
          trackSkip(joke.id);
          onSwipeLeft();
        }
      }}
      animate={{
        rotateZ: dragX * 0.05,
        x: 0,
      }}
      exit={{
        x: dragX > 0 ? 500 : -500,
        opacity: 0,
        rotateZ: dragX > 0 ? 15 : -15,
        transition: { duration: 0.3 },
      }}
    >
      {/* Swipe indicators */}
      <AnimatePresence>
        {dragX > 50 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-8 left-8 z-50 bg-blue-500/90 text-white px-4 py-2 rounded-xl font-bold text-lg rotate-[-12deg]"
          >
            ← BACK
          </motion.div>
        )}
        {dragX < -50 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-8 right-8 z-50 bg-emerald-500/90 text-white px-4 py-2 rounded-xl font-bold text-lg rotate-[12deg]"
          >
            NEXT →
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card container */}
      <div className="card-flip w-full h-full">
        <div className={`card-inner ${flipped ? "flipped" : ""}`}>
          {/* ===== FRONT FACE ===== */}
          <div className="card-face bg-card-front border border-white/[0.07] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{categoryEmoji[joke.category] || "😄"}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${langBadge.color}`}>
                  {langBadge.label}
                </span>
              </div>
              <TimerCircle
                timeLeft={timeLeft}
                duration={20}
                isRunning={isRunning}
                isComplete={isComplete}
                isPaused={isPaused}
                onClick={!revealed ? toggle : undefined}
              />
            </div>

            {/* Question + Answer Options */}
            <div className="flex-1 flex flex-col justify-center px-4 pb-2 min-h-0 gap-3">
              {/* Tags */}
              {joke.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {joke.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/[0.06] font-medium uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center">
                <h2 className="text-lg md:text-xl font-bold text-center leading-snug text-white">
                  {joke.question}
                </h2>
              </div>

              <div className="overflow-y-auto">
                <AnswerOptions
                  joke={joke}
                  onCorrect={handleCorrect}
                  onWrong={handleWrong}
                  revealed={revealed}
                />
              </div>
            </div>

            {/* Bottom hint */}
            <button
              onClick={handleFlipManual}
              className="px-4 py-2 text-center text-white/40 text-[11px] hover:text-white/60 transition-colors flex-shrink-0"
            >
              {revealed ? "See answer →" : "Tap to reveal answer"}
            </button>
          </div>

          {/* ===== BACK FACE ===== */}
          <div className="card-face card-back bg-card-back border border-white/[0.07] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">😂</span>
                <span className="text-[10px] text-white/50 font-medium uppercase tracking-wider">Answer</span>
              </div>
              <button
                onClick={() => setFlipped(false)}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Options
              </button>
            </div>

            {/* Answer content */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-3">
              <p className="text-xs text-white/50 mb-2 text-center">{joke.question}</p>
              <motion.h2
                initial={{ scale: 0.8, opacity: 0 }}
                animate={revealed ? { scale: 1, opacity: 1 } : {}}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="text-xl md:text-2xl font-black text-center gradient-text leading-snug"
              >
                {joke.answer}
              </motion.h2>
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-4 flex-shrink-0">
              <div className="flex items-center justify-center gap-3">
                {/* Like button */}
                <motion.button
                  onClick={handleLike}
                  whileTap={{ scale: 0.85 }}
                  className={`relative flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold transition-all duration-200 ${
                    liked
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  <motion.span
                    className="text-lg"
                    animate={laughBurst ? { scale: [1, 1.8, 1], rotate: [0, -15, 15, 0] } : {}}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    {liked ? "😂" : "🤍"}
                  </motion.span>
                  <span className="text-xs">{liked ? "Loved!" : "Ha Ha!"}</span>
                  {showLaughRipple && (
                    <span className="absolute inset-0 rounded-2xl border-2 border-rose-400 laugh-ripple" />
                  )}
                  <AnimatePresence>
                    {laughBurst && (
                      <>
                        {[...Array(3)].map((_, i) => (
                          <motion.span
                            key={i}
                            className="absolute text-xl pointer-events-none"
                            initial={{ opacity: 1, y: 0, x: (i - 1) * 14, scale: 0.6 }}
                            animate={{ opacity: 0, y: -50, scale: 1.2 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                          >
                            😂
                          </motion.span>
                        ))}
                      </>
                    )}
                  </AnimatePresence>
                </motion.button>

                {/* Share button */}
                <motion.button
                  onClick={handleShare}
                  whileTap={{ scale: 0.85 }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 font-semibold transition-all duration-200"
                >
                  <span className="text-lg">📤</span>
                  <span className="text-xs">Share</span>
                </motion.button>
              </div>

              {/* Swipe hint */}
              <p className="text-center text-white/30 text-[10px] mt-3 swipe-hint">
                ← back · next →
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
