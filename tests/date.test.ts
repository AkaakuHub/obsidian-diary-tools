import { describe, expect, it } from "vitest";
import {
  addDays,
  dailyNotePath,
  getMillisecondsUntilNextDay,
  getToday,
  parseDailyNoteDate,
} from "../src/date";

describe("date helpers", () => {
  it("formats the date using the local time zone", () => {
    expect(getToday(new Date(2026, 7, 25, 12))).toBe("2026-08-25");
  });

  it("calculates the delay until the next local midnight", () => {
    const beforeMidnight = new Date(2026, 7, 25, 23, 59, 59);
    const nextMidnight = new Date(2026, 7, 26);
    expect(getMillisecondsUntilNextDay(beforeMidnight)).toBe(
      nextMidnight.getTime() - beforeMidnight.getTime(),
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
