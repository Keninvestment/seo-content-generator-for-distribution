// サービス専門エージェント（汎用スタブ版）
import { BaseProofreadingAgent } from './BaseAgent';
import type { Issue, Suggestion } from './types';
import { REVIEW_LIGHT_MODEL } from '../modelConfig';

export class CompanyAgent extends BaseProofreadingAgent {
  constructor() {
    super(
      'サービス専門エージェント',
      'company',
      REVIEW_LIGHT_MODEL
    );
  }

  protected async performCheck(content: string, context?: any): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
  }> {
    // スタブ実装: 常に合格を返す
    console.log('サービス専門エージェント: スタブ実装');
    return {
      score: 100,
      issues: [],
      suggestions: [],
      confidence: 100
    };
  }
}
