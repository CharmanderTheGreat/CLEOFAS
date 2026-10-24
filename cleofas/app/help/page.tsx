import type { Metadata } from "next";
import Link from "next/link";
import { CRISIS_LINES, EMERGENCY_NUMBER } from "@/lib/constants";

export const metadata: Metadata = { title: "Crisis resources" };

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">You&apos;re not alone</h1>
        <p className="text-muted">
          Venting can help, but some things are too heavy to carry alone. If you are thinking about hurting yourself or
          you feel unsafe, please reach out to someone right now.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Philippines · 24/7 crisis hotline</h2>
        <ul className="space-y-2 text-sm">
          {CRISIS_LINES.map((line) => (
            <li key={line.value} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted">{line.label}</span>
              <a href={`tel:${line.value.replace(/-/g, "")}`} className="text-lg font-semibold text-accent">
                {line.value}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Run by the National Center for Mental Health (NCMH). Numbers can change, so if one doesn&apos;t work, try another.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">In immediate danger?</h2>
        <p className="text-sm">
          Call{" "}
          <a href={`tel:${EMERGENCY_NUMBER}`} className="font-semibold text-accent">
            {EMERGENCY_NUMBER}
          </a>{" "}
          (national emergency number) or go to the nearest hospital. If you can, tell a person you trust where you are.
        </p>
      </section>

      <Link href="/" className="link-quiet text-sm">
        ← Back to Cleofas
      </Link>
    </div>
  );
}
