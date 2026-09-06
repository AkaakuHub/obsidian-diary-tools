import { describe, expect, it } from "vitest";
import { getGeneratedNoteMetadata, isGeneratedNoteUnchanged } from "../src/generated-note";

describe("generated note state", () => {
  it("recognizes an untouched generated note", async () => {
    const content = "# 日記\n- [ ] task\n";
    const metadata = await getGeneratedNoteMetadata(content);

    await expect(isGeneratedNoteUnchanged(content, metadata)).resolves.toBe(true);
  });

  it("does not match edited content even when the size is unchanged", async () => {
    const generated = await getGeneratedNoteMetadata("- [ ] task");

    await expect(isGeneratedNoteUnchanged("- [x] task", generated)).resolves.toBe(false);
  });
});
