import Link from "next/link";
import { formatUsdt } from "@/lib/spidi/shared";
import type { CampaignWithTotals } from "@/lib/types";

export function progressPercent(raised: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((raised / goal) * 100));
}

export function daysLeft(deadline: string) {
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function CampaignCard({ campaign }: { campaign: CampaignWithTotals }) {
  const pct = progressPercent(campaign.raised_usdt, campaign.goal_usdt);

  return (
    <Link href={`/campaigns/${campaign.id}`} className="card">
      <h3>{campaign.title}</h3>
      <p className="muted small">
        by {campaign.owner?.display_name ?? "anonymous"}
        {campaign.owner?.spidi_alias ? ` · @${campaign.owner.spidi_alias}` : ""}
      </p>
      <div className="progress" aria-label={`${pct}% funded`}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="small">
        USDT {formatUsdt(campaign.raised_usdt)} of {formatUsdt(campaign.goal_usdt)} ·{" "}
        {campaign.backer_count} backers · {daysLeft(campaign.deadline)} days left
      </p>
    </Link>
  );
}
