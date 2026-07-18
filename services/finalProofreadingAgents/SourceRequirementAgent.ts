// 出典必要性判定エージェント
import { BaseProofreadingAgent } from './BaseAgent';
import type { Issue, Suggestion } from './types';
import { parseArticleElements, formatElementList, mightNeedSource, type ParsedElement } from './utils/articleParser';
import { REVIEW_HEAVY_MODEL } from '../modelConfig';

export class SourceRequirementAgent extends BaseProofreadingAgent {
  constructor() {
    super(
      '出典必要性判定エージェント',
      'source-requirement',
      REVIEW_HEAVY_MODEL // 高精度重視
    );
  }
  
  // HTMLから見出し構造を抽出するヘルパー関数
  private extractHeadingStructure(html: string): Map<string, { h2: string, h3: string }> {
    const structure = new Map<string, { h2: string, h3: string }>();
    
    // 簡易的なHTML解析（ブラウザ環境ではDOMParserが使えない場合のフォールバック）
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
    const h3Regex = /<h3[^>]*>(.*?)<\/h3>/gi;
    
    let currentH2 = '';
    let lastIndex = 0;
    
    // HTML全体を一度に処理
    const cleanHtml = html.replace(/<[^>]+>/g, (match, offset) => {
      // H2タグの処理
      if (match.toLowerCase().startsWith('<h2')) {
        const h2Match = /<h2[^>]*>(.*?)<\/h2>/i.exec(html.substring(offset));
        if (h2Match) {
          currentH2 = h2Match[1].replace(/<[^>]+>/g, '').trim();
        }
      }
      // H3タグの処理
      else if (match.toLowerCase().startsWith('<h3')) {
        const h3Match = /<h3[^>]*>(.*?)<\/h3>/i.exec(html.substring(offset));
        if (h3Match) {
          const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim();
          // H3セクションのテキストを取得（次のH2またはH3まで）
          const sectionEndRegex = /<(h2|h3)[^>]*>/i;
          const nextHeadingMatch = sectionEndRegex.exec(html.substring(offset + h3Match[0].length));
          const sectionEnd = nextHeadingMatch ? offset + h3Match[0].length + nextHeadingMatch.index : html.length;
          const sectionText = html.substring(offset, sectionEnd);
          
          // セクションテキストをキーとして構造を保存
          structure.set(sectionText, {
            h2: currentH2,
            h3: h3Text
          });
        }
      }
      return match;
    });
    
    return structure;
  }
  
  protected async performCheck(content: string, context?: any): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
    requirements?: any[];
    parsedElements?: ParsedElement[];
  }> {
    // 第1フェーズの他エージェントの結果を受け取る
    const phaseOneResults = context?.phaseOneResults || {};

    // 記事を全要素に分解して番号付け
    const parsedElements = parseArticleElements(content);
    const elementList = formatElementList(parsedElements);

    console.log(`📋 記事を${parsedElements.length}個の要素に分解しました`);

    // システムでヒント：出典が必要そうな要素を事前検出
    const possibleSourceElements = parsedElements
      .filter(el => el.tag === 'p' && mightNeedSource(el))
      .map(el => el.index);

    console.log(`💡 システム判定: 要素 ${possibleSourceElements.join(', ')} に出典が必要かもしれません`);
    
    const prompt = `
あなたは記事の信頼性向上のための出典必要性判定の専門家です。
以下の番号付けされた要素リストから、出典が絶対に必要な要素番号を特定してください。

【第1フェーズの検証結果】
${JSON.stringify(phaseOneResults, null, 2)}

【番号付き要素リスト】
${elementList}

【元の記事（参考）】
${content}

【システムからのヒント】
以下の要素番号は出典が必要な可能性があります：
${possibleSourceElements.length > 0 ? possibleSourceElements.join(', ') : 'なし'}

【出典が必須な項目（この3カテゴリのみ）】

1. 具体的な数値データ
   - 売上高、成長率（「200%増」「30兆円」など）
   - 市場シェア、利用者数（「シェア40%」「1億人」など）
   - 価格、費用（「月額5000円」「総額10億円」など）
   - 具体的な改善率、パフォーマンス数値

2. 固有名詞＋具体的事実
   - 企業名＋具体的数値（「トヨタの売上高30兆円」）
   - 企業名＋具体的な発表・決定（「OpenAIが新モデル発表」）
   - 製品名＋具体的スペック（「ChatGPT-4の精度95%」）
   - 人物名＋具体的発言・行動（「〇〇CEOが辞任」）

3. 最上級・ランキング表現
   - 「日本一」「世界最大」「業界トップ」
   - 「唯一」「初」「No.1」
   - 具体的な順位（「売上高3位」「シェア2位」）

【出典不要な項目（一般常識・抽象的主張）】
- 「AIが注目されている」「DXが進んでいる」
- 「企業が取り組んでいる」「需要が高まっている」
- 「技術が進化している」「市場が拡大している」
- 将来予測で具体的数値がないもの（「今後増える見込み」）
- 一般的な説明（「AIは人工知能の略」「DXはデジタル変革」）

【重要な指示】
- 上記3カテゴリ以外は出典不要と判定してください
- 具体的な数値・事実がない抽象的な主張は除外
- 各指摘には具体的な検索キーワード案を含めてください
- 各requirementには順番を付けてください

【出力形式】
{
  "score": 0-100（出典充実度）,
  "confidence": 90-100（判定の確信度・高めに設定）,
  "requirements": [
    {
      "elementIndex": 4,  // 要素番号（1から始まる）
      "claim": "出典が必要な具体的な文章（例：B社は原稿執筆時間を大幅短縮）",
      "searchKeywords": ["企業名 実績 時間短縮", "事例 導入効果"],
      "sourceType": "official" | "media" | "government" | "research",
      "reason": "出典が必要な理由（例：企業名＋具体的数値）"
    }
  ],
  "issues": [
    {
      "type": "missing-source",
      "severity": "critical",
      "location": "【H2見出し名】セクション内の「具体的な文章を20-30文字程度引用」の部分",
      "description": "出典が必要な理由（例：具体的な売上高データ）",
      "original": "対象の文章",
      "suggestion": "必要な出典の種類（例：トヨタ公式決算資料）",
      "confidence": 95
    }
  ],
  "suggestions": [
    {
      "type": "source-requirement",
      "description": "出典追加の全体的な改善提案",
      "implementation": "具体的な実装方法",
      "priority": "high"
    }
  ]
}`;

    try {
      const response = await this.callGPT5(prompt, false);
      const result = this.parseResponse(response) as {
        issues: Issue[];
        suggestions: Suggestion[];
        score: number;
        confidence: number;
        requirements?: unknown[];
        parsedElements?: ParsedElement[];
      };

      // requirementsを処理（要素番号形式）
      if (result.requirements) {
        console.log(`📋 出典必要性判定: ${result.requirements.length}箇所の出典が必要`);
        result.requirements.forEach((req: any) => {
          const element = parsedElements.find(el => el.index === req.elementIndex);
          const preview = element ? element.text.substring(0, 50) : '不明';
          console.log(`  [要素${req.elementIndex}] ${preview}...`);
        });
      }

      // パース済み要素を結果に含める
      result.parsedElements = parsedElements;

      // 既存のissues処理も保持（後方互換性）
      if (result.issues) {
        result.issues = result.issues.map((issue: any) => ({
          type: issue.type || 'missing-source',
          severity: issue.severity || 'major',
          location: issue.location,
          description: issue.description,
          original: issue.original,
          suggestion: issue.suggestion,
          confidence: issue.confidence || 90,
          // 追加フィールドは別途contextに保存
          metadata: {
            searchKeywords: issue.searchKeywords,
            sourceType: issue.sourceType
          }
        }));
      }

      // suggestionsが欠けている場合の安全策
      if (result) {
        if (!result.suggestions) {
          console.warn('⚠️ SourceRequirementAgent: GPT-5がsuggestionsを返しませんでした');
          result.suggestions = [];
        }
      } else {
        console.error('❌ SourceRequirementAgent: resultが未定義');
        // constの再代入エラーを回避
        return { score: 50, issues: [], suggestions: [], confidence: 50 };
      }

      return result;
    } catch (error) {
      console.error('出典必要性判定エラー:', error);
      return {
        score: 50,
        issues: [],
        suggestions: [],
        confidence: 50
      };
    }
  }
}
