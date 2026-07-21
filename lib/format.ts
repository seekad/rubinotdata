export function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return Number(n).toLocaleString("pt-BR");
}

/** Abrevia numeros grandes de XP: 1.2kkk / 340kk / 5.1kk */
export function fmtShort(n: number | null | undefined): string {
  if (n == null) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2).replace(/\.?0+$/, "") + "kkk";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2).replace(/\.?0+$/, "") + "kk";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace(/\.?0+$/, "") + "k";
  return String(n);
}

export const VOC_COLORS: Record<string, string> = {
  Sorcerers: "#c26bff",
  Druids: "#4fb0ff",
  Paladins: "#5fd08a",
  Knights: "#ff8a5f",
  Monks: "#f4d68a",
  None: "#9a8f7a",
};
