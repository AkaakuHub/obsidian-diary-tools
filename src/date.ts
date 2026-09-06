export type DateKey = `${number}-${number}-${number}`;

const JAPAN_TIME_ZONE = "Asia/Tokyo";

const japanDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: JAPAN_TIME_ZONE,
  year: "numeric",
});

export function getTodayInJapan(now = new Date()): DateKey {
  const parts = japanDateFormatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return formatDateKey(year, month, day);
}

export function getMillisecondsUntilNextJapanDay(now = new Date()): number {
  const nextDate = addDays(getTodayInJapan(now), 1);
  const nextMidnight = new Date(`${nextDate}T00:00:00+09:00`);
  return nextMidnight.getTime() - now.getTime();
}

export function addDays(date: DateKey, amount: number): DateKey {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

export function compareDateKeys(left: DateKey, right: DateKey): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function dailyNotePath(diaryFolder: string, date: DateKey): string {
  const root = normalizeFolderPath(diaryFolder);
  const [year, month] = date.split("-");
  const monthFolder = `${year}-${Number(month)}`;
  return root ? `${root}/${monthFolder}/${date}.md` : `${monthFolder}/${date}.md`;
}

export function parseDailyNoteDate(path: string, diaryFolder: string): DateKey | null {
  const root = normalizeFolderPath(diaryFolder);
  const prefix = root ? `${root}/` : "";
  if (!path.startsWith(prefix)) {
    return null;
  }

  const parts = path.slice(prefix.length).split("/");
  if (parts.length !== 2 || !parts[1].endsWith(".md")) {
    return null;
  }

  const date = parts[1].slice(0, -3);
  const [year, month] = date.split("-");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || parts[0] !== `${year}-${Number(month)}`) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }
  return date as DateKey;
}

function formatDateKey(year: number, month: number, day: number): DateKey {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}` as DateKey;
}

function normalizeFolderPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/gu, "");
}
