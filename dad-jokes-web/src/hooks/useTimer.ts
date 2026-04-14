"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useTimer(duration: number = 5) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    setTimeLeft(duration);
    setIsRunning(true);
    setIsComplete(false);
  }, [duration]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setTimeLeft(duration);
    setIsComplete(false);
  }, [duration, stop]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          setIsRunning(false);
          setIsComplete(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const toggle = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  const progress = 1 - timeLeft / duration; // 0 to 1

  return { timeLeft, isRunning, isComplete, progress, start, stop, reset, toggle };
}
