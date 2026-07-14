// 固有名詞校閲エージェント
import { BaseProofreadingAgent } from './BaseAgent';
import type { Issue, Suggestion } from './types';
import { COMPANY_MASTER } from '../companyMasterData';
import { REVIEW_HEAVY_MODEL } from '../modelConfig';
// latestAIModelsは汎用化のため削除

export class ProperNounsAgent extends BaseProofreadingAgent {
  constructor() {
    super(
      '固有名詞校閲エージェント',
      'proper-nouns',
      REVIEW_HEAVY_MODEL // Web検索を使うため中規模モデル
    );
  }

  // 登録企業の誤情報をチェック
  private checkRegisteredCompanies(content: string): Issue[] {
    const issues: Issue[] = [];

    // COMPANY_MASTERから動的に全企業をチェック
    for (const [key, companyInfo] of Object.entries(COMPANY_MASTER)) {
      const companyName = key;

      // 1. 会社形態の誤りをチェック（株式会社/合同会社/有限会社など）
      if (content.includes(companyName)) {
        // 正しい会社形態を抽出
        const correctForm = this.extractCompanyForm(companyInfo.fullName);
        const incorrectForms = this.getIncorrectForms(correctForm);

        // 間違った会社形態で記載されていないかチェック
        for (const incorrectForm of incorrectForms) {
          const incorrectPattern = new RegExp(`${incorrectForm}${companyName}`, 'g');
          const matches = content.match(incorrectPattern);

          if (matches) {
            issues.push({
              type: 'factual-error',
              severity: 'critical',
              location: `${companyName}の会社形態`,
              description: `正式名称は「${companyInfo.fullName}」です`,
              original: `${incorrectForm}${companyName}`,
              suggestion: companyInfo.fullName,
              confidence: 100
            });
          }
        }

        // 2. 業界・事業内容の誤りをチェック（汎用ロジック）
        // 固有名詞のチェックは汎用版では簡略化
      }
    }

    return issues;
  }

  // 会社形態を抽出するヘルパーメソッド
  private extractCompanyForm(fullName: string): string {
    if (fullName.includes('株式会社')) return '株式会社';
    if (fullName.includes('合同会社')) return '合同会社';
    if (fullName.includes('有限会社')) return '有限会社';
    if (fullName.includes('一般社団法人')) return '一般社団法人';
    if (fullName.includes('LLC')) return 'LLC';
    return '';
  }

  // 間違った会社形態のリストを取得
  private getIncorrectForms(correctForm: string): string[] {
    const allForms = ['株式会社', '合同会社', '有限会社', '一般社団法人'];
    return allForms.filter(form => form !== correctForm);
  }

  protected async performCheck(content: string, context?: any): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
  }> {
    // まず内部データで登録企業をチェック
    const registeredCompanyIssues = this.checkRegisteredCompanies(content);

    // 登録企業の正確な情報を準備
    const registeredCompanies = Object.entries(COMPANY_MASTER).map(([key, info]) =>
      `- ${info.fullName}（${info.displayName}）: ${info.industry}`
    ).join('\n');

    const prompt = `
あなたは固有名詞の正確性を検証する専門家です。
以下の記事から固有名詞（企業名、製品名、人物名、地名等）を抽出し、その正確性を検証してください。

【記事内容】
${content}

【検証項目】
1. 企業名・団体名の正式名称
2. 製品名・サービス名の表記
3. 人物名・役職の正確性
4. 地名・施設名の正確性
5. ブランド名・商標の適切な使用

【登録企業の情報（これらは内部データを優先）】
${registeredCompanies}

【特に注意】
- 自社ブランドは外部検証不要
- 上記の登録企業については、記載の業界情報が正確です（Web検索結果より優先）

【出力形式】
{
  "score": 0-100の評価点,
  "confidence": 0-100の確信度,
  "issues": [
    {
      "type": "factual-error" | "brand-error",
      "severity": "critical" | "major" | "minor",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "問題の説明",
      "original": "元の表記",
      "suggestion": "正しい表記",
      "confidence": 0-100
    }
  ],
  "suggestions": [
    {
      "type": "improvement",
      "description": "改善提案",
      "implementation": "具体的な実装方法",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    try {
      // Web検索を有効にして最新情報を確認（登録企業以外）
      const response = await this.callGPT5(prompt, true);
      const gptResult = this.parseResponse(response);

      // 内部チェックの結果を統合
      const allIssues = [...registeredCompanyIssues, ...gptResult.issues];

      // 登録企業の誤情報があった場合、スコアを減点
      const internalIssuesCount = registeredCompanyIssues.length;
      const score = internalIssuesCount > 0
        ? Math.max(0, gptResult.score - (internalIssuesCount * 10))
        : gptResult.score;

      return {
        score,
        issues: allIssues,
        suggestions: gptResult.suggestions,
        confidence: Math.max(gptResult.confidence, internalIssuesCount > 0 ? 95 : 50)
      };
    } catch (error) {
      console.error('固有名詞チェックエラー:', error);
      // エラー時でも内部チェックの結果は返す
      return {
        score: registeredCompanyIssues.length > 0 ? 60 : 75,
        issues: registeredCompanyIssues,
        suggestions: [],
        confidence: 50
      };
    }
  }
}
