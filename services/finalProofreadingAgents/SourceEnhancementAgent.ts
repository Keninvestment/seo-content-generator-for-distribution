// 出典検索エージェント（旧：出典補強エージェント）
import { BaseProofreadingAgent } from './BaseAgent';
import type { Issue, Suggestion, AgentContext, PartialResults, VerifiedUrl, SourceRequirement } from './types';
import { REVIEW_HEAVY_MODEL } from '../modelConfig';

export class SourceEnhancementAgent extends BaseProofreadingAgent {
  // 部分結果を保持
  private partialResults: PartialResults = {
    completedItems: 0,
    totalItems: 0,
    issues: [],
    suggestions: [],
    verified_urls: []
  };
  
  constructor() {
    super(
      '出典検索エージェント',
      'source-enhancement',
      REVIEW_HEAVY_MODEL // Web検索で出典を探す
    );
  }
  
  // 部分結果を取得するメソッド
  public getPartialResults(): PartialResults {
    return this.partialResults;
  }
  
  protected async performCheck(content: string, context?: AgentContext): Promise<{
    score: number;
    issues: Issue[];
    suggestions: Suggestion[];
    confidence: number;
    verified_urls?: VerifiedUrl[];
  }> {
    try {
      // SourceRequirementAgentの判定結果を受け取る
      const requirements = context?.requirements || [];
      const parsedElements = context?.parsedElements || [];

      console.log(`🔍 出典検索エージェント: ${requirements.length}箇所の出典を検索`);
      requirements.forEach((req: any) => {
        const element = parsedElements.find((el: any) => el.index === req.elementIndex);
        const preview = element ? element.text.substring(0, 40) : '不明';
        console.log(`  [要素${req.elementIndex}] ${preview}... → ${req.searchKeywords?.[0] || ''}`);
      });

      // 疑似的部分成功のため、開始時に総数を記録
      this.partialResults.totalItems = requirements.length;
      console.log(`📊 部分成功機能: ${this.partialResults.totalItems}件の処理を開始`);
    
    // 構造化テキスト出力用のプロンプト
    const prompt = `
以下の主張について、信頼できる出典URLをWeb検索で探してください。

【記事内容】
${content}

【出典が必要な箇所】
${requirements.map((req: any, index: number) => {
  const keywords = req.searchKeywords ? `（検索ヒント: ${req.searchKeywords.join(', ')}）` : '';
  return `${index + 1}. ${req.claim} ${keywords}`;
}).join('\n')}

【重要：日本語ソース最優先のURL検索ルール】

各項目について、以下の厳格なルールでURLを検索してください：

▼使用可能なソース（優先順）

1. 海外企業・組織の公式サイト（該当ページのみ）
   - 企業公式の決算発表、IR資料、プレスリリース
   - 該当する数値・事実が明記されているページのみ
   - トップページや無関係なページは不可

2. 日本語の信頼できるソース（最優先で検索）
   - 日本の新聞社、ビジネス誌、専門メディア
   - 日本の調査会社、業界団体のレポート
   - 日本語のニュースサイト、専門サイト
   - 企業の公式プレスリリース（PR TIMES等）

3. 日本政府・公的機関（.go.jp）
   - 省庁、政府統計、公的研究機関

▼絶対に使用禁止のソース

❌ 海外メディア（Bloomberg、Reuters、TechCrunch等）
❌ 海外の調査会社（IDC本社、McKinsey等）  
❌ 英語の記事全般（公式サイト以外）
❌ 海外のニュースサイト、ブログ

【検索手順】
1. まず日本語記事を徹底的に検索
2. 見つからない場合のみ、該当企業の公式サイトを検索
3. 海外メディアのURLは絶対に返さない

【出力形式（厳守）】
必ず以下の形式で各結果を出力してください。
一字一句この形式を守ってください：

===結果1===
主張: [出典を探した主張の文章]
URL: [見つかったURL（https://から始まる完全な形式）またはnot_found]
状態: [foundまたはnot_found]
信頼度: [0.0-1.0の数値]
理由: [見つからなかった場合の理由、見つかった場合は空欄]
===結果1終了===

===結果2===
主張: [出典を探した主張の文章]
URL: [見つかったURL（https://から始まる完全な形式）またはnot_found]
状態: [foundまたはnot_found]
信頼度: [0.0-1.0の数値]
理由: [見つからなかった場合の理由、見つかった場合は空欄]
===結果2終了===

（以下、すべての項目について同様に記載）

重要：
- 各項目について必ず結果を記載（見つからなかった場合もnot_foundとして記載）
- URLは完全な形式で記載
- 順番は入力した順序を維持
- 必ず「===結果N===」「===結果N終了===」の形式を使用
`;

    // Web検索を使用して出典を探す
    console.log('🔍 出典検索エージェント: Web検索開始...');
    const response = await this.callGPT5(prompt, true);
    console.log('📝 出典検索エージェント: レスポンス受信（長さ:', response.length, '文字）');
    console.log('📝 レスポンス先頭500文字:', response.substring(0, 500));
    
    // 構造化テキストレスポンスをパース
    let searchResults: any[] = [];

    // まず構造化テキスト形式でパースを試みる
    const resultPattern = /===結果(\d+)===([\s\S]*?)===結果\1終了===/g;
    console.log('📝 構造化テキストパース開始...');
    const matches = [...response.matchAll(resultPattern)];

    if (matches.length > 0) {
      console.log(`📊 ${this.name}: 構造化テキスト形式で${matches.length}件の結果を取得`);

      searchResults = matches.map((match, index) => {
        const content = match[2];
        // 各行を配列に分割して処理
        const lines = content.split('\n').map((line: string) => line.trim());
        
        // 各フィールドを探す
        let claim = '';
        let url = '';
        let status = '';
        let confidence = 0;
        let reason = '';
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('主張:')) {
            claim = line.substring('主張:'.length).trim();
          } else if (line.startsWith('URL:')) {
            url = line.substring('URL:'.length).trim();
          } else if (line.startsWith('状態:')) {
            status = line.substring('状態:'.length).trim();
          } else if (line.startsWith('信頼度:')) {
            const confValue = line.substring('信頼度:'.length).trim();
            confidence = parseFloat(confValue) || 0;
          } else if (line.startsWith('理由:')) {
            // 理由は複数行の可能性があるので、残りの行をすべて結合
            reason = lines.slice(i).join(' ').substring('理由:'.length).trim();
            break; // 理由が最後のフィールドなので、ここで終了
          }
        }
        
        // statusの判定
        const finalStatus = status === 'found' ? 'found' : 'not_found';
        
        console.log(`  [${index + 1}] パース結果:`, {
          claim: claim.substring(0, 40),
          url: url === 'not_found' ? 'not_found' : url,
          status: finalStatus,
          confidence
        });

        return {
          index,
          claim,
          url: url === 'not_found' ? '' : url,
          status: finalStatus,
          confidence,
          reason
        };
      });

      // 🔍 デバッグログ：検索結果の詳細
      console.log('🔍 検索結果の詳細:');
      searchResults.forEach((result, idx) => {
        console.log(`  [検索結果${idx + 1}]`, {
          url: result.url || 'なし',
          status: result.status,
          title: result.title || 'タイトルなし',
          claim: result.claim ? result.claim.substring(0, 50) + '...' : 'なし'
        });
      });
    } else {
      // 構造化テキスト形式が見つからない場合、JSONパースを試みる
      console.log('⚠️ 構造化テキスト形式が見つからず、JSONパースを試行');
      console.log('📝 レスポンス内容確認（最初の1000文字）:', response.substring(0, 1000));
      
      try {
        // JSONを含む部分を抽出
        const jsonMatch = response.match(/\{[\s\S]*\}/); 
        if (jsonMatch) {
          console.log('📝 JSON候補を発見、パース試行...');
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.results) {
            searchResults = parsed.results;
            console.log(`📊 ${this.name}: JSON形式で${searchResults.length}件の結果を取得`);
          } else {
            console.log('⚠️ JSONパース成功したが、resultsフィールドなし');
          }
        } else {
          console.log('⚠️ JSON形式のデータが見つからない');
        }
      } catch (e) {
        console.warn('❌ JSONパース失敗:', e);
      }
      
      // 最終フォールバック：URL抽出
      if (searchResults.length === 0) {
        console.warn('⚠️ 最終フォールバック：URLを直接抽出');
        const urls = response.match(/https?:\/\/[^\s\)\"\'\'<>\[\]]+/g) || [];
        console.log(`📝 抽出されたURL数: ${urls.length}`);
        const uniqueUrls = [...new Set(urls)];
        console.log(`📝 ユニークURL数: ${uniqueUrls.length}`);
        searchResults = requirements.map((source: SourceRequirement, index: number) => ({
          index,
          claim: source.claim || source.description || '',
          url: uniqueUrls[index] || '',
          status: uniqueUrls[index] ? 'found' : 'not_found',
          confidence: uniqueUrls[index] ? 0.5 : 0
        }));
      }
    }

    // 部分結果を更新
    this.partialResults.completedItems = searchResults.filter(r => r.status === 'found').length;
    this.partialResults.issues = requirements.map((req: any, index: number) => {
      const searchResult = searchResults.find(r => r.index === index) || searchResults[index] || {};
      const url = searchResult.url || '';
      const element = parsedElements.find((el: any) => el.index === req.elementIndex);
      return {
        type: 'missing-source',
        severity: 'major' as const,
        location: `要素${req.elementIndex}`,
        description: req.claim || '出典が必要',
        original: element ? element.text : '',
        suggestion: url ? `出典追加: ${url}` : '適切な出典が見つかりませんでした',
        confidence: 0.72,
      };
    });
    this.partialResults.verified_urls = searchResults;

    console.log(`📊 部分成功: ${this.partialResults.completedItems}/${this.partialResults.totalItems}件の出典を発見`);
    
    // location情報を含む詳細なURL情報を構築（要素番号ベース）
    const verifiedUrlsWithLocation = requirements.map((req: any, index: number) => {
      // 対応する検索結果を探す
      const result = searchResults.find(r => r.index === index) || searchResults[index] || {};
      const element = parsedElements.find((el: any) => el.index === req.elementIndex);

      return {
        url: result.url || '',
        elementIndex: req.elementIndex,  // 要素番号を保存
        claim: req.claim || '',
        status: result.status === 'found' ? 'ok' : 'not_found',
        confidence: result.confidence || 0,
        elementContent: element ? element.content : ''  // 元のHTML要素も保存
      };
    });

    // 📦 デバッグログ：最終出力データ
    console.log('📦 SourceEnhancement最終出力:');
    verifiedUrlsWithLocation.forEach((v: (typeof verifiedUrlsWithLocation)[number], idx: number) => {
      console.log(`  [出力${idx + 1}]`, {
        elementIndex: v.elementIndex,
        url: v.url || 'URLなし',
        title: v.title || 'タイトル未定義',  // ← ここが重要！
        status: v.status
      });
    });

    // シンプルな結果構造
    const foundCount = searchResults.filter(r => r.status === 'found').length;
    const result = {
      score: foundCount > 0 ? 85 : 50,
      confidence: foundCount > 0 ? 80 : 40,
      issues: requirements.map((req: any, index: number) => {
        const searchResult = searchResults.find(r => r.index === index) || searchResults[index] || {};
        const url = searchResult.url || '';
        const element = parsedElements.find((el: any) => el.index === req.elementIndex);

        return {
          type: 'missing-source',
          severity: 'major' as const,
          location: `要素${req.elementIndex}`,
          elementIndex: req.elementIndex,  // 要素番号を含める
          description: req.claim || '出典が必要',
          original: element ? element.text : '',
          suggestion: url ? `出典追加: ${url}` : '適切な出典が見つかりませんでした',
          source_url: url || '',
          confidence: searchResult.confidence || 0,
          // 出典が見つからない場合のアクション指示
          action: url ? 'add-source' : 'rephrase-with-caution',
          cautionNote: url ? undefined : req.claim
        };
      }),
      suggestions: foundCount > 0 ? [{
        type: 'source-enhancement',
        description: `${foundCount}個の出典URLを発見しました`,
        implementation: 'これらのURLを記事に追加してください',
        priority: 'high' as const
      }] : [],
      verified_urls: verifiedUrlsWithLocation  // 要素番号付きのURL配列
    };
    
    return result;
    } catch (error) {
      console.error(`❌ ${this.name} エラー:`, error);
      
      // エラー時も部分結果を返す
      if (this.partialResults && this.partialResults.completedItems > 0) {
        console.log(`⚠️ エラー発生、部分結果を返します: ${this.partialResults.completedItems}/${this.partialResults.totalItems}件完了`);
        
        // 部分結果から返却データを構築
        const partialScore = Math.round((this.partialResults.completedItems / this.partialResults.totalItems) * 100);
        
        return {
          score: partialScore,
          issues: this.partialResults.issues || [],
          suggestions: this.partialResults.suggestions || [],
          confidence: 60,
          verified_urls: this.partialResults.verified_urls || []
        };
      }
      
      // 部分結果もない場合はデフォルト値
      console.log(`❌ 部分結果なし、デフォルト値を返します`);
      return {
        score: 50,
        issues: [],
        suggestions: [],
        confidence: 40,
        verified_urls: []
      };
    }
  }
}
