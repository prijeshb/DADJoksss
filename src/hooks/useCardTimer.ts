"use client";

import { useEffect, useRef } from "react";

export function useCardTimer(jokeId: string, onTimeUpdate: (jokeId: string, seconds: number) => void) {
  const startTimeRef = useRef<number>(Date.now());
  const jokeIdRef = useRef(jokeId);

  useEffect(() => {
    startTimeRef.current = Date.now();
    jokeIdRef.current = jokeId;

    return () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (elapsed > 0.5) {
        onTimeUpdate(jokeIdRef.current, elapsed);
      }
    };
  }, [jokeId, onTimeUpdate]);
}
