import { normalizePath, PluginSettingTab, Setting, type App } from "obsidian";
import type DiaryPlugin from "./main";

export class DiarySettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: DiaryPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("日記フォルダ")
      .setDesc("YYYY-M/YYYY-MM-DD.md形式の日記を置くフォルダです。")
      .addText((text) =>
        text.setValue(this.plugin.diarySettings.diaryFolder).onChange(async (value) => {
          const diaryFolder = normalizePath(value.trim());
          if (!diaryFolder) {
            return;
          }
          this.plugin.diarySettings.diaryFolder = diaryFolder;
          await this.plugin.saveSettings();
        }),
      );
  }
}
