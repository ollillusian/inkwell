import { NextResponse } from "next/server";
import { getVapidPublicKey, pushConfigured } from "@/lib/push/vapid";

export async function GET() {
  const key = getVapidPublicKey();
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: key,
  });
}
