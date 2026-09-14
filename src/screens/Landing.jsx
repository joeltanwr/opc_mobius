import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye } from "lucide-react";
import { MockDataBadge } from "../components/ui";
import { useDemoData, constantOf } from "../data/DataProvider";
import { num } from "../data/format";

export default function Landing() {
  // Landing renders outside the load gate, so the dataset line degrades to a claim with no number
  // rather than a number with no basis.
  const { data } = useDemoData();
  const sample = constantOf(data, "SAMPLE_CARDHOLDERS")?.value;

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="max-w-container mx-auto w-full px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center">
            <span className="text-white font-bold text-[14px]">M</span>
          </div>
          <span className="font-bold text-[17px] text-ink tracking-tight">Mobius</span>
        </div>
        <MockDataBadge />
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-container mx-auto w-full px-6 py-16">
          <div className="max-w-2xl">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-brand mb-4">
              OCBC × Merchant Intelligence — Prototype
            </div>
            <h1 className="text-[40px] leading-[1.15] font-bold text-ink mb-6">
              Your customers already walk in. <br />
              We can see where the rest of them are.
            </h1>
            <p className="text-[16px] text-ink-secondary leading-relaxed mb-8 max-w-xl">
              As a card issuer, OCBC sees where its cardholders spend — including at merchants
              it doesn't acquire. Mobius turns that into a named, reachable demand gap for
              every SME merchant: not a heatmap of the customers you already have, but a
              quantified count of the ones you don't.
            </p>

            <div className="flex items-center gap-4">
              <Link
                to="/target-customer"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-hover active:bg-brand-active transition-colors"
              >
                Enter the dashboard demo
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/consumer"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-secondary hover:text-ink"
              >
                <Eye size={14} />
                See the cardholder's side
              </Link>
            </div>

            <p className="text-[12px] text-ink-light mt-8 max-w-md">
              This entire prototype runs on a seeded, synthetic dataset
              {sample ? ` — ${num(sample)} cardholders, ` : " — "}no real transactions or
              identities. Every number on every screen traces back to a stated basis.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-container mx-auto w-full px-6 pb-8 text-[11px] text-ink-light">
        Built for a 6-minute pitch. Use ← → or 1–7 to move through the demo once inside.
      </footer>
    </div>
  );
}
