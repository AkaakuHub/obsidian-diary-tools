import { Notice, Plugin } from "obsidian";
import { getMillisecondsUntilNextDay, getToday, type DateKey } from "./date";
import { rollDiaryForward } from "./rollover";
import {
  loadDiaryRolloverState,
  loadDiarySettings,
  type DiaryRolloverState,
  type DiarySettings,
} from "./settings";
import { DiarySettingTab } from "./settings-tab";
import { DiarySetupModal } from "./setup-modal";

export default class DiaryPlugin extends Plugin {
  diarySettings!: DiarySettings;
  private rolloverState: DiaryRolloverState = { generatedNotes: {} };
  private isRolloverRunning = false;
  private rolloverRetryRequested = false;
  private lastRolloverDate: DateKey | null = null;
  private rolloverTimeoutId: number | null = null;
  private isMonitoringStarted = false;
  private setupModal: DiarySetupModal | null = null;

  override async onload(): Promise<void> {
    const data: unknown = await this.loadData();
    this.diarySettings = loadDiarySettings(data);
    this.rolloverState = loadDiaryRolloverState(data);
    this.addSettingTab(new DiarySettingTab(this.app, this));
    this.addCommand({
      id: "roll-diary-forward",
      name: "今日の日記を作成してタスクを持ち越す",
      callback: () => {
        if (!this.diarySettings.setupCompleted) {
          this.openSetupModal();
          return;
        }
        void this.runRollover(true);
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.diarySettings.setupCompleted) {
        this.startMonitoring();
        return;
      }
      this.openSetupModal();
    });
    this.register(() => {
      this.rolloverRetryRequested = false;
      if (this.rolloverTimeoutId !== null) {
        window.clearTimeout(this.rolloverTimeoutId);
        this.rolloverTimeoutId = null;
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.diarySettings,
      generatedNotes: this.rolloverState.generatedNotes,
    });
  }

  private async runRollover(showNotice: boolean): Promise<void> {
    if (!this.diarySettings.setupCompleted) {
      return;
    }
    if (this.isRolloverRunning) {
      return;
    }

    this.isRolloverRunning = true;
    const rolloverStartedAt = new Date();
    const rolloverDate = getToday(rolloverStartedAt);
    try {
      const result = await rollDiaryForward(
        this.app.vault,
        this.app.fileManager,
        this.diarySettings,
        this.rolloverState,
        rolloverStartedAt,
      );
      if (result.changed) {
        await this.saveSettings();
      }
      if (showNotice) {
        const changedCount = result.createdCount + result.renamedCount;
        new Notice(
          changedCount > 0
            ? `${changedCount}日分の日記を更新しました。`
            : "作成対象の日記はありません。",
        );
      }
      this.lastRolloverDate = rolloverDate;
    } catch (error) {
      const message = error instanceof Error ? error.message : "日記の作成に失敗しました。";
      new Notice(message);
    } finally {
      this.isRolloverRunning = false;
      if (this.rolloverRetryRequested) {
        this.rolloverRetryRequested = false;
        this.runRolloverIfNeeded();
      }
    }
  }

  private runRolloverIfNeeded(): void {
    if (!this.diarySettings.setupCompleted || this.lastRolloverDate === getToday()) {
      return;
    }
    if (this.isRolloverRunning) {
      this.rolloverRetryRequested = true;
      return;
    }
    void this.runRollover(false);
  }

  private scheduleNextRollover(): void {
    if (this.rolloverTimeoutId !== null) {
      window.clearTimeout(this.rolloverTimeoutId);
    }

    this.rolloverTimeoutId = window.setTimeout(() => {
      this.rolloverTimeoutId = null;
      this.runRolloverIfNeeded();
      this.scheduleNextRollover();
    }, getMillisecondsUntilNextDay());
  }

  private startMonitoring(): void {
    if (this.isMonitoringStarted) {
      return;
    }
    this.isMonitoringStarted = true;
    this.registerDomEvent(window, "focus", () => {
      this.runRolloverIfNeeded();
      this.scheduleNextRollover();
    });
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      this.runRolloverIfNeeded();
      this.scheduleNextRollover();
    });
    this.runRolloverIfNeeded();
    this.scheduleNextRollover();
  }

  private openSetupModal(): void {
    if (this.setupModal) {
      return;
    }

    this.setupModal = new DiarySetupModal(
      this.app,
      async (diaryFolder) => {
        const previousSettings = this.diarySettings;
        this.diarySettings = {
          ...previousSettings,
          diaryFolder,
          setupCompleted: true,
        };
        try {
          await this.saveSettings();
        } catch (error) {
          this.diarySettings = previousSettings;
          throw error;
        }
        this.startMonitoring();
      },
      () => {
        this.setupModal = null;
      },
    );
    this.setupModal.open();
  }
}
