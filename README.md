# Diary Tasks

Obsidianの日本時間の日付変更時に、日記の未完了TODOだけを次の日へ持ち越すプラグインです。

## 対応する日記パス

初期設定では次の形式を使います。

```text
diary/YYYY-M/YYYY-MM-DD.md
```

例: `diary/2026-8/2026-08-25.md`

設定画面で日記フォルダとテンプレートファイルを変更できます。テンプレートパスを空欄にすると、日記フォルダ直下の`template.md`（初期値では`diary/template.md`）を使います。テンプレート以外の前日本文は新しい日記へ持ち越しません。

## TODOの持ち越し

`[x]`と`[-]`は元の日記に残り、`[ ]`だけが次の日へ移動します。階層TODOは、完了済みの枝を元の日に残し、未完了の枝と必要な親行だけを次の日へ作成します。

```markdown
- [ ] root
  - [x] suba
  - [ ] subb
```

元の日:

```markdown
- [ ] root
  - [x] suba
```

次の日:

```markdown
- [ ] root
  - [ ] subb
```

次の日のファイルがすでに存在する場合は、新しいタスクを追記しません。これにより、Obsidianを再起動しても同じタスクが重複しません。

プラグインが自動生成した日記をその日まったく編集しなかった場合は、次回起動時に空の翌日日記を新規作成せず、そのファイルを次の日のパスへリネームします。手動で編集した日記はリネームせず、通常のTODO持ち越し処理を行います。

## 開発

```bash
pnpm install
pnpm build
```

生成された`main.js`、`manifest.json`、`styles.css`（使用する場合）をVaultの`.obsidian/plugins/diary-tasks/`へ配置します。開発中は`pnpm dev`を使えます。

検査:

```bash
pnpm check
pnpm test
```

コミット時はLefthookが整形、Lint、型検査、テストを実行します。
