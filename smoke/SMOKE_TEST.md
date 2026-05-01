# スモークテスト（最短経路）：キーワード → 記事 → 校閲 → 出力

Refs #1512。API キー無しで **競合のみモック**できる経路を優先する。

## 前提

- Node 18+
- ルート: `seo-content-generator-for-distribution/`

```bash
cd seo-content-generator-for-distribution
cp .env.example .env   # 既存ならスキップ。Gemini 等は記事生成・校閲で必要
npm install
```

## 手順 A: 競合調査をモック（`?mock=true`）

1. 開発サーバ起動: `npm run dev`（通常 `http://localhost:5173`）。
2. ブラウザで **`http://localhost:5173/?mock=true`** を開く（`generateCompetitorResearch` が固定データを返す）。
3. 記事ライターモードで **キーワード** に `smoke-keyword.txt` の1行（または任意の短い KW）を入力。
4. 構成生成 → 記事生成まで進め、`article.title` / `htmlContent` / `metaDescription` が表示されることを確認。
5. **校閲**を実行し、レポートに `IntegrationResult` 相当のスコア・issues が出ることを確認（API 未設定時はエラーメッセージで止まってよい。その場合は手順 B）。

## 手順 B: サンプル JSON（オフライン確認）

- `smoke/sample-outline-v2-fragment.json` — V2 構成の最小断片（フィールド存在チェック・フィクスチャ用途）。
- 実アプリへのインポート UI が無い場合は、開発者コンソールで `JSON.parse` し、`SeoOutlineV2` として読み取れることを確認。

## 手順 C: WordPress 連携ペイロード（表示のみ）

1. 記事生成後、「画像エージェント」起動動線まで進む（または HTML コピーで代替）。
2. DevTools → Application → Local Storage で **`articleDataForImageGen`** を確認。
3. 期待キー: `title`, `htmlContent`, `metaDescription`, `keyword`, `slug`（`docs/REGRESSION_BASELINE.md` §3.1 参照）。

## 完了条件

- [ ] `npx tsc --noEmit` がエラー 0
- [ ] 手順 A または B で「構成・本文・校閲のいずれか」まで到達可能
- [ ] 手順 C で localStorage ペイロード形状が baseline と一致
