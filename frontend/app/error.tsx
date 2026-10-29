"use client";

// Shown when a page fails to load data (instead of silently rendering an empty page).
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted">We couldn&apos;t load this page. Please try again.</p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
