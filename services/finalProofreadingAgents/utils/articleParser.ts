// 記事を要素ごとに分解して番号付けするユーティリティ
import { COMPANY_MASTER } from '../../companyMasterData';

export interface ParsedElement {
  index: number;        // 1から始まる通し番号
  tag: string;         // 'h2', 'h3', 'p' など
  content: string;     // HTMLタグを含む要素全体
  text: string;        // タグを除いたテキスト部分
  originalIndex: number; // 元のHTML内での位置（復元用）
}

/**
 * HTML記事を要素ごとに分解して番号付けする
 * @param html HTML形式の記事
 * @returns 番号付けされた要素の配列
 */
export function parseArticleElements(html: string): ParsedElement[] {
  const elements: ParsedElement[] = [];

  // 主要なブロック要素を抽出（h2, h3, p）
  // リストやテーブルは一旦除外（必要に応じて追加可能）
  const regex = /<(h2|h3|p)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi;
  const matches = [...html.matchAll(regex)];

  matches.forEach((match, index) => {
    const fullElement = match[0];
    const tagName = match[1].toLowerCase();

    // タグを除いたテキスト部分を抽出
    const textContent = fullElement
      .replace(/<[^>]+>/g, '') // すべてのHTMLタグを除去
      .replace(/\s+/g, ' ')     // 複数の空白を1つに
      .trim();

    elements.push({
      index: index + 1,  // 1から始まる番号
      tag: tagName,
      content: fullElement,
      text: textContent,
      originalIndex: match.index || 0
    });
  });

  return elements;
}

/**
 * 番号付けされた要素リストを見やすい形式で表示（デバッグ用）
 */
export function formatElementList(elements: ParsedElement[]): string {
  return elements.map(el => {
    const preview = el.text.length > 50
      ? el.text.substring(0, 50) + '...'
      : el.text;
    return `${el.index}. [${el.tag.toUpperCase()}] ${preview}`;
  }).join('\n');
}

/**
 * 特定の番号の要素の後に出典を挿入する
 * @param html 元のHTML
 * @param elements パース済み要素リスト
 * @param insertions 挿入指示（要素番号と出典HTML）
 * @returns 出典が挿入されたHTML
 */
export function insertSourcesAtElements(
  html: string,
  elements: ParsedElement[],
  insertions: Array<{ elementIndex: number; sourceHtml: string }>
): string {
  // 挿入位置を逆順にソート（後ろから挿入することで位置ズレを防ぐ）
  const sortedInsertions = [...insertions].sort((a, b) => b.elementIndex - a.elementIndex);

  let modifiedHtml = html;

  for (const insertion of sortedInsertions) {
    const element = elements.find(el => el.index === insertion.elementIndex);
    if (!element) {
      console.warn(`⚠️ 要素番号 ${insertion.elementIndex} が見つかりません`);
      continue;
    }

    // 要素の終了位置を特定
    const startPos = element.originalIndex;
    const endPos = startPos + element.content.length;

    // 出典を要素の直後に挿入
    modifiedHtml =
      modifiedHtml.slice(0, endPos) +
      '\n' + insertion.sourceHtml +
      modifiedHtml.slice(endPos);

    console.log(`✅ 要素 ${insertion.elementIndex} の後に出典を挿入しました`);
  }

  return modifiedHtml;
}

/**
 * 要素に企業名や数値が含まれているか判定（ヒューリスティック）
 * SourceRequirementAgentの補助として使用可能
 */
export function mightNeedSource(element: ParsedElement): boolean {
  const text = element.text;

  // 企業名のパターン（COMPANY_MASTERから動的に取得）
  const companyNames = Object.keys(COMPANY_MASTER);
  const hasCompanyName = companyNames.some(name => text.includes(name));

  // 数値＋単位のパターン
  const hasMetrics = /\d+[%％]|\d+[時間|分|秒]|\d+[万|億]?円|[\d,]+万/.test(text);

  // 改善・削減・向上などの成果表現
  const hasResult = /削減|向上|改善|短縮|増加|達成/.test(text);

  // 最上級表現
  const hasSuperlative = /最大|最高|最速|業界初|日本一|No\.1/.test(text);

  return hasCompanyName || (hasMetrics && hasResult) || hasSuperlative;
}