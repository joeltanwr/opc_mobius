import React from "react";
import { Card, Badge } from "./ui";
import { useDemoData } from "../data/DataProvider";
import { humanize } from "../data/format";

const ROLE_TONE = {
  h1_fingerprint: { label: "The fingerprint", tone: "brand" },
  h1_target_cohort: { label: "The target — never walked in", tone: "success" },
  h1_exclusion: { label: "The exclusion", tone: "warning" },
  h3_seasonal_apparel: { label: "Seasonal buyer", tone: "analytics" },
  h2_cold_start_category_peer: { label: "Cold-start reference", tone: "info" },
  dormant_reactivation: { label: "Honest limit", tone: "neutral" },
};

export default function PersonaCard({ persona, emphasis = false }) {
  const { data } = useDemoData();
  const role = ROLE_TONE[persona.cohort_membership?.[0]] ?? { label: "Illustrative", tone: "neutral" };
  const signature = humanize(persona.signature_pattern, data?.merchantDirectory);
  return (
    <Card className={`p-5 flex flex-col ${emphasis ? "border-brand/30 ring-1 ring-brand/10" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[15px] font-bold text-ink">
            {persona.name}, {persona.age}
          </div>
          <div className="text-[12px] text-ink-secondary">{persona.occupation}</div>
        </div>
        <Badge tone={role.tone}>{role.label}</Badge>
      </div>

      <p className="text-[13px] text-ink-secondary leading-relaxed flex-1">{persona.description}</p>

      <div className="mt-3 rounded-lg bg-canvas border border-border px-3 py-2.5">
        <p className="text-[13px] font-semibold text-ink leading-snug">"{signature}"</p>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Badge tone="neutral">Illustrative composite — not a customer record</Badge>
      </div>
    </Card>
  );
}
