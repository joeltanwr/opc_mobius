import React, { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { usePrivacyRules } from "../data/DataProvider";

export default function PrivacyAffordance() {
  const [open, setOpen] = useState(false);
  // The panel states the floor, so it reads the floor rather than repeating it.
  const { floor } = usePrivacyRules();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink transition-colors"
      >
        <ShieldCheck size={13} className="text-ink-light" strokeWidth={2} />
        <span>You see counts, not identities. OCBC sends every offer.</span>
        <span className="underline underline-offset-2 decoration-ink-light">What this means</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-brand" />
                <h3 className="text-[16px] font-semibold text-ink">What this merchant can and can't see</h3>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-light hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink-secondary">
              <p>
                <span className="font-semibold text-ink">Its own transactions —</span> in full. Line
                items, timestamps, tickets, repeat visits. This is data the merchant already owns.
              </p>
              <p>
                <span className="font-semibold text-ink">Everyone else's cardholders —</span> only as
                counts with labels, never as records. There is no cardholder-level table anywhere in
                this product, including behind the scenes.
              </p>
              <ul className="ml-4 list-disc space-y-1.5 marker:text-ink-light">
                <li>Segments below {floor} cardholders never render a size or profile — only a suppressed state.</li>
                <li>No free-form filtering. Merchants choose from pre-computed segments only.</li>
                <li>No export, download, or print of segment data.</li>
                <li>No demographic breakdown of cardholders the merchant has never served.</li>
                <li>OCBC delivers every offer directly. Merchants never receive an identity or contact detail.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
