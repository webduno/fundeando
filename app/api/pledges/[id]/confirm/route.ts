import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromRequest } from "@/lib/supabase/server";
import { verifySpidiSession } from "@/lib/spidi/server";
import type { Pledge } from "@/lib/types";

type Body = { guestToken?: string };

/**
 * POST /api/pledges/:id/confirm
 * Re-checks the pledge's SPIDI session against SPIDI and flips it to `paid`
 * or `expired`. Auth is optional for guest pledges (needs guestToken).
 * Never trusts the client's claim of success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: pledge, error } = await admin
    .from("pledges")
    .select("id, backer_id, status, spidi_session_id, guest_token")
    .eq("id", id)
    .maybeSingle<
      Pick<Pledge, "id" | "backer_id" | "status" | "spidi_session_id" | "guest_token">
    >();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pledge) return NextResponse.json({ error: "Pledge not found" }, { status: 404 });

  const isOwner = Boolean(user && pledge.backer_id && pledge.backer_id === user.id);
  const isGuest =
    !pledge.backer_id &&
    Boolean(pledge.guest_token) &&
    body.guestToken === pledge.guest_token;

  if (!isOwner && !isGuest) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (pledge.status !== "pending") {
    return NextResponse.json({ status: pledge.status });
  }

  const verdict = await verifySpidiSession(pledge.spidi_session_id);
  if (verdict === "pending") return NextResponse.json({ status: "pending" });

  const update =
    verdict === "paid"
      ? { status: "paid", paid_at: new Date().toISOString() }
      : { status: "expired" };

  const { error: updateError } = await admin
    .from("pledges")
    .update(update)
    .eq("id", pledge.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ status: update.status });
}
