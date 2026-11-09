/** Number and date formatting shared across findings and UI. */

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatInt(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Rounds to two significant figures for prose: 3,214,880 → "3.2 million", 541,203 → "540,000". */
export function formatApprox(n: number): string {
  if (n >= 1e6) {
    const m = n / 1e6;
    return `${m >= 10 ? Math.round(m).toString() : m.toFixed(1).replace(/\.0$/, "")} million`;
  }
  if (n < 100) return formatInt(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return formatInt(Math.round(n / mag) * mag);
}

/** Compact KPI form: 3.2M, 540K, 1,234. */
export function formatCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3).toString()}K`;
  return formatInt(n);
}

export function formatPercent(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}

export function formatPm(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(v >= 100 ? 0 : 1)} µg/m³`;
}

export function formatKm(v: number | null): string {
  if (v === null) return "None within 1,000 km";
  return v < 10 ? `${v.toFixed(1)} km` : `${formatInt(v)} km`;
}

export function formatDateTime(ms: number, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

/** Oxford-comma list with an optional cap: "A, B and 3 others". */
export function listNames(names: readonly string[], max = 3): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest.toString()} other${rest === 1 ? "" : "s"}`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]!}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}
