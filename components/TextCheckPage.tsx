// @ts-nocheck — レガシー検証UI（本番経路外）
import React, { useState } from 'react';
import { proofreadArticle } from '../services/proofreadingAgent';
import type { ProofreadingReport } from '../types/proofreading';
import type { SeoOutline } from '../types';
import type { WritingRegulation } from '../services/articleWriterService';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';
import { ClipboardIcon, CheckIcon } from './icons';

// マークダウンから構成案情報を抽出
function parseOutlineMarkdown(markdown: string): Partial<SeoOutline> {
  // キーワード抽出
  const keyword = markdown.match(/## キーワード\n(.+)/)?.[1] || '';
  
  // タイトル抽出
  const title = markdown.match(/## タイトル\n(.+)/)?.[1] || '';
  
  // メタディスクリプション抽出
  const metaDescription = markdown.match(/## メタディスクリプション[^\\n]*\n(.+)/)?.[1] || '';
  
  // 導入文抽出
  const introduction = markdown.match(/## 導入[^\\n]*\n(.+)/)?.[1] || '';
  
  // H2セクション抽出
  const h2Regex = /### (H2-\d+)：(.+)\n/g;
  const sections: any[] = [];
  let match;
  
  while ((match = h2Regex.exec(markdown)) !== null) {
    const sectionTitle = match[2];
    const sectionStart = match.index + match[0].length;
    
    // 次のH2セクションまでのコンテンツを取得
    const nextH2Match = markdown.slice(sectionStart).match(/### H2-\d+：/);
    const sectionEnd = nextH2Match ? sectionStart + nextH2Match.index : markdown.length;
    const sectionContent = markdown.slice(sectionStart, sectionEnd);
    
    // H3サブセクション抽出
    const h3Regex = /\*\*(H3-\d+)\*\*：(.+?)—/g;
    const subsections: any[] = [];
    let h3Match;
    
    while ((h3Match = h3Regex.exec(sectionContent)) !== null) {
      subsections.push({
        title: h3Match[2].trim(),
        content: ''
      });
    }
    
    sections.push({
      title: sectionTitle,
      content: '',
      subsections
    });
  }
  
  return {
    keyword,
    title,
    metaDescription,
    introduction,
    sections
  };
}

// デフォルトの執筆ルール
const DEFAULT_REGULATION: WritingRegulation = {
  style: 'です・ます調',
  tone: 'professional',
  targetAudience: '一般ビジネスパーソン',
  prohibitedWords: [],
  requiredWords: [],
  maxSentenceLength: 80,
  maxParagraphLength: 300
};

const TextCheckPage: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState('');
  const [outlineMarkdown, setOutlineMarkdown] = useState('');
  const [writingStyle, setWritingStyle] = useState<'です・ます調' | 'だ・である調'>('です・ます調');
  const [customRules, setCustomRules] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofreadingResult, setProofreadingResult] = useState<ProofreadingReport | null>(null);
  const [improvedHtml, setImprovedHtml] = useState<string>('');
  const [copiedStates, setCopiedStates] = useState({
    html: false,
    preview: false
  });

  const handleCheck = async () => {
    if (!htmlContent || !outlineMarkdown) {
      setError('記事HTMLと構成案の両方を入力してください');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProofreadingResult(null);
    setImprovedHtml('');

    try {
      // マークダウンから構成案を抽出
      const parsedOutline = parseOutlineMarkdown(outlineMarkdown);
      
      // 完全な構成案オブジェクトを作成（不足分はダミーデータで補完）
      const outline: SeoOutline = {
        keyword: parsedOutline.keyword || 'キーワード',
        title: parsedOutline.title || '記事タイトル',
        metaDescription: parsedOutline.metaDescription || '',
        introduction: parsedOutline.introduction || '',
        sections: parsedOutline.sections || [],
        conclusion: '',
        targetAudience: '',
        tone: '',
        searchIntent: { primary: 'KNOW', secondary: [] }
      };

      // 執筆ルールを構築
      const regulation: WritingRegulation = {
        ...DEFAULT_REGULATION,
        style: writingStyle,
        prohibitedWords: customRules.split('\n').filter(rule => rule.startsWith('禁止:')).map(rule => rule.replace('禁止:', '').trim()),
        requiredWords: customRules.split('\n').filter(rule => rule.startsWith('必須:')).map(rule => rule.replace('必須:', '').trim())
      };

      // 校閲実行
      const report = await proofreadArticle(
        htmlContent,
        outline,
        regulation,
        {},
        0.3
      );

      setProofreadingResult(report);
      
      // 改善案の生成（簡易版）
      let improved = htmlContent;
      
      // 違反箇所の修正提案を適用
      report.violations.forEach(violation => {
        if (violation.suggestion) {
          // 簡単な置換処理（実際にはもっと高度な処理が必要）
          improved = improved.replace(violation.location, violation.suggestion);
        }
      });
      
      setImprovedHtml(improved);
      
    } catch (err) {
      console.error('校閲エラー:', err);
      setError(err instanceof Error ? err.message : '校閲中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'html' | 'preview') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [type]: false }));
      }, 2000);
    } catch (err) {
      console.error('コピーエラー:', err);
    }
  };

  const extractTextFromHtml = (html: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">記事チェックツール</h1>
      
      {/* 入力セクション */}
      <div className="space-y-6 mb-8">
        <div>
          <label className="block text-sm font-medium mb-2">
            記事HTML
          </label>
          <textarea
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            placeholder="<h2>見出し</h2><p>本文...</p>"
            className="w-full h-64 p-3 border rounded-lg font-mono text-sm text-gray-900 bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            構成案（マークダウン形式）
          </label>
          <textarea
            value={outlineMarkdown}
            onChange={(e) => setOutlineMarkdown(e.target.value)}
            placeholder="SEO構成生成ページで作成した構成案をコピペしてください"
            className="w-full h-64 p-3 border rounded-lg font-mono text-sm text-gray-900 bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              文体
            </label>
            <select
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value as 'です・ます調' | 'だ・である調')}
              className="w-full p-2 border rounded-lg text-gray-900 bg-white"
            >
              <option value="です・ます調">です・ます調</option>
              <option value="だ・である調">だ・である調</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              カスタムルール（任意）
            </label>
            <textarea
              value={customRules}
              onChange={(e) => setCustomRules(e.target.value)}
              placeholder="禁止:〜&#10;必須:〜"
              className="w-full h-20 p-2 border rounded-lg text-sm text-gray-900 bg-white"
            />
          </div>
        </div>

        <button
          onClick={handleCheck}
          disabled={isLoading || !htmlContent || !outlineMarkdown}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '校閲中...' : 'チェック実行'}
        </button>
      </div>

      {/* ローディング表示 */}
      {isLoading && <LoadingSpinner message="記事を校閲しています..." />}

      {/* エラー表示 */}
      {error && <ErrorMessage message={error} />}

      {/* 結果表示 */}
      {proofreadingResult && improvedHtml && (
        <div className="space-y-8">
          <div className="border-t pt-8">
            <h2 className="text-2xl font-bold mb-6">校閲結果</h2>
            
            {/* 改善後の記事 */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* HTMLコード */}
              <div className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">改善後のHTML</h3>
                  <button
                    onClick={() => copyToClipboard(improvedHtml, 'html')}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                  >
                    {copiedStates.html ? (
                      <>
                        <CheckIcon className="w-4 h-4 text-green-600" />
                        <span className="text-green-600">コピー済み</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="w-4 h-4" />
                        <span>コピー</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-gray-50 p-3 rounded overflow-x-auto text-sm text-gray-900">
                  <code className="text-gray-900">{improvedHtml}</code>
                </pre>
              </div>

              {/* プレビュー */}
              <div className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">プレビュー</h3>
                  <button
                    onClick={() => copyToClipboard(extractTextFromHtml(improvedHtml), 'preview')}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                  >
                    {copiedStates.preview ? (
                      <>
                        <CheckIcon className="w-4 h-4 text-green-600" />
                        <span className="text-green-600">コピー済み</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="w-4 h-4" />
                        <span>コピー</span>
                      </>
                    )}
                  </button>
                </div>
                <div 
                  className="prose max-w-none text-gray-900
                    prose-h2:text-2xl prose-h2:font-bold prose-h2:text-blue-900 prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b-2 prose-h2:border-blue-200
                    prose-h3:text-xl prose-h3:font-bold prose-h3:text-blue-700 prose-h3:mt-6 prose-h3:mb-3
                    prose-p:text-gray-700 prose-p:leading-relaxed
                    prose-strong:text-blue-900 prose-strong:font-bold
                    prose-ul:my-4 prose-li:my-1"
                  dangerouslySetInnerHTML={{ __html: improvedHtml }}
                />
              </div>
            </div>

            {/* 違反・改善点リスト */}
            <div className="border rounded-lg p-6 bg-white">
              <h3 className="font-semibold mb-4">検出された問題と改善点</h3>
              {proofreadingResult.violations.length > 0 ? (
                <ul className="space-y-3">
                  {proofreadingResult.violations.map((violation, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        violation.severity === 'error' ? 'bg-red-100 text-red-700' :
                        violation.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {violation.category}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm">{violation.message}</p>
                        {violation.suggestion && (
                          <p className="text-sm text-gray-600 mt-1">
                            → {violation.suggestion}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-green-600">✅ 問題は検出されませんでした</p>
              )}
            </div>

            {/* 統計情報 */}
            {proofreadingResult.statistics && (
              <div className="border rounded-lg p-6 bg-white">
                <h3 className="font-semibold mb-4">統計情報</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">総文字数:</span>
                    <span className="ml-2 font-medium">{proofreadingResult.statistics.totalCharacters}文字</span>
                  </div>
                  <div>
                    <span className="text-gray-600">総単語数:</span>
                    <span className="ml-2 font-medium">{proofreadingResult.statistics.totalWords}語</span>
                  </div>
                  <div>
                    <span className="text-gray-600">違反件数:</span>
                    <span className="ml-2 font-medium">{proofreadingResult.violations.length}件</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TextCheckPage;