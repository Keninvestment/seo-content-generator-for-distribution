import React, { useState } from 'react';
import type { SeoOutline, GroundingChunk } from '../types';
import { TitleIcon, TargetIcon, IntroIcon, OutlineIcon, ConclusionIcon, KeywordIcon, ImageIcon, LinkIcon, CharacterCountIcon, ClipboardIcon } from './icons';
import ArticleWriter from './ArticleWriter';

interface OutlineDisplayProps {
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

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:border-blue-300 hover:shadow-md">
        <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-50 p-2 rounded-full">
                {icon}
            </div>
            <h3 className="text-xl font-bold text-blue-700">{title}</h3>
        </div>
        <div className="prose prose-gray prose-p:text-gray-600 prose-li:text-gray-600 max-w-none">
            {children}
        </div>
    </div>
);


const OutlineDisplay: React.FC<OutlineDisplayProps> = ({ outline, keyword, sources, onArticleGenerated }) => {
  const [copyButtonText, setCopyButtonText] = useState('すべてコピー');
  const [showArticleWriter, setShowArticleWriter] = useState(false);
  const [writingMode, setWritingMode] = useState<'v1' | 'v2'>('v1');

  const handleCopy = () => {
    const sections = outline.outline.map(section => {
      let sectionText = `### H2: ${section.heading}`;
      if (section.subheadings && section.subheadings.length > 0) {
        sectionText += '\n' + section.subheadings.map(sub => `- H3: ${sub}`).join('\n');
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


    const textToCopy = `
# 「${keyword}」の構成案

## 提案タイトル
${outline.title}

## ターゲット読者
${outline.targetAudience}

## 導入
${outline.introduction}

${charCount}

## 記事構成案
${sections}

## 結論
${outline.conclusion}

## 含めるべき共起語・キーワード
- ${outline.keywords.join('\n- ')}
`.trim().replace(/^\s*\n/gm, ''); // Clean up extra newlines

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyButtonText('コピーしました！');
      setTimeout(() => {
        setCopyButtonText('すべてコピー');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('コピーに失敗しました。');
    });
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div className="relative text-center">
        <h2 className="text-3xl font-bold text-gray-800 py-2">
          「<span className="text-blue-600">{keyword}</span>」の構成案
        </h2>
        <div className="absolute top-1/2 right-0 -translate-y-1/2">
            <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ease-in-out text-sm whitespace-nowrap shadow-sm"
                title="構成案をクリップボードにコピー"
            >
                <ClipboardIcon className="w-5 h-5" />
                {copyButtonText}
            </button>
        </div>
      </div>

      {/* 執筆開始ボタン */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={() => {
            setWritingMode('v1');
            setShowArticleWriter(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl transition-all duration-200 font-medium shadow-md hover:shadow-lg"
        >
          <span className="text-xl">📝</span>
          <span>執筆開始（従来版）</span>
        </button>
        <button
          onClick={() => {
            setWritingMode('v2');
            setShowArticleWriter(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl transition-all duration-200 font-medium shadow-md hover:shadow-lg"
        >
          <span className="text-xl">✨</span>
          <span>執筆開始（Ver.2）</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<TitleIcon className="w-6 h-6 text-blue-500" />} title="提案タイトル">
            <p className="text-lg font-semibold text-gray-800">{outline.title}</p>
        </Card>
        <Card icon={<TargetIcon className="w-6 h-6 text-blue-500" />} title="ターゲット読者">
            <p className="text-gray-700">{outline.targetAudience}</p>
        </Card>
      </div>

      <Card icon={<IntroIcon className="w-6 h-6 text-blue-500" />} title="導入">
        <p className="text-gray-700">{outline.introduction}</p>
      </Card>

      {outline.characterCountAnalysis && (
        <Card icon={<CharacterCountIcon className="w-6 h-6 text-blue-500" />} title="競合の文字数分析">
            <p className="text-sm text-gray-500 mb-4">
                情報提供を主目的とする記事 {outline.characterCountAnalysis.analyzedArticles}件を分析した結果です。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                    <p className="text-sm text-gray-500">平均</p>
                    <p className="text-2xl font-bold text-gray-800">{outline.characterCountAnalysis.average.toLocaleString()} <span className="text-base font-normal">文字</span></p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">中央値</p>
                    <p className="text-2xl font-bold text-gray-800">{outline.characterCountAnalysis.median.toLocaleString()} <span className="text-base font-normal">文字</span></p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">最小</p>
                    <p className="text-2xl font-bold text-gray-800">{outline.characterCountAnalysis.min.toLocaleString()} <span className="text-base font-normal">文字</span></p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">最大</p>
                    <p className="text-2xl font-bold text-gray-800">{outline.characterCountAnalysis.max.toLocaleString()} <span className="text-base font-normal">文字</span></p>
                </div>
            </div>
        </Card>
      )}

      <Card icon={<OutlineIcon className="w-6 h-6 text-blue-500" />} title="記事構成案">
        <ul className="space-y-4">
          {outline.outline.map((section, index) => (
            <li key={index} className="pl-4 border-l-4 border-blue-400 py-2">
              <h4 className="font-bold text-lg text-gray-800">
                <span className="text-blue-600 mr-2">H2:</span>{section.heading}
              </h4>
              {section.subheadings && section.subheadings.length > 0 && (
                <ul className="mt-2 pl-6 list-disc list-outside space-y-1 marker:text-blue-400">
                  {section.subheadings.map((sub, subIndex) => (
                    <li key={subIndex}>
                      <span className="font-semibold text-gray-600">H3:</span>{" "}
                      {typeof sub === "string" ? sub : sub.text}
                    </li>
                  ))}
                </ul>
              )}
               {section.imageSuggestion && (
                <div className="mt-3 ml-6 p-3 bg-blue-50 rounded-lg flex items-start gap-3 border border-blue-200">
                    <ImageIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                        <p className="font-semibold text-sm text-blue-700">画像提案</p>
                        <p className="text-gray-600 text-sm">{section.imageSuggestion}</p>
                    </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

       <Card icon={<ConclusionIcon className="w-6 h-6 text-blue-500" />} title="まとめ（本文内容）">
        <p className="text-sm text-gray-500 mb-2">
          ※この内容は最後のH2「まとめ」見出しの本文として使用されます
        </p>
        <p className="text-gray-700">{outline.conclusion}</p>
      </Card>

      <Card icon={<KeywordIcon className="w-6 h-6 text-blue-500" />} title="含めるべき共起語・キーワード">
        <div className="flex flex-wrap gap-2">
          {outline.keywords.map((kw, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full"
            >
              {kw}
            </span>
          ))}
        </div>
      </Card>

      {sources && sources.length > 0 && (
        <Card icon={<LinkIcon className="w-6 h-6 text-blue-500" />} title="参考サイト">
            <ul className="space-y-2">
                {sources.map((source, index) => (
                    <li key={index} className="truncate">
                        <a
                            href={source.web.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            title={source.web.uri}
                        >
                           {source.web.title || source.web.uri}
                        </a>
                    </li>
                ))}
            </ul>
        </Card>
      )}

      {/* 記事執筆モーダル */}
      {showArticleWriter && (
        <ArticleWriter
          outline={outline}
          keyword={keyword}
          writingMode={writingMode}
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

export default OutlineDisplay;
