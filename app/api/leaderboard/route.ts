import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, getDays } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const world = p.get("world");
  if (!world) return NextResponse.json({ error: "world obrigatorio" }, { status: 400 });
  const day = p.get("day") || (await getDays(world))[0];
  if (!day) return NextResponse.json({ day: null, rows: [] });
  return NextResponse.json({ day, rows: await getLeaderboard(world, day) });
}
