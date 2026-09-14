import React from "react";
import { Card, Badge } from "./ui";
import { useDemoData, merchantName } from "../data/DataProvider";
import { humanize, num } from "../data/format";

// The merchant-facing rendering of a showcase persona (merchant §2.1).
//
// A merchant may see aggregate breakdowns of its own customers, and counts and labels only for
// cardholders it has never served. It may not see an identity. PersonaCard — name, age,
// occupation — is therefore a cardholder-facing component and belongs on the customer's own
// screen; this is what the merchant gets instead: the cohort, its count under the 250 floor, and
// the behavioural pattern that defines it, with no person attached to it.
//
// The count is the point. A pattern with a number beside it is a segment; the same pattern with a
// name and an age beside it is a customer record, and there is no screen here where the merchant
// is shown one.

export default function CohortCard({ role, label, count, suppressedReason, pattern, basis, emphasis = false }) {
  const { data } = useDemoData();
  const shown = humanize(pattern, data, merchantName);
  return (
    <Card className={`p-5 flex flex-col ${emphasis ? "border-brand/30 ring-1 ring-brand/10" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[13px] font-semibold text-ink leading-snug">{label}</div>
        {role && <Badge tone={role.tone}>{role.label}</Badge>}
      </div>

      {count !== null && count !== undefined ? (
        <div className="mb-3">
          <div className="font-num text-[30px] font-extrabold text-ink leading-none">{num(count)}</div>
          <div className="text-[11.5px] text-ink-secondary mt-1">cardholders in this cohort</div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-ink-light italic leading-none">No count shown</div>
          <div className="text-[11.5px] text-ink-secondary mt-1.5">{suppressedReason}</div>
        </div>
      )}

      <div className="mt-auto rounded-lg bg-canvas border border-border px-3 py-2.5">
        <div className="text-[11px] font-medium text-ink-secondary mb-0.5">Typical pattern in this cohort</div>
        <p className="text-[12.5px] text-ink leading-snug">{shown}</p>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Badge tone="neutral">Illustrative pattern — not a customer record</Badge>
      </div>
      {basis && <p className="text-[11px] text-ink-light mt-1.5 leading-snug">{basis}</p>}
    </Card>
  );
}
