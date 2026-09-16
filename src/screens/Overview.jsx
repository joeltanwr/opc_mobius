import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, SectionTitle, BasisNote } from "../components/ui";
import { useDemoData, constantOf } from "../data/DataProvider";
import { num } from "../data/format";
import { SCREENS, OPTIONAL_SCREENS, screenNum, maxScreenNum } from "../data/constants";

// Merchant view, nav screen 1 — "Overview". What Mobius is, the loop it closes, and the way into
// the merchant's own numbers. The merchant prompt defines no tab for this, so it carries a nav
// position and no spec tab number: the "Tab N" badges on the other screens are prompt sections,
// which is a different numbering from the nav and always has been.
//
// Formerly the standalone landing page at "/": it is a tab now, so the pitch opens inside the
// chrome rather than stepping through a title slide into it, and the privacy line and the
// mock-data marker are on screen from the first second.
//
// It renders inside the load gate, unlike the old landing page, so the dataset line can state the
// sample size from the constants manifest rather than degrading to a claim with no number.

// The flywheel diagram. A static asset rather than something drawn in JSX, because it is the one
// picture in the deck that also appears in the slides and the two must not drift apart.
// BASE_URL-relative, matching DataProvider — a bare "/images/..." breaks under a project-path
// deploy, which is exactly where this is hosted.
const FLYWHEEL_SRC = `${import.meta.env.BASE_URL}images/mobius-flywheel.jpg`;

export default function Overview() {
  const { data } = useDemoData();
  const sample = constantOf(data, "SAMPLE_CARDHOLDERS")?.value;
  const nextScreen = SCREENS[1];
  const maxNum = maxScreenNum(SCREENS, OPTIONAL_SCREENS);

  // One screen, no scroll. The measured chrome above and below is 141px at projector width (a 65px
  // sticky header and a 76px footer that wraps), so the page takes a definite height of 100dvh less
  // 9rem. A definite height, not a minimum: `flex-1` has nothing to divide if the box is free to
  // grow, which is why min-h left the diagram at full size.
  //
  // Words left, picture right, from `lg` up. Stacked, the title and tagline spent the top third of
  // a projector slide on four lines of text and pushed the diagram into whatever was left; beside
  // each other they share the same vertical band, and the diagram gets the full column height
  // instead of the remainder. Below `lg` it goes back to a column, because two 45%-width columns
  // on a laptop screen is worse than either.
  //
  // The diagram is still the only elastic block: `min-h-0` plus object-contain lets it take what
  // the row can spare and shrink rather than push anything off the bottom.
  return (
    <div className="max-w-container mx-auto px-6 py-5 flex flex-col h-[calc(100dvh-9rem)] min-h-[30rem]">
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 lg:gap-10 lg:items-center">
        <div className="min-w-0 flex flex-col justify-center">
          <SectionTitle
            eyebrow={`Screen ${screenNum("overview")} · Overview`}
            title="A click away from your customer"
            subtitle="See who already spends with you, then reward the OCBC cardholders most likely to come back — without building a loyalty programme from scratch."
          />

          <div className="flex flex-wrap items-center gap-4 mt-1">
            <Link
              to={nextScreen.path}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-hover active:bg-brand-active transition-colors"
            >
              Sign up now
              <ArrowRight size={16} />
            </Link>
            {/* The link across to the cardholder app is gone: the persona switcher in the header
                is the one way between the three views now, and a second route to one of them
                invites the question of why the other two have no link of their own. */}
          </div>

          <p className="text-[12px] text-ink-light mt-4 max-w-xl">
            Seeded synthetic dataset{sample ? ` — ${num(sample)} cardholders` : ""}, no real transactions or identities,
            every number traced to a stated basis. Use ← → or 1–{maxNum} to move through the demo.
          </p>
        </div>

        <Card className="p-4 min-h-0 h-full flex flex-col">
          {/* The diagram carries its own title and all four numbered steps, so it replaces the
              heading and the prose that used to introduce it rather than sitting under them — a
              caption restating what the picture already says is one more thing that can drift
              out of step with it. */}
          <img
            src={FLYWHEEL_SRC}
            alt="The Mobius flywheel — connecting business and customers. A figure-of-eight loop with OCBC (AI, digital, data) at the crossing point, retail customers on the left and SME businesses on the right. Step 1: retail customers generate data — OCBC uses customer retail data (spending, preferences, behaviour) to build insights. Step 2: OCBC helps SME businesses discover insights — it analyses the data to help SMEs understand customer profiles and identify potential demand gaps. Step 3: OCBC helps SMEs roll out targeted promotions — SMEs reach the right customers with personalised offers and rewards, driving sales and loyalty. Step 4: the loop keeps improving — OCBC continuously uses new data and campaign results to refine the reward programme for both SMEs and retail customers."
            className="flex-1 min-h-0 w-full object-contain"
          />
          <div className="shrink-0">
            <BasisNote>
              Illustrative diagram of the model, not a figure from the dataset. The merchant funds the reward in full at
              step 3, and no cardholder identity reaches the merchant at any point in the loop.
            </BasisNote>
          </div>
        </Card>
      </div>
    </div>
  );
}
