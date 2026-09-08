import { describe, expect, it, vi } from "vitest";
import type { TAbstractFile, TFile as ObsidianFile } from "obsidian";
import { type FileManagerGateway, rollDiaryForward, type VaultGateway } from "../src/rollover";
import type { DiaryRolloverState, DiarySettings } from "../src/settings";

vi.mock("obsidian", () => ({
  TFile: class FakeTFile {
    path = "";
    stat = { ctime: 0, mtime: 0, size: 0 };
  },
  normalizePath: (path: string) =>
    path
      .replaceAll("\\", "/")
      .replace(/\/+/gu, "/")
      .replace(/^\/|\/$/gu, ""),
}));

const { TFile } = await import("obsidian");

interface FileEntry {
  content: string;
  file: ObsidianFile;
}

class MemoryVault implements VaultGateway {
  private readonly entries = new Map<string, FileEntry>();
  private readonly folders = new Map<string, TAbstractFile>();
  private clock = 1;
  private nextProcessAction: (() => void) | null = null;

  seed(path: string, content: string): void {
    this.entries.set(path, { content, file: this.createFile(path, content) });
  }

  edit(path: string, content: string): void {
    const entry = this.getEntry(path);
    entry.content = content;
    entry.file.stat = {
      ...entry.file.stat,
      mtime: this.clock++,
      size: new TextEncoder().encode(content).byteLength,
    };
  }

  content(path: string): string {
    return this.getEntry(path).content;
  }

  beforeNextProcess(action: () => void): void {
    this.nextProcessAction = action;
  }

  move(file: TAbstractFile, newPath: string): void {
    const entry = this.getEntry(file.path);
    this.entries.delete(file.path);
    entry.file.path = newPath;
    entry.file.stat = { ...entry.file.stat, mtime: this.clock++ };
    this.entries.set(newPath, entry);
  }

  getMarkdownFiles(): ObsidianFile[] {
    return [...this.entries.values()]
      .filter((entry) => entry.file.path.endsWith(".md"))
      .map((entry) => entry.file);
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.entries.get(path)?.file ?? this.folders.get(path) ?? null;
  }

  async read(file: ObsidianFile): Promise<string> {
    return this.getEntry(file.path).content;
  }

  async create(path: string, data: string): Promise<ObsidianFile> {
    const file = this.createFile(path, data);
    this.entries.set(path, { content: data, file });
    return file;
  }

  async createFolder(path: string): Promise<unknown> {
    this.folders.set(path, this.createFile(path, ""));
    return undefined;
  }

  async process(file: ObsidianFile, fn: (data: string) => string): Promise<string> {
    const nextProcessAction = this.nextProcessAction;
    this.nextProcessAction = null;
    nextProcessAction?.();
    const entry = this.getEntry(file.path);
    const nextContent = fn(entry.content);
    entry.content = nextContent;
    entry.file.stat = {
      ...entry.file.stat,
      mtime: this.clock++,
      size: new TextEncoder().encode(nextContent).byteLength,
    };
    return nextContent;
  }

  private createFile(path: string, content: string): ObsidianFile {
    const file = new TFile();
    file.path = path;
    file.stat = {
      ctime: this.clock,
      mtime: this.clock++,
      size: new TextEncoder().encode(content).byteLength,
    };
    return file;
  }

  private getEntry(path: string): FileEntry {
    const entry = this.entries.get(path);
    if (!entry) {
      throw new Error(`Missing file: ${path}`);
    }
    return entry;
  }
}

class MemoryFileManager implements FileManagerGateway {
  readonly renameCalls: string[] = [];
  private nextRenameError: Error | null = null;

  constructor(private readonly vault: MemoryVault) {}

  failNextRename(error: Error): void {
    this.nextRenameError = error;
  }

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    const nextRenameError = this.nextRenameError;
    this.nextRenameError = null;
    if (nextRenameError) {
      throw nextRenameError;
    }
    this.renameCalls.push(`${file.path}->${newPath}`);
    this.vault.move(file, newPath);
  }
}

const settings: DiarySettings = { diaryFolder: "diary", setupCompleted: true };
const template = [
  "# 日記",
  "<!-- diary -->",
  "# 絶対に今日",
  "<!-- todo-today -->",
  "# TODO",
  "<!-- todo -->",
].join("\n");

describe("rollDiaryForward", () => {
  it("does not change files when the template markers are invalid", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    const sourcePath = "diary/2026-9/2026-09-01.md";
    vault.seed("diary/template.md", "<!-- todo -->");
    vault.seed(sourcePath, "# TODO\n- [ ] task");

    await expect(
      rollDiaryForward(vault, fileManager, settings, state, new Date("2026-09-01T15:00:00.000Z")),
    ).rejects.toThrow("テンプレートには<!-- diary -->を1つだけ配置してください。");

    expect(vault.content(sourcePath)).toBe("# TODO\n- [ ] task");
    expect(vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md")).toBeNull();
    expect(
      vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md.diary-tasks-pending"),
    ).toBeNull();
  });

  it("creates the next note and records the generated file", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/template.md", template);
    vault.seed("diary/2026-9/2026-09-01.md", "# TODO\n\n- [ ] task\n- [x] done");

    const result = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(result).toEqual({ changed: true, createdCount: 1, renamedCount: 0 });
    expect(vault.content("diary/2026-9/2026-09-01.md")).toBe("# TODO\n\n- [x] done");
    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [ ] task");
    expect(state.generatedNotes["diary/2026-9/2026-09-02.md"]).toBeDefined();

    const repeatedResult = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(repeatedResult).toEqual({ changed: false, createdCount: 0, renamedCount: 0 });
    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [ ] task");
  });

  it("renames an untouched generated note instead of creating a blank note", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/template.md", template);
    vault.seed("diary/2026-9/2026-09-01.md", "# TODO\n\n- [ ] task");

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );
    fileManager.renameCalls.length = 0;
    const result = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-02T15:00:00.000Z"),
    );

    expect(result).toEqual({ changed: true, createdCount: 0, renamedCount: 1 });
    expect(fileManager.renameCalls).toEqual([
      "diary/2026-9/2026-09-02.md->diary/2026-9/2026-09-03.md",
    ]);
    expect(vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md")).toBeNull();
    expect(vault.content("diary/2026-9/2026-09-03.md")).toContain("# TODO\n- [ ] task");
  });

  it("creates a new note after a generated note is edited", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/template.md", template);
    vault.seed("diary/2026-9/2026-09-01.md", "# TODO\n\n- [ ] task");

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );
    fileManager.renameCalls.length = 0;
    vault.edit("diary/2026-9/2026-09-02.md", template.replace("<!-- todo -->", "- [x] task"));
    const result = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-02T15:00:00.000Z"),
    );

    expect(result).toEqual({ changed: true, createdCount: 1, renamedCount: 0 });
    expect(fileManager.renameCalls).toEqual([
      "diary/2026-9/2026-09-03.md.diary-tasks-pending->diary/2026-9/2026-09-03.md",
    ]);
    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [x] task");
    expect(vault.content("diary/2026-9/2026-09-03.md")).toBe(
      template.replaceAll(/<!-- (?:diary|todo-today|todo) -->/gu, ""),
    );
  });

  it("uses the latest source content without leaving duplicated pending tasks", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    const sourcePath = "diary/2026-9/2026-09-01.md";
    vault.seed("diary/template.md", template);
    vault.seed(sourcePath, "# TODO\n- [ ] task");
    vault.beforeNextProcess(() => {
      vault.edit(sourcePath, "# TODO\n追記\n- [ ] task");
    });

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(vault.content(sourcePath)).toBe("# TODO\n追記");
    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [ ] task");
  });

  it("recovers a pending target after updating the source fails", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    const sourcePath = "diary/2026-9/2026-09-01.md";
    vault.seed("diary/template.md", template);
    vault.seed(sourcePath, "# TODO\n- [ ] task");
    vault.beforeNextProcess(() => {
      throw new Error("書き込み失敗");
    });

    await expect(
      rollDiaryForward(vault, fileManager, settings, state, new Date("2026-09-01T15:00:00.000Z")),
    ).rejects.toThrow("書き込み失敗");

    expect(vault.content(sourcePath)).toBe("# TODO\n- [ ] task");
    expect(vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md")).toBeNull();
    expect(
      vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md.diary-tasks-pending"),
    ).not.toBeNull();

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(vault.content(sourcePath)).toBe("# TODO");
    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [ ] task");
    expect(
      vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md.diary-tasks-pending"),
    ).toBeNull();
  });

  it("finishes a pending target after source cleanup succeeds but rename fails", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    const sourcePath = "diary/2026-9/2026-09-01.md";
    vault.seed("diary/template.md", template);
    vault.seed(sourcePath, "# TODO\n- [ ] task");
    fileManager.failNextRename(new Error("リネーム失敗"));

    await expect(
      rollDiaryForward(vault, fileManager, settings, state, new Date("2026-09-01T15:00:00.000Z")),
    ).rejects.toThrow("リネーム失敗");

    expect(vault.content(sourcePath)).toBe("# TODO");
    expect(vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md")).toBeNull();

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(vault.content("diary/2026-9/2026-09-02.md")).toContain("# TODO\n- [ ] task");
    expect(
      vault.getAbstractFileByPath("diary/2026-9/2026-09-02.md.diary-tasks-pending"),
    ).toBeNull();
  });
});
