export type Profile = {
  id: string;
  display_name: string | null;
  spidi_alias: string | null;
};

export type CampaignStatus = "draft" | "active" | "closed";

export type Campaign = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  goal_usdt: number;
  deadline: string;
  status: CampaignStatus;
  created_at: string;
};

export type CampaignTotals = {
  campaign_id: string;
  raised_usdt: number;
  backer_count: number;
};

export type PledgeStatus = "pending" | "paid" | "failed" | "expired";

export type Pledge = {
  id: string;
  campaign_id: string;
  /** null when the backer pledged without signing in. */
  backer_id: string | null;
  amount_usdt: number;
  amount_bs: number;
  bcv_rate: number;
  recipient_alias: string;
  spidi_session_id: string;
  /** Set for guest pledges; returned at create, required to confirm. */
  guest_token: string | null;
  status: PledgeStatus;
  paid_at: string | null;
  created_at: string;
};

export type CampaignWithTotals = Campaign & {
  raised_usdt: number;
  backer_count: number;
  owner: Pick<Profile, "display_name" | "spidi_alias"> | null;
};
