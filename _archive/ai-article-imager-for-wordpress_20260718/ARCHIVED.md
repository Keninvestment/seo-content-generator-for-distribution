# Archived

2026-07-18 KEN裁定（Issue #3670）によりImage2完成画像原則へ置換のため退避。本番未接続のまま廃止。参照実装として保持。

## 利用制限

- このディレクトリは参照専用。起動・デプロイ・新規機能への再利用は禁止。
- 新しい画像生成・WordPress記事への画像設定には、現行のImage2完成画像フローを使用する。
- 親アプリ側に残る `VITE_IMAGE_GEN_URL`、`localhost:5177`、`articleDataForImageGen`、画像エージェント向けCORSなどのruntime callsiteはdormant legacyであり、使用禁止。
- これら残存runtime callsiteの完全除去は、このarchive移動とは分けたfollow-upで実施する。
