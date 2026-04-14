"use client";

import { motion } from "framer-motion";

interface TimerCircleProps {
  timeLeft: number;
  duration: number;
  isRunning: boolean;
  isComplete: boolean;
  isPaused?: boolean;
  onClick?: () => void;
}

export default function TimerCircle({ timeLeft, duration, isRunning, isComplete, isPaused, onClick }: TimerCircleProps) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = timeLeft / duration;
  const offset = circumference * (1 - progress);

  const getColor = () => {
    if (isComplete) return "#10b981"; // green
    if (isPaused) return "#64748b"; // slate when paused
    if (timeLeft <= 3) return "#ef4444"; // red
    if (timeLeft <= 6) return "#f59e0b"; // yellow
    return "#8b5cf6"; // purple
  };

  return (
    <div
      className={`relative w-14 h-14 flex items-center justify-center ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 50 50">
        {/* Background circle */}
        <circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3"
        />
        {/* Progress circle */}
        <motion.circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
      </svg>
      {/* Timer text */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isPaused && !isComplete ? (
          <span className="text-sm" style={{ color: getColor() }}>⏸</span>
        ) : (
          <span
            className="text-sm font-bold transition-colors duration-200"
            style={{ color: getColor() }}
          >
            {isComplete ? "!" : Math.ceil(timeLeft)}
          </span>
        )}
      </div>
    </div>
  );
}
