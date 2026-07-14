// 技術仕様確認エージェント
import { BaseProofreadingAgent } from "./BaseAgent";
import type { Issue, Suggestion } from "./types";
import { taxInvestVerticalPrompt } from "./domainPromptBlocks";
import { REVIEW_HEAVY_MODEL } from "../modelConfig";

export class TechnicalAgent extends BaseProofreadingAgent {
  constructor() {
    super("技術仕様確認エージェント", "technical", REVIEW_HEAVY_MODEL);
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
    // 最新AIモデル情報を含める
    const aiModelContext = this.formatLatestAIModels(context);

    const prompt = `
あなたは技術情報とAPI仕様等の正確性を検証する専門家です。
以下の記事の技術的記述を検証してください。
${aiModelContext}
${taxInvestVerticalPrompt(context)}
【記事内容】
${content}

【検証項目】
1. APIパラメータ・メソッドの正確性
2. バージョン番号の最新性
3. 技術用語の適切な使用
4. コード例の動作可能性
5. 技術仕様の正確性

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "technical-error" | "outdated-info",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "問題の説明",
      "original": "元の記述",
      "suggestion": "正しい記述",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "technical-accuracy",
      "description": "技術的正確性の改善提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, true, context);
      return this.parseResponse(response);
    } catch (error) {
      console.error("技術仕様チェックエラー:", error);
      return {
        score: 80,
        issues: [],
        suggestions: [],
        confidence: 70,
      };
    }
  }
}
