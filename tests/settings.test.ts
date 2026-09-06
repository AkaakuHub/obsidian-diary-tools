import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadDiarySettings } from "../src/settings";

describe("diary settings", () => {
  it("requires setup before monitoring starts", () => {
    expect(loadDiarySettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps setup completed state and configured paths", () => {
    expect(
      loadDiarySettings({
        diaryFolder: "notes",
        setupCompleted: true,
        templatePath: "notes/template.md",
      }),
    ).toEqual({
      diaryFolder: "notes",
      setupCompleted: true,
      templatePath: "notes/template.md",
    });
  });
});
