// Janela deslizante de N dias terminando no dia selecionado.

function toDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** [inicio, fim] cobrindo os ultimos `days` dias (inclui `day`). */
export function rollingRange(day: string, days: number): [string, string] {
  const end = toDate(day);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));
  return [iso(start), iso(end)];
}

export function rollingLabel(days: number): string {
  return `últimos ${days} dias`;
}
