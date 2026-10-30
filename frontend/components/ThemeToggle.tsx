"use client";

import { useEffect, useState } from "react";

// Animated light/dark switch. The look is pure CSS (driven by the .dark class on <html>),
// so it never flashes or mismatches; React state is only used for the accessibility label.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");

    // Fade colors for a moment, then remove the helper class again.
    root.classList.add("theme-anim");
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage can be blocked (private mode). The theme still changes for this visit.
    }
    setDark(next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle group relative inline-flex h-7 w-14 shrink-0 items-center overflow-hidden rounded-full border border-line bg-accent-soft transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* Tiny stars that fade in for dark mode */}
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 dark:opacity-100">
        <span className="absolute left-2 top-1.5 h-0.5 w-0.5 rounded-full bg-accent" />
        <span className="absolute left-4 top-4 h-[3px] w-[3px] rounded-full bg-accent/70" />
        <span className="absolute left-3 top-[18px] h-0.5 w-0.5 rounded-full bg-accent/60" />
      </span>

      {/* Knob: slides with a little spring, sun turns into a moon */}
      <span
        aria-hidden
        className="relative ml-0.5 flex h-[22px] w-[22px] translate-x-0 items-center justify-center rounded-full bg-accent text-on-accent shadow transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 dark:translate-x-[28px]"
      >
        <svg
          viewBox="0 0 24 24"
          className="absolute h-3.5 w-3.5 rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100"
          fill="currentColor"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </span>
    </button>
  );
}
