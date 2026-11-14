"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const sync = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    };
    const t = setTimeout(sync, 0);
    return () => clearTimeout(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("clauset-theme", next);
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
