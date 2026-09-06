import { describe, expect, it } from "vitest";
import { composeDailyNote, projectDailyNote } from "../src/daily-note";

describe("projectDailyNote", () => {
  it("keeps completed branches in the source and carries unfinished branches", () => {
    const source = [
      "# 日記",
      "",
      "説明は当日に残す。",
      "",
      "- [ ] root",
      "\t- [x] suba",
      "\t- [ ] subb",
      "",
      "- [x] done",
    ].join("\n");

    const result = projectDailyNote(source);

    expect(result.sourceContent).toBe(
      ["# 日記", "", "説明は当日に残す。", "", "- [ ] root", "\t- [x] suba", "", "- [x] done"].join(
        "\n",
      ),
    );
    expect(result.carryoverContent).toBe(["- [ ] root", "\t- [ ] subb"].join("\n"));
  });

  it("does not carry cancelled tasks", () => {
    const result = projectDailyNote("- [-] 中止\n- [ ] 継続\n- [x] 完了");

    expect(result.sourceContent).toBe("- [-] 中止\n- [x] 完了");
    expect(result.carryoverContent).toBe("- [ ] 継続");
  });

  it("keeps one parent line for multiple unfinished children", () => {
    const result = projectDailyNote("- [ ] root\n\t- [ ] first\n\t- [ ] second");

    expect(result.carryoverContent).toBe("- [ ] root\n\t- [ ] first\n\t- [ ] second");
  });
});

describe("composeDailyNote", () => {
  it("appends carryover tasks to the template", () => {
    expect(composeDailyNote("# 日記\n", "- [ ] task")).toBe("# 日記\n\n- [ ] task\n");
  });

  it("does not change a template when there is no carryover", () => {
    expect(composeDailyNote("# 日記\n", "")).toBe("# 日記\n");
  });
});
