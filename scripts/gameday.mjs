import { config } from "../config.mjs";

export function parseNumber(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/** Dia de jogo (YYYY-MM-DD) do instante, considerando o server save. */
export function getGameDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = +get("year"), mo = +get("month"), d = +get("day");
  const h = +(get("hour") === "24" ? "0" : get("hour"));
  const mi = +get("minute");
  const beforeSave =
    h < config.serverSaveHour ||
    (h === config.serverSaveHour && mi < config.serverSaveMinute);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (beforeSave) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
