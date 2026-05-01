import React, { useState } from 'react';
import type { SeoOutline, GroundingChunk, SubheadingWithNote } from '../types';
import { TitleIcon, TargetIcon, IntroIcon, OutlineIcon, ConclusionIcon, KeywordIcon, ImageIcon, LinkIcon, CharacterCountIcon, ClipboardIcon } from './icons';
import ArticleWriter from './ArticleWriter';

interface OutlineDisplayOptimizedProps {
  outline: SeoOutline;
  keyword: string;
  sources: GroundingChunk[] | undefined;
  onArticleGenerated?: (article: {
    title: string;
    metaDescription: string;
    htmlContent: string;
    plainText: string;
  }) => void;
}

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; badge?: string }> = ({ icon, title, children, badge }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:border-blue-300 hover:shadow-md">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className="bg-blue-50 p-2 rounded-full">
                    {icon}
                </div>
                <h3 className="text-xl font-bold text-blue-700">{title}</h3>
            </div>
            {badge && (
                <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
                    {badge}
                </span>
            )}
        </div>
        <div className="prose prose-gray prose-p:text-gray-600 prose-li:text-gray-600 max-w-none">
            {children}
        </div>
    </div>
);

const OutlineDisplayOptimized: React.FC<OutlineDisplayOptimizedProps> = ({ outline, keyword, sources, onArticleGenerated }) => {
  const [copyButtonText, setCopyButtonText] = useState('すべてコピー');
  const [showArticleWriter, setShowArticleWriter] = useState(false);

  // 競合分析データの有無をチェック
  const hasCompetitorData = outline.competitorResearch && outline.competitorResearch.frequencyWords;
  const frequencyWords = outline.competitorResearch?.frequencyWords || [];
  const topWords = frequencyWords.slice(0, 10).map(w => w.word);

  // 構成案の見出しに含まれる頻出単語をハイライト
  const highlightFrequencyWords = (text: string) => {
    if (!hasCompetitorData) return text;

    let highlightedText = text;
    topWords.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<span class="bg-blue-100 px-1 rounded">$1</span>');
    });
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  const handleCopy = () => {
    const sections = outline.outline.map(section => {
      let sectionText = `### H2: ${section.heading}`;
      if (section.subheadings && section.subheadings.length > 0) {
        sectionText += '\n' + section.subheadings.map(sub => {
          if (typeof sub === 'string') {
            return `- H3: ${sub}`;
          } else {
            return `- H3: ${sub.text}${sub.writingNote ? ` (※${sub.writingNote})` : ''}`;
          }
        }).join('\n');
      }
      if (section.imageSuggestion) {
          sectionText += `\n\n**画像提案:** ${section.imageSuggestion}`;
      }
      return sectionText;
    }).join('\n\n');

    const charCount = outline.characterCountAnalysis ?
`## 競合の文字数分析
- 分析対象記事数: ${outline.characterCountAnalysis.analyzedArticles}件
- 平均文字数: ${outline.characterCountAnalysis.average.toLocaleString()}文字
- 中央値: ${outline.characterCountAnalysis.median.toLocaleString()}文字
- 最小文字数: ${outline.characterCountAnalysis.min.toLocaleString()}文字
- 最大文字数: ${outline.characterCountAnalysis.max.toLocaleString()}文字` : '';

    const frequencyWordsText = hasCompetitorData ?
`## 反映した頻出単語TOP10
${topWords.map((word, i) => `${i + 1}. ${word}`).join('\n')}` : '';

    const textToCopy = `
# SEO記事構成案: ${keyword}

## タイトル
${outline.title}

## ターゲット読者
${outline.targetAudience}

## 導入部
${outline.introduction}

## 見出し構成
${sections}

## まとめ
${outline.conclusion}

## 関連キーワード
${outline.keywords.join(', ')}

${charCount}

${frequencyWordsText}

生成日時: ${new Date().toLocaleString('ja-JP')}
    `.trim();

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopyButtonText('コピーしました！');
        setTimeout(() => {
          setCopyButtonText('すべてコピー');
        }, 2000);
      })
      .catch(err => {
        console.error('Copy failed:', err);
        setCopyButtonText('コピー失敗');
      });
  };

  return (
    <div className="space-y-6">
      {/* 最適化状態の表示 */}
      {hasCompetitorData && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">✨</span>
            <h3 className="text-lg font-bold text-blue-700">競合分析データを反映した最適化済み構成案</h3>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>• {outline.competitorResearch?.validArticles.length ?? 0}記事の分析結果を反映</p>
            <p>• 頻出単語TOP{Math.min(10, frequencyWords.length)}を見出しに配置</p>
            <p>• 上位記事の平均H2数・H3数に基づく構造設計</p>
            <p>• <span className="bg-blue-100 px-1 rounded">青色ハイライト</span>は頻出単語を示します</p>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setShowArticleWriter(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl transition-all duration-200 font-medium shadow-md hover:shadow-lg"
        >
          <span className="text-xl">📝</span>
          <span>執筆開始</span>
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-all duration-200 shadow-sm"
        >
          <ClipboardIcon className="h-5 w-5" />
          <span>{copyButtonText}</span>
        </button>
      </div>

      <Card
        icon={<TitleIcon className="h-6 w-6 text-blue-500" />}
        title="タイトル案"
        badge={hasCompetitorData ? "最適化済" : undefined}
      >
        <p className="text-lg font-semibold text-gray-800">{highlightFrequencyWords(outline.title)}</p>
      </Card>

      <Card
        icon={<TargetIcon className="h-6 w-6 text-blue-500" />}
        title="ターゲット読者"
        badge={hasCompetitorData ? "競合分析済" : undefined}
      >
        <p className="text-gray-700">{outline.targetAudience}</p>
      </Card>

      <Card
        icon={<IntroIcon className="h-6 w-6 text-blue-500" />}
        title="導入部"
        badge={hasCompetitorData ? "パターン分析済" : undefined}
      >
        <p className="text-gray-700">{outline.introduction}</p>
      </Card>

      <Card
        icon={<OutlineIcon className="h-6 w-6 text-blue-500" />}
        title="見出し構成"
        badge={hasCompetitorData ? `H2:${outline.outline.length}個` : undefined}
      >
        <div className="space-y-6">
          {outline.outline.map((section, index) => (
            <div key={index} className="bg-gray-50 p-5 rounded-xl border border-gray-200">
              <h4 className="text-lg font-bold text-blue-700 mb-3 flex items-center gap-2">
                <span className="bg-blue-500 text-white px-2 py-1 rounded text-sm">H2</span>
                {highlightFrequencyWords(section.heading)}
              </h4>
              {section.subheadings && section.subheadings.length > 0 && (
                <ul className="list-disc list-inside space-y-3 ml-4 mb-4">
                  {section.subheadings.map((subheading, subIndex) => {
                    const subheadingText = typeof subheading === 'string' ? subheading : subheading.text;
                    const subheadingNote = typeof subheading === 'object' ? subheading.writingNote : undefined;
                    return (
                      <li key={subIndex} className="text-gray-700">
                        <div>
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded mr-2">H3</span>
                          {highlightFrequencyWords(subheadingText)}
                        </div>
                        {subheadingNote && (
                          <div className="mt-1 ml-8 p-2 bg-amber-50 rounded border border-amber-200">
                            <span className="text-amber-600 text-xs">✍ </span>
                            <span className="text-gray-600 text-xs">{subheadingNote}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {section.writingNote && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-600 text-sm">✍</span>
                    <div>
                      <span className="text-amber-700 font-semibold text-sm">執筆メモ: </span>
                      <span className="text-gray-600 text-sm">{section.writingNote}</span>
                    </div>
                  </div>
                </div>
              )}
              {section.imageSuggestion && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <ImageIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-blue-700 font-semibold text-sm">画像提案: </span>
                      <span className="text-gray-600 text-sm">{section.imageSuggestion}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card
        icon={<ConclusionIcon className="h-6 w-6 text-blue-500" />}
        title="まとめ（本文内容）"
      >
        <p className="text-sm text-gray-500 mb-2">
          ※この内容は最後のH2「まとめ」見出しの本文として使用されます
        </p>
        <p className="text-gray-700">{outline.conclusion}</p>
      </Card>

      <Card
        icon={<KeywordIcon className="h-6 w-6 text-blue-500" />}
        title="関連キーワード"
        badge={hasCompetitorData ? `${outline.keywords.length}個` : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {outline.keywords.map((kw, index) => {
            const isFrequencyWord = topWords.includes(kw);
            return (
              <span
                key={index}
                className={`px-3 py-1 rounded-full text-sm ${
                  isFrequencyWord
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold'
                    : 'bg-gray-100 text-gray-700'
                }`}
                title={isFrequencyWord ? '頻出単語' : ''}
              >
                {kw}
              </span>
            );
          })}
        </div>
      </Card>

      {outline.characterCountAnalysis && (
        <Card
          icon={<CharacterCountIcon className="h-6 w-6 text-blue-500" />}
          title="推奨文字数（競合分析結果）"
          badge="実測値"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500">分析対象:</span>
                <span className="ml-2 text-gray-800 font-semibold">{outline.characterCountAnalysis.analyzedArticles}記事</span>
              </div>
              <div>
                <span className="text-gray-500">平均文字数:</span>
                <span className="ml-2 text-gray-800 font-semibold">{outline.characterCountAnalysis.average.toLocaleString()}文字</span>
              </div>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-4 rounded-xl text-white">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-300">
                  {outline.characterCountAnalysis.average.toLocaleString()}文字
                </div>
                <div className="text-sm text-blue-100 mt-1">推奨文字数</div>
              </div>
              <div className="flex justify-between mt-3 text-sm text-blue-100">
                <span>最小: {outline.characterCountAnalysis.min.toLocaleString()}文字</span>
                <span>最大: {outline.characterCountAnalysis.max.toLocaleString()}文字</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {sources && sources.length > 0 && (
        <Card
          icon={<LinkIcon className="h-6 w-6 text-blue-500" />}
          title="参考情報源"
        >
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-gray-500">{index + 1}.</span>
                <div>
                  <a
                    href={source.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline break-all"
                  >
                    {source.web.title || source.web.uri}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 記事執筆モーダル */}
      {showArticleWriter && (
        <ArticleWriter
          outline={outline}
          keyword={keyword}
          onClose={() => setShowArticleWriter(false)}
          onArticleGenerated={(article) => {
            if (onArticleGenerated) {
              onArticleGenerated(article);
              setShowArticleWriter(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default OutlineDisplayOptimized;
