import { NextRequest, NextResponse } from "next/server";
import { getPlayer } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const world = p.get("world");
  const name = p.get("name");
  if (!world || !name)
    return NextResponse.json({ error: "world e name obrigatorios" }, { status: 400 });
  return NextResponse.json({ world, name, series: await getPlayer(world, name) });
}
