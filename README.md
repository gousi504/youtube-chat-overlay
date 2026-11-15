# YouTube Chat Overlay

OBS 用の YouTube ライブチャット表示ツール。API キー不要。Windows 用。

## ダウンロード

**[最新版をダウンロード（youtube-chat-overlay.zip）](https://github.com/gousi504/youtube-chat-overlay/releases/latest/download/youtube-chat-overlay.zip)**

1. 上のリンクから zip をダウンロード
2. zip を右クリック →「すべて展開」で好きな場所に解凍（デスクトップやドキュメントなど）
3. 解凍したフォルダの中の `start.bat` をダブルクリック

追加のインストールは不要（動作に必要な Node.js は同梱済み）。

> 初回起動時に「Windows によって PC が保護されました」と出たら「詳細情報」→「実行」。
> 「ファイアウォールでブロックされています」と出たら「キャンセル」で問題ない（自分の PC の中だけで通信するため）。

## 使い方

1. `start.bat` をダブルクリック（黒い窓が開く。配信中は閉じない）
2. 自動でブラウザに設定画面 http://localhost:3456/ が開く
3. 「1. YouTube に接続」に配信 URL を貼って「接続」
4. 「2. OBS に貼る URL」の `http://localhost:3456/overlay.html` をコピー
5. OBS → ソース「＋」→「ブラウザ」→ URL に貼る。幅 480 / 高さ 800 くらい
6. 「3. デザインテーマ」で見た目を選ぶ。変更は OBS に即反映

終わるときは黒い窓を閉じる。

## 更新のしかた

1. 黒い窓（start.bat）を閉じる
2. `update.bat` をダブルクリック
3. 「更新が完了しました」と出たら `start.bat` で起動

自分の設定（`config.json`）とマイテーマはそのまま残る。

## ファイル

- `start.bat` : 起動
- `update.bat` : 最新版に更新
- `server.js` : コメント取得サーバー（Node.js）
- `public/index.html` : 設定画面
- `public/overlay.html` : OBS に映すページ
- `public/themes.js` : テーマの初期値
- `config.json` : 保存された設定（自動生成。消すと初期状態に戻る）
- `runtime/node.exe` : 同梱の Node.js（MIT License）

## 開発者向け

ソースから動かす場合は Node.js をインストール後、このフォルダで `npm install` → `npm start`。
配布用 zip は `node tools/build-release.js` で `dist/` に作成される。
