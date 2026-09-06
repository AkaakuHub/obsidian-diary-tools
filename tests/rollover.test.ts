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

  constructor(private readonly vault: MemoryVault) {}

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    this.renameCalls.push(`${file.path}->${newPath}`);
    this.vault.move(file, newPath);
  }
}

const settings: DiarySettings = { diaryFolder: "diary", setupCompleted: true, templatePath: "" };

describe("rollDiaryForward", () => {
  it("creates the next note and records the generated file", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/template.md", "# 日記");
    vault.seed("diary/2026-9/2026-09-01.md", "- [ ] task\n- [x] done");

    const result = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(result).toEqual({ changed: true, createdCount: 1, renamedCount: 0 });
    expect(vault.content("diary/2026-9/2026-09-01.md")).toBe("- [x] done");
    expect(vault.content("diary/2026-9/2026-09-02.md")).toBe("# 日記\n\n- [ ] task\n");
    expect(state.generatedNotes["diary/2026-9/2026-09-02.md"]).toBeDefined();

    const repeatedResult = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );

    expect(repeatedResult).toEqual({ changed: false, createdCount: 0, renamedCount: 0 });
    expect(vault.content("diary/2026-9/2026-09-02.md")).toBe("# 日記\n\n- [ ] task\n");
  });

  it("renames an untouched generated note instead of creating a blank note", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/2026-9/2026-09-01.md", "- [ ] task");

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );
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
    expect(vault.content("diary/2026-9/2026-09-03.md")).toBe("- [ ] task\n");
  });

  it("creates a new note after a generated note is edited", async () => {
    const vault = new MemoryVault();
    const fileManager = new MemoryFileManager(vault);
    const state: DiaryRolloverState = { generatedNotes: {} };
    vault.seed("diary/2026-9/2026-09-01.md", "- [ ] task");

    await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-01T15:00:00.000Z"),
    );
    vault.edit("diary/2026-9/2026-09-02.md", "- [x] task");
    const result = await rollDiaryForward(
      vault,
      fileManager,
      settings,
      state,
      new Date("2026-09-02T15:00:00.000Z"),
    );

    expect(result).toEqual({ changed: true, createdCount: 1, renamedCount: 0 });
    expect(fileManager.renameCalls).toHaveLength(0);
    expect(vault.content("diary/2026-9/2026-09-02.md")).toBe("- [x] task");
    expect(vault.content("diary/2026-9/2026-09-03.md")).toBe("");
  });
});
