import { describe, expect, it } from "vitest";
import {
  addDays,
  dailyNotePath,
  getMillisecondsUntilNextJapanDay,
  getTodayInJapan,
  parseDailyNoteDate,
} from "../src/date";

describe("date helpers", () => {
  it("formats the date using Japan time", () => {
    expect(getTodayInJapan(new Date("2026-08-25T15:00:00.000Z"))).toBe("2026-08-26");
  });

  it("calculates the delay until the next Japan midnight", () => {
    expect(getMillisecondsUntilNextJapanDay(new Date("2026-08-25T14:59:59.000Z"))).toBe(1000);
    expect(getMillisecondsUntilNextJapanDay(new Date("2026-08-25T15:00:00.000Z"))).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("uses an unpadded month folder", () => {
    expect(dailyNotePath("diary", "2026-08-26")).toBe("diary/2026-8/2026-08-26.md");
  });

  it("parses only matching daily note paths", () => {
    expect(parseDailyNoteDate("diary/2026-8/2026-08-25.md", "diary")).toBe("2026-08-25");
    expect(parseDailyNoteDate("diary/2026-08/2026-08-25.md", "diary")).toBeNull();
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });
});
