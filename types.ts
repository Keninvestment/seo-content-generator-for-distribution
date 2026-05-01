// 見出し構造の階層を表現
export interface HeadingStructure {
  h1: string;
  h2Items: Array<{
    text: string;
    h3Items: string[];
  }>;
}

// 個別記事の詳細分析結果
export interface ArticleAnalysis {
  rank: number;
  url: string;
  title: string;
  summary: string;
  characterCount: number;
  headingStructure: HeadingStructure;
  isArticle: boolean; // コラム記事かどうか
  excludeReason?: string; // 除外理由（ショッピング、PDF等）
}

// 頻出単語の情報
export interface FrequencyWord {
  word: string;
  count: number;
  articleCount: number; // 何記事で使われているか
  articles: number[]; // 使用している記事のランク番号
}

// 競合分析の全体結果
export interface CompetitorResearchResult {
  keyword: string;
  analyzedAt: string;
  totalArticlesScanned: number;
  validArticles: ArticleAnalysis[];
  excludedCount: number;
  commonTopics: string[];
  recommendedWordCount: {
    min: number;
    max: number;
    optimal: number;
  };
  frequencyWords?: FrequencyWord[]; // 頻出単語リスト
}

export interface SubheadingWithNote {
  text: string;
  writingNote?: string; // H3ごとの執筆メモ
}

// Ver.2用の型定義
export interface IntroductionPatterns {
  conclusionFirst: string; // 結論先行型
  empathy: string; // 共感型
}

export interface OutlineSectionV2 {
  heading: string;
  subheadings: SubheadingWithNote[];
  imageSuggestion: string; // 具体的な画像提案（被写体・構図まで）
  writingNote: string; // H2ごとの執筆メモ（最大200字）
}

export interface CompetitorComparisonSummary {
  averageH2Count: number;
  averageH3Count: number;
  ourH2Count: number;
  ourH3Count: number;
  freshnessRisks: string[]; // 競合の古い箇所
  differentiators: string[]; // 差分ポイント3点
}

export interface SeoOutlineV2 {
  title: string; // 32文字以内
  metaDescription: string; // 100文字以内、KW含む
  introductions: IntroductionPatterns; // 2パターンの導入文
  targetAudience: string;
  outline: OutlineSectionV2[];
  conclusion: string;
  keywords: string[];
  characterCountAnalysis?: {
    average: number;
    median: number;
    min: number;
    max: number;
    analyzedArticles: number;
  };
  competitorComparison: CompetitorComparisonSummary;
  searchIntent: {
    primary: string; // 主意図（KNOW/DO/NAV/LOCAL）
    secondary?: string; // 副意図
  };
  freshnessData?: {
    lastUpdated?: string;
    hasOutdatedInfo: boolean;
    outdatedSections?: string[];
  };
}

// 構成チェック結果
export interface OutlineCheckResult {
  isValid: boolean;
  errors: {
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }[];
  suggestions: string[];
}

export interface OutlineSection {
  heading: string;
  subheadings: string[] | SubheadingWithNote[]; // 文字列配列または詳細オブジェクト配列
  imageSuggestion?: string;
  writingNote?: string; // H2全体の執筆メモ
}

export interface CharacterCountAnalysis {
  average: number;
  median: number;
  min: number;
  max: number;
  analyzedArticles: number;
}

export interface SeoOutline {
  title: string;
  targetAudience: string;
  introduction: string;
  outline: OutlineSection[];
  conclusion: string;
  keywords: string[];
  characterCountAnalysis: CharacterCountAnalysis;
  competitorResearch?: CompetitorResearchResult; // 競合分析結果を追加
  /** Ver.2 との表示互換（任意） */
  metaDescription?: string;
}

/** Ver.2 構成かどうか */
export function isSeoOutlineV2(
  o: SeoOutline | SeoOutlineV2
): o is SeoOutlineV2 {
  return "introductions" in o;
}

export function getOutlineMetaDescription(
  o: SeoOutline | SeoOutlineV2,
  keyword: string
): string {
  if (isSeoOutlineV2(o)) return o.metaDescription;
  return o.metaDescription ?? `${keyword}に関する詳細な解説記事です。`;
}

export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}