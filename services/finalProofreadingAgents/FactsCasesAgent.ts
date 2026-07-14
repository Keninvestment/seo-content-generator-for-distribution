// 事例・ファクト検証エージェント
import { BaseProofreadingAgent } from './BaseAgent';
import type { Issue, Suggestion } from './types';
import { taxInvestVerticalPrompt } from './domainPromptBlocks';
import { REVIEW_HEAVY_MODEL } from '../modelConfig';

export class FactsCasesAgent extends BaseProofreadingAgent {
  constructor() {
    super(
      '事例・ファクト検証エージェント',
      'facts-cases',
      REVIEW_HEAVY_MODEL // Web検索で事実確認
    );
  }
  
  protected async performCheck(content: string, context?: any): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
  }> {
    // 最新AIモデル情報を含める
    const aiModelContext = this.formatLatestAIModels(context);

    const prompt = `
あなたは事例と事実情報の真正性を検証する専門家です。
以下の記事から事例・事実情報を抽出し、その正確性を検証してください。
${aiModelContext}
${taxInvestVerticalPrompt(context)}
【記事内容】
${content}

【検証項目】
1. 企業事例の実在性確認
2. 成功事例の数値検証
3. 業界事例の妥当性
4. ケーススタディの正確性
5. 統計データの出典確認

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "factual-error" | "missing-source",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "問題の説明",
      "original": "元の記述",
      "suggestion": "修正案",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "source-addition",
      "description": "出典追加の提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, true, context);
      return this.parseResponse(response);
    } catch (error) {
      console.error('事例検証エラー:', error);
      return {
        score: 80,
        issues: [],
        suggestions: [],
        confidence: 65
      };
    }
  }
}
