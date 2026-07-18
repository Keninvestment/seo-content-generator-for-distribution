# Regression baseline（Phase 5 SEO rebase 向け）

Refs: GitHub #1512  
目的: リファクタ・SDK差し替え時に **破ってはいけない入出力契約** を固定する。  
正本コード: `types.ts`, `services/outlineGeneratorV2.ts`, `services/competitorResearchWithWebFetch.ts`, `services/finalProofreadingAgents/types.ts`, `ai-article-imager-for-wordpress/services/wordpressService.ts`, `components/ArticleDisplay.tsx`

> **archived（#3670）:** `ai-article-imager-for-wordpress/` の回帰契約は旧実装の参照用で、実装は `_archive/ai-article-imager-for-wordpress_20260718/` へ退避済みです。

---

## 1. Outline generation（構成生成）

### 入力（期待）

- **キーワード**（文字列）と、UI／サービスが解釈する **V1 / V2 フラグ**（アプリ側の生成経路）。
- V2 経路: `generateOutlineV2` 等で LLM＋（任意で）競合データを渡す。

### 出力（必須フィールド）

**`SeoOutline`（V1）** — `types.ts`

- `title`, `targetAudience`, `introduction`, `outline`, `conclusion`, `keywords`
- `outline[]`: `heading`, `subheadings`（`string[]` または `SubheadingWithNote[]`）, 任意 `imageSuggestion`, `writingNote`
- `characterCountAnalysis` 必須
- 任意: `competitorResearch`, `metaDescription`（表示互換）

**`SeoOutlineV2`** — `types.ts`

- `title`, `metaDescription`, `introductions`（`conclusionFirst`, `empathy`）, `targetAudience`, `outline[]`, `conclusion`, `keywords`
- `outline[]`: `heading`, `subheadings`（`SubheadingWithNote[]`）, `imageSuggestion`, `writingNote`
- `competitorComparison`, `searchIntent` 必須
- 任意: `characterCountAnalysis`, `freshnessData`

### 互換ヘルパ

- `isSeoOutlineV2`, `getOutlineMetaDescription` — UI・校閲は V1/V2 混在をここで吸収すること。

---

## 2. Competitor research（競合調査）

### 入力

- **キーワード**（文字列）
- `useGoogleSearch`（API 経路）／または URL `?mock=true` で **固定モック**（`getMockCompetitorResearch`）。

### 出力（`CompetitorResearchResult`）

- `keyword`, `analyzedAt`, `totalArticlesScanned`, `validArticles[]`, `excludedCount`
- `commonTopics[]`, `recommendedWordCount: { min, max, optimal }`
- 任意: `frequencyWords[]`
- `validArticles[]` の各要素は `ArticleAnalysis`（`headingStructure.h1` / `h2Items[].text` / `h3Items` 等）を満たすこと。

---

## 3. WordPress payload（連携データ）

アプリ内には「REST の単一 JSON スキーマ」より **localStorage + postMessage** が正本に近い。

### 3.1 Article Display → 画像エージェント（`ArticleDisplay.tsx`）

**localStorage キー**: `articleDataForImageGen`  
**値（JSON）**:

| フィールド           | 型     | 備考 |
|----------------------|--------|------|
| `title`              | string | 必須 |
| `htmlContent`        | string | 必須（本文 HTML） |
| `metaDescription`    | string | 推奨 |
| `keyword`            | string | 必須 |
| `slug`               | string | 未設定時 `"auto-generated"` 等 |

**postMessage**（別タブフォールバック）:

```json
{ "type": "ARTICLE_DATA", "data": "<上記と同形の articleData>" }
```

### 3.2 AI Article Imager → WordPress API（`wordpressService.ts`）

**`POST .../wordpress/create-post` ボディ**:

- `title` ← `PostConfig.title`
- `content` ← 連結済み HTML 文字列
- `status` ← `'draft' | 'publish'`
- 任意: `slug`

期待レスポンス: `{ link: string, id: number }`（クライアントが使用）。

**`POST .../wordpress/upload-image`**（参考）: `base64Image`, `filename`, `title`, `altText` 等。

---

## 4. Proofreading（校閲・統合結果）

### コア型（`services/finalProofreadingAgents/types.ts`）

- **`IntegrationResult`**: `overallScore`, `passed`, `agentResults[]`, `criticalIssues` / `majorIssues` / `minorIssues`, `suggestions[]`, `executionSummary`, `regulationScore`。任意: `improvementPlan[]`, `passReason`, `previousScore`。
- **`AgentResult`**: `agentName`, `agentType`, `issues[]`, `confidence`, `status` 等（必須フィールドは型定義に従う）。
- **`Issue`**: `type`, `severity`, `location`, `description`, `original`, `confidence` 必須。任意: `agentName`, `suggestion`。
- **`SourceInsertion`**: `heading`, `url`, `title` 必須。任意: `location`, `h2`, `h3`（ログ・リビジョン互換）。

### レガシー互換

- `IssueType` に `statistical-error`, `citation-missing`, `structure-issue` 等を含め、モック・取り込み JSON を壊さないこと。
- `AgentType` に `source-requirement`, `source-enhancement` を含めること。

---

## 5. 回帰確認のコマンド

```bash
cd seo-content-generator-for-distribution && npx tsc --noEmit
```

型エラー 0 を維持すること。詳細な手動経路は `smoke/SMOKE_TEST.md`。
