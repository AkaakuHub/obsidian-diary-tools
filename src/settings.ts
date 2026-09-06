export interface DiarySettings {
  diaryFolder: string;
  setupCompleted: boolean;
  templatePath: string;
}

export interface GeneratedNoteMetadata {
  fingerprint: string;
}

export interface DiaryRolloverState {
  generatedNotes: Record<string, GeneratedNoteMetadata>;
}

export const DEFAULT_SETTINGS: DiarySettings = {
  diaryFolder: "diary",
  setupCompleted: false,
  templatePath: "",
};

export function loadDiarySettings(data: unknown): DiarySettings {
  if (!isRecord(data)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    diaryFolder:
      typeof data.diaryFolder === "string" && data.diaryFolder.trim()
        ? data.diaryFolder
        : DEFAULT_SETTINGS.diaryFolder,
    setupCompleted: data.setupCompleted === true,
    templatePath:
      typeof data.templatePath === "string" ? data.templatePath : DEFAULT_SETTINGS.templatePath,
  };
}

export function loadDiaryRolloverState(data: unknown): DiaryRolloverState {
  if (!isRecord(data) || !isRecord(data.generatedNotes)) {
    return { generatedNotes: {} };
  }

  const generatedNotes: Record<string, GeneratedNoteMetadata> = {};
  for (const [path, metadata] of Object.entries(data.generatedNotes)) {
    if (isRecord(metadata) && typeof metadata.fingerprint === "string") {
      generatedNotes[path] = { fingerprint: metadata.fingerprint };
    }
  }
  return { generatedNotes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
