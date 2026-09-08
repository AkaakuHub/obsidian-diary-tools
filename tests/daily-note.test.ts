import { describe, expect, it } from "vitest";
import { composeDailyNote, projectDailyNote } from "../src/daily-note";

describe("projectDailyNote", () => {
  it("keeps completed branches in the source and carries unfinished branches", () => {
    const source = [
      "# 日記",
      "",
      "説明は当日に残す。",
      "",
      "# TODO",
      "- [ ] root",
      "\t- [x] suba",
      "\t- [ ] subb",
      "",
      "- [x] done",
    ].join("\n");

    const result = projectDailyNote(source);

    expect(result.sourceContent).toBe(
      [
        "# 日記",
        "",
        "説明は当日に残す。",
        "",
        "# TODO",
        "- [x] root",
        "\t- [x] suba",
        "",
        "- [x] done",
      ].join("\n"),
    );
    expect(result.sections.todo).toBe(["- [ ] root", "\t- [ ] subb"].join("\n"));
  });

  it("does not carry cancelled tasks", () => {
    const result = projectDailyNote("# TODO\n- [-] 中止\n- [ ] 継続\n- [x] 完了");

    expect(result.sourceContent).toBe("# TODO\n- [-] 中止\n- [x] 完了");
    expect(result.sections.todo).toBe("- [ ] 継続");
  });

  it("keeps one parent line for multiple unfinished children", () => {
    const result = projectDailyNote("# TODO\n- [ ] root\n\t- [ ] first\n\t- [ ] second");

    expect(result.sections.todo).toBe("- [ ] root\n\t- [ ] first\n\t- [ ] second");
  });

  it("carries an unfinished parent even when all children are complete", () => {
    const result = projectDailyNote("# TODO\n- [ ] root\n\t- [x] child");

    expect(result.sourceContent).toBe("# TODO\n- [x] root\n\t- [x] child");
    expect(result.sections.todo).toBe("- [ ] root");
  });

  it("marks a mixed parent complete in the source while carrying it as unfinished", () => {
    const result = projectDailyNote("# TODO\n- [ ] root\n\t- [x] done\n\t- [ ] pending");

    expect(result.sourceContent).toBe("# TODO\n- [x] root\n\t- [x] done");
    expect(result.sections.todo).toBe("- [ ] root\n\t- [ ] pending");
  });

  it("marks every carried parent complete through nested branches", () => {
    const result = projectDailyNote(
      [
        "# TODO",
        "- [ ] root",
        "\t- [ ] first",
        "\t\t- [x] done",
        "\t- [ ] second",
        "\t\t- [x] done",
      ].join("\n"),
    );

    expect(result.sourceContent).toBe(
      [
        "# TODO",
        "- [x] root",
        "\t- [x] first",
        "\t\t- [x] done",
        "\t- [x] second",
        "\t\t- [x] done",
      ].join("\n"),
    );
    expect(result.sections.todo).toBe("- [ ] root\n\t- [ ] first\n\t- [ ] second");
  });

  it("keeps blank lines between carried tasks in the same section", () => {
    const result = projectDailyNote("# TODO\n- [ ] aaa\n\n- [ ] bbb");

    expect(result.sections.todo).toBe("- [ ] aaa\n\n- [ ] bbb");
  });

  it("leaves unfinished checkboxes outside rollover sections untouched", () => {
    const source = "# 日記\n\n- [ ] 日記内のチェック項目";

    const result = projectDailyNote(source);

    expect(result.sourceContent).toBe(source);
    expect(result.sections.todo).toBe("");
    expect(result.sections.todoToday).toBe("");
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

  it.each(["<!-- diary -->", "<!-- todo-today -->", "<!-- todo -->"])(
    "rejects a template without %s",
    (missingMarker) => {
      const template = ["<!-- diary -->", "<!-- todo-today -->", "<!-- todo -->"]
        .filter((marker) => marker !== missingMarker)
        .join("\n");

      expect(() => composeDailyNote(template, projectDailyNote("# TODO\n- [ ] task"))).toThrow(
        `テンプレートには${missingMarker}を1つだけ配置してください。`,
      );
    },
  );

  it("rejects duplicate template markers", () => {
    const template = [
      "<!-- diary -->",
      "<!-- todo-today -->",
      "<!-- todo -->",
      "<!-- todo -->",
    ].join("\n");

    expect(() => composeDailyNote(template, projectDailyNote("# TODO\n- [ ] task"))).toThrow(
      "テンプレートには<!-- todo -->を1つだけ配置してください。",
    );
  });
});
