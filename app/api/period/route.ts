import { NextRequest, NextResponse } from "next/server";
import { getPeriodGains, getDays } from "@/lib/data";
import { rollingRange, rollingLabel } from "@/lib/period";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const world = p.get("world");
  const days = parseInt(p.get("days") || "7", 10);
  if (!world)
    return NextResponse.json({ error: "world obrigatorio" }, { status: 400 });
  if (!Number.isFinite(days) || days < 2 || days > 90)
    return NextResponse.json({ error: "days invalido (2..90)" }, { status: 400 });

  const day = p.get("day") || (await getDays(world))[0];
  if (!day)
    return NextResponse.json({ world, days, start: null, end: null, label: null, rows: [] });

  const [start, end] = rollingRange(day, days);
  const rows = await getPeriodGains(world, start, end);
  return NextResponse.json({
    world,
    days,
    start,
    end,
    label: rollingLabel(days),
    rows,
  });
}
