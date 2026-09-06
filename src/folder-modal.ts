import { FuzzySuggestModal, TFolder, type App } from "obsidian";

export class DiaryFolderModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private readonly onChooseFolder: (folderPath: string) => void,
  ) {
    super(app);
    this.setTitle("日記ディレクトリを選択");
    this.setPlaceholder("フォルダを検索");
    this.emptyStateText = "フォルダがありません。";
  }

  getItems(): string[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && !file.isRoot())
      .map((folder) => folder.path)
      .sort((left, right) => left.localeCompare(right));
  }

  getItemText(folderPath: string): string {
    return folderPath;
  }

  onChooseItem(folderPath: string): void {
    this.onChooseFolder(folderPath);
  }
}
