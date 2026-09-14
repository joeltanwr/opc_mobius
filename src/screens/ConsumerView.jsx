import React from "react";
import { Bell, Coffee, ChevronLeft } from "lucide-react";
import { useDemoData, merchantById } from "../data/DataProvider";
import { HERO_MERCHANT_ID } from "../data/constants";
import { pctOf } from "../data/format";
import { Badge, SectionTitle, BasisNote } from "../components/ui";

export default function ConsumerView() {
  const { data } = useDemoData();
  const merchant = merchantById(data.merchantProfiles, HERO_MERCHANT_ID);
  const campaign = data.campaignResults.completed.find(
    (c) => c.measured && c.merchant_id === HERO_MERCHANT_ID && c.cost.net_sign === "positive"
  );

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <SectionTitle
        eyebrow="Bonus · Cardholder view"
        title="The other side of the same offer"
        subtitle="What a cardholder like Bernice actually sees. OCBC sends it — the merchant never receives her identity, contact details, or the fact that she was targeted at all."
      />

      <div className="flex justify-center">
        <div className="w-[300px] rounded-[36px] border-8 border-ink bg-ink shadow-card-hover overflow-hidden">
          <div className="bg-white rounded-[28px] overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-navy text-white">
              <ChevronLeft size={16} />
              <span className="text-[12px] font-semibold">OCBC App</span>
              <Bell size={14} />
            </div>
            <div className="p-4">
              <div className="text-[11px] text-ink-light mb-3">Today, 1:47pm</div>
              <div className="rounded-2xl border border-border shadow-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center">
                    <Coffee size={15} className="text-brand" />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-ink">OCBC Offers</div>
                    <div className="text-[10px] text-ink-light">Personalised for you</div>
                  </div>
                </div>
                <p className="text-[13px] text-ink leading-snug mb-3">
                  ☕ Fancy trying somewhere new?{" "}
                  <span className="font-bold">{campaign.configuration.offer_headline}</span> at{" "}
                  <span className="font-bold">{merchant.name}</span>.
                </p>
                <p className="text-[11px] text-ink-light mb-3">{campaign.configuration.offer_terms}</p>
                <button className="w-full rounded-lg bg-brand text-white text-[12.5px] font-semibold py-2">
                  View offer
                </button>
              </div>
              <p className="text-[10px] text-ink-light mt-3 text-center px-4">
                Sent directly by OCBC. {merchant.name} will never see who received this.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto mt-8 text-center">
        <Badge tone="neutral">Illustrative — one screen, not a flow</Badge>
        <p className="text-[12.5px] text-ink-secondary mt-3">
          This closes the loop visually: the merchant approved a segment and an offer; OCBC delivered it directly,
          with the redemption ({pctOf(campaign.redemption.redemption_rate_pct)} of treated cardholders) feeding
          straight back into the results on screen 5.
        </p>
        <BasisNote>Offer terms from campaign_results.json. No cardholder identity is exposed anywhere in this build.</BasisNote>
      </div>
    </div>
  );
}
