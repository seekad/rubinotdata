"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt, fmtShort, VOC_COLORS } from "@/lib/format";
import type { GainRow, BoardRow, PlayerPoint } from "@/lib/types";

type Meta = { worlds: string[]; days: string[]; source: string };
type View = "day" | "d7" | "d30" | "board";

const VIEWS: { key: View; label: string; name?: string; days?: number }[] = [
  { key: "day", label: "📈 Dia" },
  { key: "d7", label: "🗓️ Semana", name: "Semana", days: 7 },
  { key: "d30", label: "📅 Mês", name: "Mês", days: 30 },
  { key: "board", label: "🏆 Ranking total" },
];

function VocBadge({ v }: { v: string | null }) {
  if (!v) return null;
  const c = VOC_COLORS[v] ?? "var(--muted)";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
      {v}
    </span>
  );
}

export default function Page() {
  const [worlds, setWorlds] = useState<string[]>([]);
  const [world, setWorld] = useState<string>("");
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState<string>("");
  const [view, setView] = useState<View>("day");
  const [source, setSource] = useState<string>("");

  const [rows, setRows] = useState<GainRow[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [pill, setPill] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<{ name: string; series: PlayerPoint[] } | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => {
        setWorlds(m.worlds);
        setSource(m.source);
        setWorld(m.worlds.includes("Spectrum") ? "Spectrum" : m.worlds[0] ?? "");
      });
  }, []);

  useEffect(() => {
    if (!world) return;
    fetch(`/api/meta?world=${encodeURIComponent(world)}`)
      .then((r) => r.json())
      .then((m: Meta) => {
        setDays(m.days);
        setDay(m.days[0] ?? "");
      });
  }, [world]);

  const loadData = useCallback(async () => {
    if (!world || !day) return setLoading(false);
    setLoading(true);
    const qs = `world=${encodeURIComponent(world)}&day=${day}`;
    if (view === "board") {
      const b = await fetch(`/api/leaderboard?${qs}`).then((r) => r.json());
      setBoard(b.rows ?? []);
      setPill(b.day ?? "");
    } else if (view === "day") {
      const g = await fetch(`/api/gains?${qs}`).then((r) => r.json());
      setRows(g.rows ?? []);
      setPill(g.prevDay ? `${g.day} vs ${g.prevDay}` : g.day ?? "");
    } else {
      const cfg = VIEWS.find((v) => v.key === view)!;
      const days = cfg.days ?? 7;
      const p = await fetch(`/api/period?${qs}&days=${days}`).then((r) => r.json());
      setRows(p.rows ?? []);
      setPill(
        p.start
          ? `${cfg.name} · ${p.start} → ${p.end} (${days} dias)`
          : ""
      );
    }
    setLoading(false);
  }, [world, day, view]);

  useEffect(() => {
    setPlayer(null);
    loadData();
  }, [loadData]);

  const openPlayer = useCallback(
    async (name: string) => {
      const d = await fetch(
        `/api/player?world=${encodeURIComponent(world)}&name=${encodeURIComponent(name)}`
      ).then((r) => r.json());
      setPlayer({ name, series: d.series ?? [] });
    },
    [world]
  );

  const xpLabel = view === "day" ? "XP no dia" : "XP no período";
  const emptyMsg =
    view === "day"
      ? "Sem comparação ainda — preciso de 2 dias de coleta. Os números aparecem após o próximo server save."
      : "Sem dados suficientes no período ainda. Colete por alguns dias.";

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-5">
          <h1 className="text-xl font-bold tracking-wide text-[var(--gold2)]">
            ⚔️ RubinotData
          </h1>
          <span className="text-xs text-[var(--muted)]">XP por dia · server save</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (search.trim()) openPlayer(search.trim());
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="buscar jogador…"
                className="w-44 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
              />
            </form>
            <Select value={world} onChange={setWorld} options={worlds} />
            <Select value={day} onChange={setDay} options={days} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {player ? (
          <PlayerPanel world={world} data={player} onClose={() => setPlayer(null)} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {VIEWS.map((v) => (
                <Tab key={v.key} on={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}
                </Tab>
              ))}
              <span className="ml-auto text-[11px] text-[var(--muted)]">
                fonte: {source || "…"}
              </span>
            </div>

            {pill && (
              <div className="mb-3">
                <Pill>{pill}</Pill>
              </div>
            )}

            {loading ? (
              <Note>carregando…</Note>
            ) : view === "board" ? (
              <BoardView rows={board} onPlayer={openPlayer} />
            ) : (
              <RankTable
                rows={rows}
                xpLabel={xpLabel}
                emptyMsg={emptyMsg}
                onPlayer={openPlayer}
              />
            )}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-10 pt-4 text-center text-[11px] text-[var(--muted)]">
        dados públicos de highscores · atualizado a cada server save
      </footer>
    </div>
  );
}

// --- subcomponentes ---------------------------------------------------------

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-lg border px-3.5 py-1.5 text-sm transition " +
        (on
          ? "border-[var(--gold)] bg-[#221a10] text-[var(--gold2)]"
          : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--txt)]")
      }
    >
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-12 text-center text-[var(--muted)]">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      {children}
    </div>
  );
}

function RankTable({
  rows,
  xpLabel,
  emptyMsg,
  onPlayer,
}: {
  rows: GainRow[];
  xpLabel: string;
  emptyMsg: string;
  onPlayer: (n: string) => void;
}) {
  const max = useMemo(
    () => Math.max(1, ...rows.map((r) => r.xp_gained ?? 0)),
    [rows]
  );
  if (!rows.length) return <Note>{emptyMsg}</Note>;

  return (
    <Card>
      <table className="w-full border-collapse">
        <thead>
          <Th>
            <td className="w-12">#</td>
            <td>Jogador</td>
            <td className="w-44">{xpLabel}</td>
            <td className="w-24 text-right">Level</td>
          </Th>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className="border-t border-[var(--line)] hover:bg-[#181410]">
              <td className="px-4 py-2.5 text-sm text-[var(--muted)]">{i + 1}</td>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => onPlayer(r.name)}
                  className="font-semibold text-[var(--gold2)] hover:underline"
                >
                  {r.name}
                </button>
                <div className="mt-0.5">
                  <VocBadge v={r.vocation} />
                </div>
              </td>
              <td className="px-4 py-2.5">
                <div
                  className={
                    "tabular text-sm font-semibold " +
                    ((r.xp_gained ?? 0) >= 0 ? "text-[var(--gold2)]" : "text-[var(--red)]")
                  }
                >
                  {fmt(r.xp_gained)}
                  <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                    ({fmtShort(r.xp_gained)})
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-[#241d13]">
                  <div
                    className="xpbar"
                    style={{ width: `${Math.max(2, ((r.xp_gained ?? 0) / max) * 100)}%` }}
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right tabular text-sm">
                {r.level}
                {r.levels_gained ? (
                  <span className="ml-1 text-xs text-[var(--green)]">+{r.levels_gained}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function BoardView({
  rows,
  onPlayer,
}: {
  rows: BoardRow[];
  onPlayer: (n: string) => void;
}) {
  if (!rows.length) return <Note>Sem dados para este dia.</Note>;
  return (
    <Card>
      <table className="w-full border-collapse">
        <thead>
          <Th>
            <td className="w-12">#</td>
            <td>Jogador</td>
            <td className="w-28 text-right">Level</td>
            <td className="w-48 text-right">Experiência</td>
          </Th>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className="border-t border-[var(--line)] hover:bg-[#181410]">
              <td className="px-4 py-2.5 text-sm text-[var(--muted)]">{i + 1}</td>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => onPlayer(r.name)}
                  className="font-semibold text-[var(--gold2)] hover:underline"
                >
                  {r.name}
                </button>
                <div className="mt-0.5">
                  <VocBadge v={r.vocation} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right tabular text-sm">{r.level}</td>
              <td className="px-4 py-2.5 text-right tabular text-sm">{fmt(r.experience)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PlayerPanel({
  world,
  data,
  onClose,
}: {
  world: string;
  data: { name: string; series: PlayerPoint[] };
  onClose: () => void;
}) {
  const series = data.series;
  const last = series[series.length - 1];
  const maxGain = Math.max(1, ...series.map((s) => s.xp_gained ?? 0));

  const sumLast = (n: number) =>
    series
      .slice(-n)
      .reduce((acc, s) => acc + (s.xp_gained ?? 0), 0);
  const week = sumLast(7);
  const month = sumLast(30);

  return (
    <div>
      <button
        onClick={onClose}
        className="mb-4 text-sm text-[var(--muted)] hover:text-[var(--gold2)]"
      >
        ← voltar
      </button>

      {!series.length ? (
        <Note>“{data.name}” não encontrado em {world}.</Note>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-2xl font-bold text-[var(--gold2)]">{data.name}</div>
              <div className="text-sm text-[var(--muted)]">
                {world} · level {last?.level ?? "-"} · exp {fmt(last?.experience)}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <StatTile label="XP último dia" value={last?.xp_gained} />
              <StatTile label="Últimos 7d" value={week} />
              <StatTile label="Últimos 30d" value={month} />
            </div>
          </div>

          <Card>
            <div className="flex items-end gap-1.5 px-4 py-4" style={{ height: 140 }}>
              {series.map((s) => {
                const h = s.xp_gained ? (s.xp_gained / maxGain) * 100 : 0;
                return (
                  <div
                    key={s.game_day}
                    className="group flex flex-1 flex-col items-center justify-end"
                    style={{ height: "100%" }}
                    title={`${s.game_day}: ${fmt(s.xp_gained)} XP`}
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[var(--gold)] to-[var(--gold2)] transition group-hover:opacity-80"
                      style={{ height: `${Math.max(2, h)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="mt-4">
            <Card>
              <table className="w-full border-collapse">
                <thead>
                  <Th>
                    <td>Dia</td>
                    <td className="text-right">Level</td>
                    <td className="text-right">Exp total</td>
                    <td className="w-40 text-right">XP no dia</td>
                  </Th>
                </thead>
                <tbody>
                  {series
                    .slice()
                    .reverse()
                    .map((s) => (
                      <tr key={s.game_day} className="border-t border-[var(--line)]">
                        <td className="px-4 py-2.5 text-sm">{s.game_day}</td>
                        <td className="px-4 py-2.5 text-right tabular text-sm">{s.level}</td>
                        <td className="px-4 py-2.5 text-right tabular text-sm">
                          {fmt(s.experience)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-sm font-semibold text-[var(--gold2)]">
                          {s.xp_gained == null ? (
                            <span className="text-[var(--muted)]">(base)</span>
                          ) : (
                            fmt(s.xp_gained)
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-right">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-lg font-bold text-[var(--gold2)]">{fmt(value)}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <tr className="[&>td]:px-4 [&>td]:py-2.5 [&>td]:text-left [&>td]:text-[11px] [&>td]:font-semibold [&>td]:uppercase [&>td]:tracking-wide [&>td]:text-[var(--muted)]">
      {children}
    </tr>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
      {children}
    </span>
  );
}
