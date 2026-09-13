"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { authedFetch, readJson } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { formatUsdt, normalizeAlias } from "@/lib/spidi/shared";
import type { Campaign, Pledge, Profile } from "@/lib/types";

type PledgeRow = Pledge & { campaign: Pick<Campaign, "id" | "title"> | null };

type AccountData = {
  profile: Profile | null;
  pledges: PledgeRow[];
  campaigns: Campaign[];
};

/** All reads go through RLS with the user's own session. */
async function fetchAccount(userId: string): Promise<AccountData> {
  const supabase = getSupabaseBrowser();

  const [{ data: profile }, { data: pledges }, { data: campaigns }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, spidi_alias").eq("id", userId).maybeSingle<Profile>(),
    supabase
      .from("pledges")
      .select("*, campaign:campaigns(id, title)")
      .eq("backer_id", userId)
      .order("created_at", { ascending: false })
      .overrideTypes<PledgeRow[], { merge: false }>(),
    supabase
      .from("campaigns")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .overrideTypes<Campaign[], { merge: false }>(),
  ]);

  return { profile: profile ?? null, pledges: pledges ?? [], campaigns: campaigns ?? [] };
}

export default function AccountPage() {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [alias, setAlias] = useState("");
  const [pledges, setPledges] = useState<PledgeRow[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    return fetchAccount(userId).then((data) => {
      setProfile(data.profile);
      setDisplayName(data.profile?.display_name ?? "");
      setAlias(data.profile?.spidi_alias ?? "");
      setPledges(data.pledges);
      setCampaigns(data.campaigns);
    });
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return null;

  if (!user) {
    return (
      <p className="muted">
        <Link href="/login">Sign in</Link> to see your account.
      </p>
    );
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const normalized = normalizeAlias(alias);
    // Upsert covers users created before the trigger existed.
    const { error: upsertError } = await getSupabaseBrowser()
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName.trim() || null, spidi_alias: normalized || null });
    setBusy(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setMessage("Saved.");
    void load();
  }

  async function verify(pledgeId: string) {
    setError(null);
    try {
      const response = await authedFetch(`/api/pledges/${pledgeId}/confirm`, { method: "POST" });
      await readJson(response);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify.");
    }
  }

  return (
    <div className="stack">
      <h1>Account</h1>
      <p className="muted small">{user.email}</p>

      <form onSubmit={saveProfile} className="panel stack">
        <h2>Profile</h2>
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        </label>
        <label className="field">
          <span>SPIDI alias (receives pledges)</span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoComplete="off"
          />
        </label>
        {!profile?.spidi_alias && (
          <p className="muted small">Without an alias, your campaigns cannot receive pledges.</p>
        )}
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      <section className="stack">
        <h2>My campaigns</h2>
        {campaigns.length === 0 && (
          <p className="muted">
            None yet. <Link href="/campaigns/new">Start one</Link>.
          </p>
        )}
        {campaigns.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Goal</th>
                <th>Status</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campaigns/${c.id}`}>{c.title}</Link>
                  </td>
                  <td>USDT {formatUsdt(Number(c.goal_usdt))}</td>
                  <td>{c.status}</td>
                  <td>{new Date(c.deadline).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="stack">
        <h2>My pledges</h2>
        {pledges.length === 0 && <p className="muted">No pledges yet.</p>}
        {pledges.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pledges.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.campaign ? (
                      <Link href={`/campaigns/${p.campaign.id}`}>{p.campaign.title}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>USDT {formatUsdt(Number(p.amount_usdt))}</td>
                  <td>{p.status}</td>
                  <td>
                    {p.status === "pending" && (
                      <button type="button" className="link-button" onClick={() => void verify(p.id)}>
                        Verify payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
