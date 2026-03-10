import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  const correct = process.env.DASHBOARD_PIN;

  if (!correct) {
    return NextResponse.json({ ok: false, error: "PIN not configured" }, { status: 500 });
  }

  if (pin === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
