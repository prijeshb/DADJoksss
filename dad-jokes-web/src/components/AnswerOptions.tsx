"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DadJoke } from "@/lib/types";

interface AnswerOptionsProps {
  joke: DadJoke;
  onCorrect: () => void;
  onWrong: () => void;
  revealed: boolean;
}

const WRONG_MESSAGES = [
  "Think about it... 🤔",
  "Use your brain! 🧠",
  "Not your cup of tea! ☕",
  "Almost there... nah! 😅",
  "Your dad would be disappointed 😂",
];

export default function AnswerOptions({ joke, onCorrect, onWrong, revealed }: AnswerOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongMessage, setWrongMessage] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shakeIndex, setShakeIndex] = useState<number | null>(null);
  const [lightUpIndex, setLightUpIndex] = useState<number | null>(null);

  // Shuffle answers once per joke
  const shuffledAnswers = useMemo(() => {
    const all = [joke.answer, ...joke.wrongAnswers];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [joke.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (answer: string, index: number) => {
    if (isCorrect || revealed) return;

    setSelected(answer);

    if (answer === joke.answer) {
      setIsCorrect(true);
      setWrongMessage(null);
      onCorrect();
    } else {
      const newCount = wrongCount + 1;
      setWrongCount(newCount);
      setShakeIndex(index);
      setLightUpIndex(index);
      setWrongMessage(WRONG_MESSAGES[Math.min(newCount - 1, WRONG_MESSAGES.length - 1)]);
      onWrong();
      setTimeout(() => setShakeIndex(null), 500);
      setTimeout(() => setLightUpIndex(null), 600);
    }
  };

  const getOptionStyle = (answer: string) => {
    if (revealed || isCorrect) {
      if (answer === joke.answer) {
        return "border-emerald-500 bg-emerald-500/20 text-emerald-300";
      }
      if (selected === answer && answer !== joke.answer) {
        return "border-red-500 bg-red-500/20 text-red-300";
      }
      return "border-white/10 bg-white/5 text-white/40";
    }
    if (selected === answer && answer !== joke.answer) {
      return "border-red-500 bg-red-500/20 text-red-300";
    }
    return "border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/30 cursor-pointer";
  };

  return (
    <div className="space-y-1.5">
      {/* Wrong answer message */}
      <AnimatePresence mode="wait">
        {wrongMessage && !isCorrect && !revealed && (
          <motion.div
            key={wrongMessage}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center text-xs font-semibold text-amber-400 py-1"
          >
            {wrongMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer options */}
      {shuffledAnswers.map((answer, index) => (
        <motion.button
          key={`${joke.id}-${index}`}
          onClick={() => handleSelect(answer, index)}
          className={`w-full text-left px-3 py-2 rounded-lg border transition-all duration-200 text-xs ${getOptionStyle(answer)} ${shakeIndex === index ? "shake" : ""} ${lightUpIndex === index ? "lighten-up" : ""}`}
          whileTap={!isCorrect && !revealed ? { scale: 0.97 } : {}}
          disabled={isCorrect || revealed}
        >
          <span className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">
              {String.fromCharCode(65 + index)}
            </span>
            <span className="line-clamp-2">{answer}</span>
          </span>
          {(revealed || isCorrect) && answer === joke.answer && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="float-right text-emerald-400"
            >
              ✓
            </motion.span>
          )}
        </motion.button>
      ))}
    </div>
  );
}
