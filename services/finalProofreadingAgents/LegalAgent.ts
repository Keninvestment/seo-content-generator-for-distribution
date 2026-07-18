// 法令・規制チェックエージェント（オプション）
import { BaseProofreadingAgent } from "./BaseAgent";
import type { Issue, Suggestion } from "./types";
import { taxInvestVerticalPrompt } from "./domainPromptBlocks";
import { REVIEW_HEAVY_MODEL } from "../modelConfig";

export class LegalAgent extends BaseProofreadingAgent {
  constructor() {
    super("法令・規制チェックエージェント", "legal", REVIEW_HEAVY_MODEL);
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
あなたは法的コンプライアンスと規制準拠を確認する専門家です。
以下の記事の法的リスクを検証してください。
${taxInvestVerticalPrompt(context)}

【記事内容】
${content}

【検証項目】
1. 薬機法・景表法の遵守確認
2. 著作権法・引用ルールの準拠
3. 個人情報保護法の遵守
4. 業界ガイドラインの準拠
5. 誇大広告・虚偽表示のチェック

【特に注意すべき表現】
- 「No.1」「最高」「唯一」等の最上級表現（根拠必要）
- 「必ず」「絶対」「100%」等の断定表現
- 医療・健康に関する効果効能
- 金融商品の利回り保証
- 個人情報の取り扱い

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "legal-risk",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "法的リスクの説明",
      "original": "問題のある表現",
      "suggestion": "修正案",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "legal-compliance",
      "description": "コンプライアンス改善提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, true);
      return this.parseResponse(response);
    } catch (error) {
      console.error("法令チェックエラー:", error);
      return {
        score: 90,
        issues: [],
        suggestions: [],
        confidence: 75,
      };
    }
  }
}
