// 修正サービステスト用の模擬校閲結果データ
import type { IntegrationResult } from "../services/finalProofreadingAgents/types";

export const mockProofreadingResult: IntegrationResult = {
  overallScore: 58,
  passed: false,
  agentResults: [],
  criticalIssues: [
    {
      agentName: "固有名詞校閲エージェント",
      type: "factual-error",
      severity: "critical",
      description:
        "GPT-6やClaude 4など、2025年9月時点で存在しないモデル名が記載されています",
      location: "【H2】生成AIとは？基本概念と仕組み",
      original:
        "GPT-6やClaude 4などの最新モデルは、人間と同等以上の文章生成能力を持ち",
      suggestion:
        "現在利用可能なモデル（GPT-4o、Claude 3.5 Sonnet等）に修正し、正確な情報を記載してください",
      confidence: 0.92,
    },
    {
      agentName: "数値・統計確認エージェント",
      type: "factual-error",
      severity: "critical",
      description: "400兆パラメータという数値に根拠がありません",
      location: "【H3】1. 生成AIの定義と特徴",
      original:
        "GPT-5は、2025年1月にリリースされ、400兆個のパラメータを持つ世界最大のモデル",
      suggestion:
        "公式に発表されているパラメータ数に修正するか、未公開の場合はその旨を明記してください",
      confidence: 0.88,
    },
    {
      agentName: "数値・統計確認エージェント",
      type: "statistical-error",
      severity: "critical",
      description: "業務効率300%向上という数値の根拠が不明です",
      location: "【H2】生成AIとは？基本概念と仕組み",
      original: "業務効率を300%向上させることが可能です",
      suggestion:
        "具体的な事例や調査データを引用し、現実的な数値に修正してください",
      confidence: 0.85,
    },
    {
      agentName: "出典補強エージェント",
      type: "citation-missing",
      severity: "critical",
      description:
        "DeepL Proの200言語対応という情報に出典がなく、事実と異なります",
      location: "【H3】5. 翻訳・多言語対応",
      original: "DeepL Proの最新版は、200言語に対応し",
      suggestion:
        "DeepLの公式サイトによると約30言語対応です。正確な情報に修正し、出典を追加してください",
      confidence: 0.9,
    },
  ],
  majorIssues: [
    {
      agentName: "構造検証エージェント",
      type: "structure-issue",
      severity: "major",
      description: "H2見出しの文字数が長すぎます（50文字以上）",
      location: "3番目のH2見出し",
      original:
        "生成AIを活用した業務効率化の具体的な方法と導入時の注意点について詳しく解説",
      suggestion:
        "30文字程度に短縮：生成AIによる業務効率化の方法と注意点",
      confidence: 0.75,
    },
    {
      agentName: "日付・時系列検証エージェント",
      type: "temporal-inconsistency",
      severity: "major",
      description:
        "2025年1月と記載されていますが、現在は2025年9月です",
      location: "【H3】1. 生成AIの定義と特徴",
      original: "2025年1月にリリースされ",
      suggestion:
        "時系列を正確に記載するか、『予定』『計画』などの表現を使用してください",
      confidence: 0.8,
    },
    {
      agentName: "文章品質エージェント",
      type: "readability-issue",
      severity: "major",
      description: "同じ語尾（です・ます）が4文連続しています",
      location: "【H2】生成AIの基本的な仕組み - 第2段落",
      original: "～できます。～なります。～します。～できます。",
      suggestion:
        "語尾にバリエーションを持たせ、体言止めや「でしょう」なども活用してください",
      confidence: 0.7,
    },
    {
      agentName: "SEO最適化エージェント",
      type: "keyword-density",
      severity: "major",
      description:
        "メインキーワード『生成AI 活用法』の出現頻度が低すぎます（0.8%）",
      location: "記事全体",
      original: "",
      suggestion:
        "キーワード密度を2-3%程度に調整し、自然な形で配置してください",
      confidence: 0.72,
    },
    {
      agentName: "技術仕様確認エージェント",
      type: "technical-accuracy",
      severity: "major",
      description: "Gemini 3.0 Ultraは存在しないモデルです",
      location: "【H3】2. 従来のAIとの違い",
      original: "Googleの最新モデルGemini 3.0 Ultraは、99.9%の精度で",
      suggestion: "実在するモデル（Gemini 1.5 Pro等）に修正してください",
      confidence: 0.86,
    },
  ],
  minorIssues: [
    {
      agentName: "文章品質エージェント",
      type: "style-issue",
      severity: "minor",
      description: "『することができます』は冗長表現です",
      location: "記事内の複数箇所",
      original: "",
      suggestion: "『できます』に短縮してください",
      confidence: 0.65,
    },
    {
      agentName: "構造検証エージェント",
      type: "formatting-issue",
      severity: "minor",
      description: "リスト項目の表記が統一されていません",
      location: "【H3】活用事例の箇条書き部分",
      original: "",
      suggestion: "すべて『・』または番号付きリストに統一してください",
      confidence: 0.68,
    },
  ],
  suggestions: [],
  improvementPlan: [
    "1. まず重大な事実誤認（GPT-6、400兆パラメータ等）を修正",
    "2. 出典が必要な箇所に信頼できるソースを追加",
    "3. SEO最適化のためキーワード配置を調整",
    "4. 文章の読みやすさを向上（語尾の多様化、段落構成の改善）",
  ],
  recommendation: "revise",
  detailedReport: "モック: REGRESSION_BASELINE / smoke 用の固定校閲結果",
  regulationScore: {
    factChecking: 18,
    reliability: 8,
    companyCompliance: 7,
    structureRules: 12,
    legalCompliance: 3,
    overallQuality: 10,
    total: 58,
  },
  executionSummary: {
    successfulAgents: 9,
    failedAgents: 0,
    timeoutAgents: 0,
    totalTime: 15000,
  },
};

// テスト用の記事内容（最終校閲テストと同じ）
export const mockArticleContent = `
<h2>生成AIとは？基本概念と仕組み</h2>
<p>生成AI（Generative AI）は、<b>2024年に最も注目される技術</b>として、ビジネス界に革命をもたらしています。GPT-6やClaude 4などの最新モデルは、人間と同等以上の文章生成能力を持ち、業務効率を300%向上させることが可能です。</p>

<h3>1. 生成AIの定義と特徴</h3>
<p>生成AIとは、大規模言語モデル（LLM）を基盤として、テキスト、画像、音声などのコンテンツを自動生成する人工知能技術です。OpenAIのGPT-5は、2025年1月にリリースされ、400兆個のパラメータを持つ世界最大のモデルとなりました。</p>

<h3>2. 従来のAIとの違い</h3>
<p>従来のAIが特定タスクに特化していたのに対し、生成AIは汎用的な問題解決能力を持ちます。例えば、Googleの最新モデルGemini 3.0 Ultraは、99.9%の精度で文章を生成でき、人間の専門家を上回るパフォーマンスを実現しています。</p>

<h2>生成AIの活用法10選</h2>
<p>ビジネスシーンで即座に実践できる生成AIの活用方法を、具体例とともにご紹介します。</p>

<h3>1. コンテンツ制作の自動化</h3>
<p>ブログ記事、SNS投稿、メールマガジンなどのコンテンツを自動生成できます。毎月1000本の記事を10分で生成することも可能になりました。</p>

<h3>2. カスタマーサポートの効率化</h3>
<p>AIチャットボットによる24時間365日の顧客対応が実現できます。回答精度は98%を超え、顧客満足度を50%向上させることができます。</p>

<h3>3. データ分析とレポート作成</h3>
<p>膨大なデータから重要な洞察を抽出し、経営判断に必要なレポートを自動作成します。分析時間を90%削減できます。</p>

<h3>4. プログラミング支援</h3>
<p>GitHub Copilot Xは、コード生成の精度が95%に達し、開発生産性を10倍に向上させます。バグの自動修正機能も搭載されています。</p>

<h3>5. 翻訳・多言語対応</h3>
<p>DeepL Proの最新版は、200言語に対応し、プロの翻訳者と同等の品質を実現しています。リアルタイム翻訳により、国際会議での同時通訳も可能です。</p>

<h2>まとめ：生成AI活用法で業務効率を最大化</h2>
<p>生成AIは、もはや「使うかどうか」ではなく「どう使いこなすか」の時代に入りました。本記事でご紹介した活用法を参考に、ぜひ自社の業務効率化にお役立てください。</p>
`;
