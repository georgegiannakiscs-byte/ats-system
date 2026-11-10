import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = Math.abs(Date.now() - d.getTime());
  if (diff < 60_000) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? "d MMM" : "d MMM yyyy");
}

export function longDate(iso: string) {
  return format(new Date(iso), "EEEE d MMMM yyyy");
}

export function timeOf(iso: string) {
  return format(new Date(iso), "HH:mm");
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 0 && diff < 7) return format(d, "EEEE");
  return format(d, "EEE d MMM");
}

export function dueLabel(iso: string) {
  const diff = differenceInCalendarDays(new Date(iso), new Date());
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return format(new Date(iso), "EEEE");
  return format(new Date(iso), "d MMM");
}

export function daysSince(iso: string) {
  return differenceInCalendarDays(new Date(), new Date(iso));
}

export function formatSalary(min?: number, max?: number, currency = "EUR") {
  if (!min && !max) return "Not specified";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0, notation: n >= 100000 ? "compact" : "standard" }).format(n);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}

export function plural(n: number, word: string, pluralWord?: string) {
  return `${n} ${n === 1 ? word : (pluralWord ?? word + "s")}`;
}
