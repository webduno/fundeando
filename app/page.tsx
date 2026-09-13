import { CampaignCard } from "@/components/CampaignCard";
import { listActiveCampaigns } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const campaigns = await listActiveCampaigns();

  return (
    <div className="stack">
      <div>
        <h1>Active campaigns</h1>
        <p className="muted">
          Back a project with USDT through Binance Pay. Funds go straight to the creator.
        </p>
      </div>

      {campaigns.length === 0 && <p className="muted">No campaigns yet.</p>}

      <div className="grid">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </div>
  );
}
