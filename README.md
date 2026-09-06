# Diary Tasks

Obsidianの日記で、未完了のTODOをPCのタイムゾーンの日付変更後の日記へ持ち越すプラグインです。

## 機能

- 日記を`diary/YYYY-M/YYYY-MM-DD.md`に作成
- `[ ]`のTODOだけを翌日へ持ち越し
- 階層TODOの親子関係を維持
- 日記ディレクトリ直下の`template.md`を使用
- テンプレートの`<!-- diary -->`、`<!-- todo-today -->`、`<!-- todo -->`を対応するセクションで置換
- 初回設定でVault内の日記ディレクトリを選択
- リポジトリの`template.md`を初回開始時にコピー
- 初回設定が完了するまで日記を作成・変更しない

## ローカルで使う

このリポジトリは現在のディレクトリで管理し、ビルドしたファイルをVaultへコピーします。

```bash
pnpm install
pnpm build
mkdir -p /path/to/vault/.obsidian/plugins/diary-tasks
cp dist/main.js manifest.json template.md /path/to/vault/.obsidian/plugins/diary-tasks/
```

Obsidianでコミュニティプラグインを有効にし、`Diary Tasks`を有効にしてください。ソースを変更した場合は`pnpm build`を実行してから`dist/main.js`を再度コピーします。

## 開発・検査

```bash
pnpm dev
pnpm check
pnpm test
```
