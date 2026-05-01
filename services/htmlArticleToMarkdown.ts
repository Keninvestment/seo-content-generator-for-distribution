/**
 * 依存ゼロの簡易 HTML→Markdown（note 投稿前のドラフト用途）。
 */

function stripTags(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

/** SEO 記事 HTML の主要タグを MD 近似に変換 */
export function htmlArticleToMarkdown(
  html: string,
  frontMatter?: { title: string; description?: string; keyword?: string }
): string {
  let s = html.replace(/\r/g, "");

  const lines: string[] = [];
  if (frontMatter?.title) {
    lines.push(`# ${frontMatter.title}`, "");
    if (frontMatter.description)
      lines.push(`> ${frontMatter.description}`, "");
    if (frontMatter.keyword)
      lines.push(`キーワード: ${frontMatter.keyword}`, "");
    if (frontMatter.description || frontMatter.keyword) lines.push("");
  }

  let body = s
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|section|article|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<h1[^>]*>([\s\S]*?)<\/h1>/gi,
      (_, inner) => `\n\n# ${stripTags(inner)}\n\n`
    )
    .replace(
      /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
      (_, inner) => `\n\n## ${stripTags(inner)}\n\n`
    )
    .replace(
      /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
      (_, inner) => `\n\n### ${stripTags(inner)}\n\n`
    )
    .replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_, inner) => `- ${stripTags(inner)}\n`
    )
    .replace(
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, inner) =>
        `[${stripTags(inner)}](${href})`.replace(/\n/g, " ")
    )
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) =>
      stripTags(inner) ? `**${stripTags(inner)}**` : ""
    );

  body = decodeBasicEntities(body);
  lines.push(body.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim());

  return `${lines.filter(Boolean).join("\n").trim()}\n`;
}
