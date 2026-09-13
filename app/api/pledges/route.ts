import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromRequest } from "@/lib/supabase/server";
import { createSpidiSession } from "@/lib/spidi/server";
import { MIN_PLEDGE_USDT, normalizeAlias } from "@/lib/spidi/shared";
import type { Campaign, Pledge, Profile } from "@/lib/types";

type Body = { campaignId?: string; amountUsdt?: number };

/**
 * POST /api/pledges
 * Creates the SPIDI session server-side (amounts computed here) and records a
 * `pending` pledge. The browser then drives Binance Pay with the returned session id.
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const campaignId = body?.campaignId;
  const amountUsdt = Number(body?.amountUsdt);

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amountUsdt) || amountUsdt < MIN_PLEDGE_USDT) {
    return NextResponse.json(
      { error: `Minimum pledge is ${MIN_PLEDGE_USDT} USDT` },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, owner_id, title, status, deadline")
    .eq("id", campaignId)
    .maybeSingle<Pick<Campaign, "id" | "owner_id" | "title" | "status" | "deadline">>();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign is not accepting pledges" }, { status: 409 });
  }
  if (new Date(campaign.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: "Campaign deadline has passed" }, { status: 409 });
  }

  const { data: owner } = await admin
    .from("profiles")
    .select("id, display_name, spidi_alias")
    .eq("id", campaign.owner_id)
    .maybeSingle<Profile>();

  const recipientAlias = normalizeAlias(owner?.spidi_alias ?? "");
  if (!recipientAlias) {
    return NextResponse.json(
      { error: "The creator has not set a SPIDI alias yet" },
      { status: 409 },
    );
  }

  const { data: backer } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "display_name">>();

  const amount = Math.round(amountUsdt * 100) / 100;

  let session;
  try {
    session = await createSpidiSession({
      recipientAlias,
      usdtAmount: amount,
      payerLabel: backer?.display_name || user.email || "Backer",
      concept: `Pledge: ${campaign.title}`.slice(0, 60),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SPIDI session failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: pledge, error: insertError } = await admin
    .from("pledges")
    .insert({
      campaign_id: campaign.id,
      backer_id: user.id,
      amount_usdt: session.usdtAmount,
      amount_bs: session.bsAmount,
      bcv_rate: session.bcvRate,
      recipient_alias: session.recipientAlias,
      spidi_session_id: session.sessionId,
      status: "pending",
    })
    .select("id, spidi_session_id, amount_usdt, amount_bs, bcv_rate, status")
    .single<Pick<Pledge, "id" | "spidi_session_id" | "amount_usdt" | "amount_bs" | "bcv_rate" | "status">>();

  if (insertError || !pledge) {
    return NextResponse.json(
      { error: insertError?.message ?? "Could not record pledge" },
      { status: 500 },
    );
  }

  return NextResponse.json({ pledge }, { status: 201 });
}
