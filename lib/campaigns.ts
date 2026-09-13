import { getSupabaseAnon } from "./supabase/server";
import type { Campaign, CampaignTotals, CampaignWithTotals, Profile } from "./types";

type CampaignRow = Campaign & {
  owner: Pick<Profile, "display_name" | "spidi_alias"> | null;
};

function withTotals(rows: CampaignRow[], totals: CampaignTotals[]): CampaignWithTotals[] {
  const byId = new Map(totals.map((t) => [t.campaign_id, t]));
  return rows.map((row) => {
    const t = byId.get(row.id);
    return {
      ...row,
      goal_usdt: Number(row.goal_usdt),
      raised_usdt: Number(t?.raised_usdt ?? 0),
      backer_count: Number(t?.backer_count ?? 0),
    };
  });
}

const CAMPAIGN_SELECT =
  "id, owner_id, title, description, goal_usdt, deadline, status, created_at, owner:profiles(display_name, spidi_alias)";

/** Public list. RLS already limits anon to status = 'active'. */
export async function listActiveCampaigns(): Promise<CampaignWithTotals[]> {
  const supabase = getSupabaseAnon();
  const { data: rows, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .overrideTypes<CampaignRow[], { merge: false }>();
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const { data: totals } = await supabase
    .from("campaign_totals")
    .select("campaign_id, raised_usdt, backer_count")
    .in("campaign_id", rows.map((r) => r.id))
    .overrideTypes<CampaignTotals[], { merge: false }>();

  return withTotals(rows, totals ?? []);
}

export async function getCampaign(id: string): Promise<CampaignWithTotals | null> {
  const supabase = getSupabaseAnon();
  const { data: row, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<CampaignRow, { merge: false }>();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const { data: totals } = await supabase
    .from("campaign_totals")
    .select("campaign_id, raised_usdt, backer_count")
    .eq("campaign_id", id)
    .overrideTypes<CampaignTotals[], { merge: false }>();

  return withTotals([row], totals ?? [])[0];
}
