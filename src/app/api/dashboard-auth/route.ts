import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  const correct = process.env.DASHBOARD_PIN;

  // If no PIN configured, allow access (dev mode)
  if (!correct) {
    return NextResponse.json({ ok: true });
  }

  if (pin === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
