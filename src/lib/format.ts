const units = ["B", "KB", "MB", "GB"] as const;

/** Human-readable size using binary multiples (1 KB = 1024 B), matching src/config/limits. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    if (minutes === 0 && rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")} h`;
  }
  if (rest === 0) return `${minutes} min`;
  return `${minutes}:${rest.toString().padStart(2, "0")} min`;
}

/** Positive = smaller than the original, negative = larger. */
export function percentChange(original: number, result: number): number {
  if (original <= 0) return 0;
  return ((original - result) / original) * 100;
}

export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return "—";
  return `${width} × ${height}`;
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
