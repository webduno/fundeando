import { notFound } from "next/navigation";
import { daysLeft, progressPercent } from "@/components/CampaignCard";
import { PledgeForm } from "@/components/PledgeForm";
import { getCampaign } from "@/lib/campaigns";
import { formatUsdt } from "@/lib/spidi/shared";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const pct = progressPercent(campaign.raised_usdt, campaign.goal_usdt);
  const remaining = daysLeft(campaign.deadline);
  const acceptingPledges = campaign.status === "active" && remaining > 0;

  return (
    <div className="stack">
      <div>
        <h1>{campaign.title}</h1>
        <p className="muted small">
          by {campaign.owner?.display_name ?? "anonymous"}
          {campaign.owner?.spidi_alias ? ` · @${campaign.owner.spidi_alias}` : ""}
        </p>
      </div>

      <div className="panel">
        <div className="progress" aria-label={`${pct}% funded`}>
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p>
          <strong>USDT {formatUsdt(campaign.raised_usdt)}</strong> raised of{" "}
          {formatUsdt(campaign.goal_usdt)} · {campaign.backer_count} backers · {remaining} days left
        </p>
        <PledgeForm
          campaignId={campaign.id}
          recipientAlias={campaign.owner?.spidi_alias ?? null}
          acceptingPledges={acceptingPledges}
        />
      </div>

      <section>
        <h2>About</h2>
        <p className="description">{campaign.description || "No description."}</p>
      </section>
    </div>
  );
}
