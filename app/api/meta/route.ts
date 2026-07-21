import { NextRequest, NextResponse } from "next/server";
import { getWorlds, getDays, dataSource } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const world = req.nextUrl.searchParams.get("world");
  const worlds = await getWorlds();
  const days = world ? await getDays(world) : [];
  return NextResponse.json({ worlds, days, source: dataSource });
}
