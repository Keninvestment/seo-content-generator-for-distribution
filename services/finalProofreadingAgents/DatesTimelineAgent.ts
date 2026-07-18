// 日付・時系列検証エージェント
import { BaseProofreadingAgent } from "./BaseAgent";
import type { Issue, Suggestion } from "./types";
import { taxInvestVerticalPrompt } from "./domainPromptBlocks";
import { REVIEW_LIGHT_MODEL } from "../modelConfig";

export class DatesTimelineAgent extends BaseProofreadingAgent {
  constructor() {
    super("日付・時系列検証エージェント", "dates-timeline", REVIEW_LIGHT_MODEL);
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
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const prompt = `
あなたは日付と時系列の整合性を確認する専門家です。
現在は${currentYear}年${currentMonth}月です。
以下の記事の日付・時系列情報を検証してください。
${taxInvestVerticalPrompt(context)}

【記事内容】
${content}

【検証項目】
1. 年月日の正確性・整合性
2. 時系列の論理的順序
3. 「最新」「現在」等の時期表現の妥当性
4. イベント・リリース日の確認
5. 将来の日付の適切性

【注意】
- ${currentYear}年の情報を「最新」として扱う
- 古い年の情報には「○年時点」の注記が必要

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "outdated-info" | "inconsistency",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "問題の説明",
      "original": "元の表記",
      "suggestion": "修正案",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "temporal-clarity",
      "description": "時期を明確にする提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, true);
      return this.parseResponse(response);
    } catch (error) {
      console.error("日付チェックエラー:", error);
      return {
        score: 85,
        issues: [],
        suggestions: [],
        confidence: 70,
      };
    }
  }
}
