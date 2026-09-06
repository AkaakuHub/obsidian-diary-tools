import { Modal, normalizePath, Notice, Setting, type App } from "obsidian";
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
    let setFolderInput = (value: string): void => {
      diaryFolder = value;
    };
    new Setting(contentEl)
      .setName("日記ディレクトリ")
      .setDesc("Vault内のフォルダパスを入力してください。")
      .addText((text) => {
        setFolderInput = (value) => {
          diaryFolder = value;
          text.setValue(value);
        };
        text.setPlaceholder("diary").onChange((value) => {
          diaryFolder = value;
        });
      });

    new Setting(contentEl).addButton((button) =>
      button.setButtonText("フォルダを選択").onClick(() => {
        new DiaryFolderModal(this.app, (folderPath) => {
          setFolderInput(folderPath);
        }).open();
      }),
    );

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("開始")
        .setCta()
        .onClick(async () => {
          const normalizedFolder = normalizePath(diaryFolder.trim());
          if (!normalizedFolder) {
            new Notice("日記ディレクトリを入力してください。");
            return;
          }

          button.setDisabled(true);
          try {
            await this.startSetup(normalizedFolder);
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
