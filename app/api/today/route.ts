import { NextRequest, NextResponse } from "next/server";
import { getToday } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const world = req.nextUrl.searchParams.get("world");
  if (!world)
    return NextResponse.json({ error: "world obrigatorio" }, { status: 400 });
  return NextResponse.json(await getToday(world));
}
