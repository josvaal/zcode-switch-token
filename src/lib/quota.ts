export interface QuotaWindow {
  label: string;
  percent: number | null;
  detail: string | null;
  resetAt: string | null;
}

export interface ParsedQuota {
  windows: QuotaWindow[];
  errorMessage: string | null;
}

const PERCENT_KEY = /percent|ratio|pct/i;
const LIMIT_KEY = /(^|_)(limit|total|max|quota|allowance|cap)($|_)/i;
const USED_KEY = /^(used|usage|current|consumed|spent|value)(_|$)/i;
const REMAIN_KEY = /remain|left($|_)/i;
const LABEL_KEY = /^(name|type|window|timeWindow|time_window|unit|timeUnit|time_unit|plan|level|model|tier)$/i;
const RESET_KEY = /reset|expire|expiry|end_?time|refresh_?time/i;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return null;
}

function clampPercent(n: number | null): number | null {
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("en-US");
}

function labelOf(rec: Record<string, unknown>, fallback: string): string {
  const key = Object.keys(rec).find((k) => LABEL_KEY.test(k) && typeof rec[k] === "string");
  if (key) return rec[key] as string;
  return fallback;
}

function resetOf(rec: Record<string, unknown>): string | null {
  const key = Object.keys(rec).find((k) => RESET_KEY.test(k));
  if (!key) return null;
  const value = rec[key];
  if (typeof value === "string" && value.trim() !== "") return value;
  const n = toNumber(value);
  if (n !== null && n > 1e9) {
    const ms = n < 1e12 ? n * 1000 : n;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return null;
}

function detailOf(
  used: number | null,
  limit: number | null,
  remain: number | null,
): string | null {
  if (used !== null && limit !== null) return `${formatCount(used)} de ${formatCount(limit)}`;
  if (remain !== null && limit !== null)
    return `quedan ${formatCount(remain)} de ${formatCount(limit)}`;
  if (remain !== null) return `quedan ${formatCount(remain)}`;
  if (used !== null) return `${formatCount(used)} usado`;
  return null;
}

/**
 * The z.ai quota endpoint response shape is not documented/verified, so this
 * parser walks the payload defensively: it promotes any object that carries a
 * percent-like value or a used/limit (or remain/limit) pair into a window,
 * and falls back to the raw JSON view in the UI when nothing matches.
 */
export function parseQuota(raw: unknown): ParsedQuota {
  const windows: QuotaWindow[] = [];
  visit(raw, 0);

  let errorMessage: string | null = null;
  if (windows.length === 0 && raw !== null && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const msg = rec.msg ?? rec.message;
    if (typeof msg === "string" && msg.trim() !== "") errorMessage = msg;
  }

  return { windows, errorMessage };

  function visit(node: unknown, depth: number): void {
    if (depth > 8 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const rec = node as Record<string, unknown>;
    const keys = Object.keys(rec);

    const pctKey = keys.find((k) => PERCENT_KEY.test(k) && toNumber(rec[k]) !== null);
    const limitKey = keys.find((k) => LIMIT_KEY.test(k) && toNumber(rec[k]) !== null);
    const usedKey = keys.find((k) => USED_KEY.test(k) && toNumber(rec[k]) !== null);
    const remainKey = keys.find((k) => REMAIN_KEY.test(k) && toNumber(rec[k]) !== null);

    if (pctKey !== undefined || (limitKey !== undefined && (usedKey !== undefined || remainKey !== undefined))) {
      let percent: number | null = pctKey !== undefined ? toNumber(rec[pctKey]) : null;
      if (percent !== null && pctKey !== undefined && percent <= 1 && /ratio/i.test(pctKey)) {
        percent *= 100;
      }
      const used = usedKey !== undefined ? toNumber(rec[usedKey]) : null;
      const limit = limitKey !== undefined ? toNumber(rec[limitKey]) : null;
      const remain = remainKey !== undefined ? toNumber(rec[remainKey]) : null;
      if (percent === null && limit !== null && limit > 0) {
        if (used !== null) percent = (used / limit) * 100;
        else if (remain !== null) percent = ((limit - remain) / limit) * 100;
      }
      windows.push({
        label: labelOf(rec, `Ventana ${windows.length + 1}`),
        percent: clampPercent(percent),
        detail: detailOf(used, limit, remain),
        resetAt: resetOf(rec),
      });
      return;
    }

    for (const key of keys) visit(rec[key], depth + 1);
  }
}
