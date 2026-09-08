import { normalizePath, TFile } from "obsidian";
import type { TAbstractFile } from "obsidian";
import {
  addDays,
  compareDateKeys,
  dailyNotePath,
  getToday,
  parseDailyNoteDate,
  type DateKey,
} from "./date";
import { composeDailyNote, projectDailyNote } from "./daily-note";
import { getGeneratedNoteMetadata, isGeneratedNoteUnchanged } from "./generated-note";
import type { DiaryRolloverState, DiarySettings } from "./settings";

const MAX_SOURCE_UPDATE_ATTEMPTS = 3;

interface DailyFile {
  date: DateKey;
  file: TFile;
}

export interface RolloverResult {
  changed: boolean;
  createdCount: number;
  renamedCount: number;
}

export interface VaultGateway {
  create(path: string, data: string): Promise<TFile>;
  createFolder(path: string): Promise<unknown>;
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getMarkdownFiles(): TFile[];
  process(file: TFile, fn: (data: string) => string): Promise<string>;
  read(file: TFile): Promise<string>;
}

export interface FileManagerGateway {
  renameFile(file: TAbstractFile, newPath: string): Promise<void>;
}

export async function ensureDiaryTemplate(
  vault: VaultGateway,
  diaryFolder: string,
  templateContent: string,
): Promise<void> {
  const templatePath = getDefaultTemplatePath(diaryFolder);
  const template = vault.getAbstractFileByPath(templatePath);
  if (template) {
    if (!(template instanceof TFile)) {
      throw new Error(`テンプレートの場所にファイル以外があります: ${templatePath}`);
    }
    return;
  }
  await ensureParentFolders(vault, templatePath);
  await vault.create(templatePath, templateContent);
}

export async function rollDiaryForward(
  vault: VaultGateway,
  fileManager: FileManagerGateway,
  settings: DiarySettings,
  state: DiaryRolloverState,
  now = new Date(),
): Promise<RolloverResult> {
  const today = getToday(now);
  const diaryFolder = normalizePath(settings.diaryFolder);
  const normalizedSettings = { ...settings, diaryFolder };
  const latest = findLatestDailyFile(vault, diaryFolder, today);
  if (!latest) {
    return { changed: false, createdCount: 0, renamedCount: 0 };
  }

  let source = latest;
  let createdCount = 0;
  let renamedCount = 0;
  let changed = false;
  while (compareDateKeys(source.date, today) < 0) {
    const targetDate = addDays(source.date, 1);
    const targetPath = dailyNotePath(diaryFolder, targetDate);
    const pendingTargetPath = `${targetPath}.diary-tasks-pending`;
    const existingTarget = vault.getAbstractFileByPath(targetPath);
    const existingPendingTarget = vault.getAbstractFileByPath(pendingTargetPath);

    if (existingTarget) {
      if (!(existingTarget instanceof TFile)) {
        throw new Error(`日記ファイルの場所にファイル以外があります: ${targetPath}`);
      }
      if (existingPendingTarget) {
        throw new Error(`未完了の持ち越しファイルが残っています: ${pendingTargetPath}`);
      }
      if (state.generatedNotes[source.file.path]) {
        delete state.generatedNotes[source.file.path];
        changed = true;
      }
      source = { date: targetDate, file: existingTarget };
      continue;
    }

    if (existingPendingTarget && !(existingPendingTarget instanceof TFile)) {
      throw new Error(
        `未完了の持ち越しファイルの場所にファイル以外があります: ${pendingTargetPath}`,
      );
    }

    const generatedMetadata = state.generatedNotes[source.file.path];
    const sourceContent = await vault.read(source.file);
    if (
      !existingPendingTarget &&
      generatedMetadata &&
      (await isGeneratedNoteUnchanged(sourceContent, generatedMetadata))
    ) {
      const oldPath = source.file.path;
      await ensureParentFolders(vault, targetPath);
      await fileManager.renameFile(source.file, targetPath);
      const renamedTarget = vault.getAbstractFileByPath(targetPath);
      if (!(renamedTarget instanceof TFile)) {
        throw new Error(`リネームした日記を読み込めません: ${targetPath}`);
      }
      delete state.generatedNotes[oldPath];
      state.generatedNotes[targetPath] = await getGeneratedNoteMetadata(sourceContent);
      source = { date: targetDate, file: renamedTarget };
      renamedCount += 1;
      changed = true;
      continue;
    }

    if (generatedMetadata) {
      delete state.generatedNotes[source.file.path];
      changed = true;
    }
    const projection = projectDailyNote(sourceContent);
    const templateContent = await readTemplate(vault, normalizedSettings);
    await ensureParentFolders(vault, targetPath);
    const pendingTarget =
      existingPendingTarget ??
      (await vault.create(pendingTargetPath, composeDailyNote(templateContent, projection)));
    const targetContent = await completePendingRollover(
      vault,
      fileManager,
      source.file,
      pendingTarget,
      targetPath,
      templateContent,
    );
    const createdTarget = vault.getAbstractFileByPath(targetPath);
    if (!(createdTarget instanceof TFile)) {
      throw new Error(`作成した日記を読み込めません: ${targetPath}`);
    }
    state.generatedNotes[targetPath] = await getGeneratedNoteMetadata(targetContent);
    source = { date: targetDate, file: createdTarget };
    createdCount += 1;
    changed = true;
  }

  return { changed, createdCount, renamedCount };
}

async function completePendingRollover(
  vault: VaultGateway,
  fileManager: FileManagerGateway,
  sourceFile: TFile,
  pendingTarget: TFile,
  targetPath: string,
  templateContent: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_SOURCE_UPDATE_ATTEMPTS; attempt += 1) {
    const sourceContent = await vault.read(sourceFile);
    const projection = projectDailyNote(sourceContent);
    if (sourceContent === projection.sourceContent) {
      const targetContent = await vault.read(pendingTarget);
      await fileManager.renameFile(pendingTarget, targetPath);
      return targetContent;
    }

    const targetContent = composeDailyNote(templateContent, projection);
    await vault.process(pendingTarget, () => targetContent);
    let sourceChanged = false;
    await vault.process(sourceFile, (currentContent) => {
      if (currentContent !== sourceContent) {
        sourceChanged = true;
        return currentContent;
      }
      return projection.sourceContent;
    });
    if (sourceChanged) {
      continue;
    }

    await fileManager.renameFile(pendingTarget, targetPath);
    return targetContent;
  }

  throw new Error("元の日記が繰り返し編集されたため、持ち越しを完了できませんでした。");
}

function findLatestDailyFile(
  vault: VaultGateway,
  diaryFolder: string,
  before: DateKey,
): DailyFile | null {
  return (
    vault
      .getMarkdownFiles()
      .map((file) => ({ date: parseDailyNoteDate(file.path, diaryFolder), file }))
      .filter(
        (entry): entry is DailyFile =>
          entry.date !== null && compareDateKeys(entry.date, before) < 0,
      )
      .sort((left, right) => compareDateKeys(left.date, right.date))
      .at(-1) ?? null
  );
}

async function readTemplate(vault: VaultGateway, settings: DiarySettings): Promise<string> {
  const path = getDefaultTemplatePath(settings.diaryFolder);
  const template = vault.getAbstractFileByPath(path);
  if (!(template instanceof TFile)) {
    throw new Error(`テンプレートが見つかりません: ${path}`);
  }
  return vault.read(template);
}

function getDefaultTemplatePath(diaryFolder: string): string {
  const trimmedFolder = diaryFolder.trim();
  const root = trimmedFolder ? normalizePath(trimmedFolder) : "";
  return root ? `${root}/template.md` : "template.md";
}

async function ensureParentFolders(vault: VaultGateway, filePath: string): Promise<void> {
  const folderParts = filePath.split("/");
  folderParts.pop();

  let currentPath = "";
  for (const part of folderParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (!vault.getAbstractFileByPath(currentPath)) {
      await vault.createFolder(currentPath);
    }
  }
}
