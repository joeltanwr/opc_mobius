import React from "react";
import { Card, Badge } from "./ui";
import { useDemoData, merchantName } from "../data/DataProvider";
import { humanize } from "../data/format";

// The CARDHOLDER-FACING persona rendering: name, age, occupation, the lot.
//
// This belongs only where the cardholder is the viewer — their own screen, their own details,
// which is exactly the case in which individual grain is appropriate. It must never appear in a
// merchant-facing view: merchant §2.1 allows the merchant aggregate breakdowns of its own
// customers and counts and labels only for cardholders it has never served, and a card carrying a
// name and an age is neither. The merchant-facing equivalent is CohortCard.
//
// Keyed on showcase_personas.json `role` — the pipeline's own label for what each persona is
// in the pitch. cohort_membership carries the machine-readable cohort, not a display role.
const ROLE_TONE = {
  fingerprint: { label: "The fingerprint", tone: "brand" },
  target: { label: "The target — never walked in", tone: "success" },
  exclusion: { label: "The exclusion", tone: "warning" },
  seasonal: { label: "Seasonal buyer", tone: "analytics" },
  suppressed_push: { label: "Push suppressed — feed only", tone: "info" },
  dormant: { label: "Honest limit", tone: "neutral" },
};

export default function PersonaCard({ persona, emphasis = false }) {
  const { data } = useDemoData();
  const role = ROLE_TONE[persona.role] ?? { label: "Illustrative", tone: "neutral" };
  const signature = humanize(persona.signature_pattern, data, merchantName);
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
