import { Modal, Notice, Setting, type App } from "obsidian";
import { DiaryFolderModal } from "./folder-modal";

type StartSetup = (diaryFolder: string) => Promise<void>;
type CloseSetup = () => void;

export class DiarySetupModal extends Modal {
  constructor(
    app: App,
    private readonly startSetup: StartSetup,
    private readonly closeSetup: CloseSetup,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Diary Tasksの初期設定");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "日記ディレクトリを指定してください。開始するまで、日記は作成・変更しません。",
    });

    let diaryFolder = "";
    const selectedFolder = contentEl.createEl("p", { text: "未選択" });

    new Setting(contentEl).addButton((button) =>
      button.setButtonText("フォルダを選択").onClick(() => {
        new DiaryFolderModal(this.app, (folderPath) => {
          diaryFolder = folderPath;
          selectedFolder.setText(folderPath);
        }).open();
      }),
    );

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("開始")
        .setCta()
        .onClick(async () => {
          if (!diaryFolder) {
            new Notice("日記ディレクトリを選択してください。");
            return;
          }

          button.setDisabled(true);
          try {
            await this.startSetup(diaryFolder);
            this.close();
          } catch (error) {
            button.setDisabled(false);
            const message = error instanceof Error ? error.message : "初期設定に失敗しました。";
            new Notice(message);
          }
        }),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
    this.closeSetup();
  }
}
