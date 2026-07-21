import { NextResponse } from "next/server";
import { dataSource } from "@/lib/data";

export const dynamic = "force-dynamic";

// Diagnostico: mostra se as variaveis chegam na funcao (sem vazar valores).
export async function GET() {
  return NextResponse.json({
    source: dataSource,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    databaseUrlHost: process.env.DATABASE_URL
      ? (process.env.DATABASE_URL.split("@")[1] || "").split("/")[0]
      : null,
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    node: process.version,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
  });
}
