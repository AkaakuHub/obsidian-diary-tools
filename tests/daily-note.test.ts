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

  it("carries an unfinished parent even when all children are complete", () => {
    const result = projectDailyNote("- [ ] root\n\t- [x] child");

    expect(result.sourceContent).toBe("- [ ] root\n\t- [x] child");
    expect(result.carryoverContent).toBe("- [ ] root");
  });

  it("keeps blank lines between carried tasks in the same section", () => {
    const result = projectDailyNote("# TODO\n- [ ] aaa\n\n- [ ] bbb");

    expect(result.sections.todo).toBe("- [ ] aaa\n\n- [ ] bbb");
  });
});

describe("composeDailyNote", () => {
  it("places each section at its matching template marker", () => {
    const projection = projectDailyNote(
      [
        "# 日記",
        "前日のメモ",
        "",
        "---",
        "# 絶対今日",
        "- [x] 完了",
        "- [ ] 今日のTODO",
        "",
        "---",
        "# TODO",
        "- [x] 完了",
        "- [ ] 継続するTODO",
      ].join("\n"),
    );

    const template = [
      "# 日記",
      "<!-- diary -->",
      "---",
      "# 絶対に今日",
      "<!-- todo-today -->",
      "---",
      "# TODO",
      "<!-- todo -->",
    ].join("\n");

    expect(composeDailyNote(template, projection)).toBe(
      [
        "# 日記",
        "",
        "---",
        "# 絶対に今日",
        "- [ ] 今日のTODO",
        "---",
        "# TODO",
        "- [ ] 継続するTODO",
      ].join("\n"),
    );
  });
});
