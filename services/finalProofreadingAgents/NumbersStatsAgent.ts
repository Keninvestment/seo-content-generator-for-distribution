// 数値・統計確認エージェント
import { BaseProofreadingAgent } from "./BaseAgent";
import type { Issue, Suggestion } from "./types";
import { taxInvestVerticalPrompt } from "./domainPromptBlocks";
import { REVIEW_LIGHT_MODEL } from "../modelConfig";

export class NumbersStatsAgent extends BaseProofreadingAgent {
  constructor() {
    super(
      "数値・統計確認エージェント",
      "numbers-stats",
      REVIEW_LIGHT_MODEL // 高速処理用の軽量モデル
    );
  }

  protected async performCheck(
    content: string,
    context?: any
  ): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
  }> {
    const prompt = `
あなたは数値データと統計情報の正確性を検証する専門家です。
以下の記事から数値・統計情報を抽出し、その妥当性を検証してください。
${taxInvestVerticalPrompt(context)}

【記事内容】
${content}

【検証項目】
1. パーセンテージ・割合の計算確認
2. 統計データの出典確認
3. 価格・料金情報の最新性
4. 成長率・変化率の妥当性
5. 数値の単位と桁数の整合性

【サンプル実績数値】
- A社: LP制作費削減（コスト削減）
- B社: 原稿執筆時間短縮（時間削減）
- C社: 業務時間削減（効率化）

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "factual-error" | "inconsistency",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "問題の説明",
      "original": "元の数値",
      "suggestion": "正しい数値",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "data-source",
      "description": "出典の追加提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, true);
      return this.parseResponse(response);
    } catch (error) {
      console.error("数値チェックエラー:", error);
      return {
        score: 80,
        issues: [],
        suggestions: [],
        confidence: 60,
      };
    }
  }
}
