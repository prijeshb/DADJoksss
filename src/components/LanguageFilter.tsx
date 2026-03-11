"use client";

import { motion } from "framer-motion";
import { useSessionStore } from "@/lib/store";
import type { Language } from "@/lib/types";

const filters: { value: Language | "mix"; label: string; emoji: string }[] = [
  { value: "mix", label: "Mix", emoji: "🌍" },
  { value: "english", label: "English", emoji: "🇺🇸" },
  { value: "hinglish", label: "Hinglish", emoji: "🇮🇳" },
];

interface LanguageFilterProps {
  onChange?: () => void;
}

export default function LanguageFilter({ onChange }: LanguageFilterProps) {
  const { languageFilter, setLanguageFilter } = useSessionStore();

  const handleSelect = (value: Language | "mix") => {
    setLanguageFilter(value);
    onChange?.();
  };

  return (
    <div className="flex items-center gap-1.5 bg-surface/50 rounded-2xl p-1 border border-white/5">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => handleSelect(filter.value)}
          className="relative px-3 py-1.5 rounded-xl text-xs font-medium transition-colors duration-200"
        >
          {languageFilter === filter.value && (
            <motion.div
              layoutId="activeFilter"
              className="absolute inset-0 bg-primary/20 border border-primary/30 rounded-xl"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-1">
            <span>{filter.emoji}</span>
            <span className={languageFilter === filter.value ? "text-primary" : "text-white/60"}>
              {filter.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
