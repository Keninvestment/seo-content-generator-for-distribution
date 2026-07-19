/**
 * 画像生成プロンプトを英語YAML形式に変換するヘルパー関数
 */

/**
 * 日本語のテキストを簡単な英語に翻訳（基本的な変換のみ）
 */
function translateToEnglish(text: string): string {
  // 基本的な翻訳マッピング
  const translations: Record<string, string> = {
    // スタイル関連
    'フォトリアリスティック': 'photorealistic',
    'イラスト風': 'illustration style',
    'アニメ風': 'anime style',
    '水彩画風': 'watercolor style',
    'ミニマリスト': 'minimalist',
    'モダン': 'modern',
    'ビンテージ': 'vintage',
    'フラットデザイン': 'flat design',
    '3Dレンダリング': '3D rendering',

    // ビジネス関連
    '生成AI': 'generative AI',
    'AI活用': 'AI utilization',
    '業務効率化': 'business efficiency',
    'デジタル変革': 'digital transformation',
    'イノベーション': 'innovation',
    'ビジネス': 'business',
    '企業': 'enterprise',
    'オフィス': 'office',
    '会議': 'meeting',
    'チーム': 'team',

    // 一般的な用語
    '人物': 'people',
    '風景': 'landscape',
    '背景': 'background',
    '明るい': 'bright',
    '暗い': 'dark',
    'プロフェッショナル': 'professional',
    '洗練された': 'sophisticated',
    'シンプル': 'simple',
    '複雑な': 'complex',
    '未来的': 'futuristic'
  };

  let translated = text;
  for (const [ja, en] of Object.entries(translations)) {
    translated = translated.replace(new RegExp(ja, 'g'), en);
  }

  return translated;
}

/**
 * 画像生成プロンプトを英語YAML形式に変換
 */
export function createEnglishYAMLPrompt(
  h2Text: string,
  paragraphText: string,
  promptStyle: string,
  backgroundInstruction?: string
): string {
  // テキストを英語に変換（簡易版）
  const mainTheme = translateToEnglish(h2Text);
  const context = translateToEnglish(paragraphText);
  const style = translateToEnglish(promptStyle);
  const background = backgroundInstruction ? translateToEnglish(backgroundInstruction) : null;

  // YAML形式のプロンプトを構築
  const yamlPrompt = `# Professional Illustration Generation Request

instruction:
  role: "You are a professional illustrator creating high-quality visual content."

main_subject:
  theme: "${mainTheme}"
  description: "Express this heading content as the main subject of the illustration"
  priority: "highest"

context:
  supporting_text: "${context}"
  usage: "Reference for specific scene details"

style:
  artistic_style: "${style}"
  reference: "Use provided base image style as loose reference only"

composition:
  aspect_ratio: "16:9"
  orientation: "landscape"
  quality: "professional"
  mood: "engaging and attractive"
${background ? `
background:
  specification: "${background}"
  integration: "Seamlessly blend with main subject"` : ''}

technical_requirements:
  dimensions:
    - aspect: "16:9 widescreen"
    - resolution: "high quality"

restrictions:
  absolutely_no:
    - text_elements: "No text of any kind"
    - logos: "No logos or brand marks"
    - signatures: "No artist signatures"
    - watermarks: "No watermarks"
    - letters: "No alphabets or characters"
    - numbers: "No numerical digits"

output_format:
  type: "digital illustration"
  style_consistency: "maintain throughout image"
  color_harmony: "balanced and appealing"`;

  return yamlPrompt;
}

/**
 * 従来の日本語プロンプトから英語YAMLプロンプトへの変換
 */
export function convertJapaneseToEnglishYAML(japanesePrompt: string): string {
  // 日本語プロンプトから要素を抽出
  const h2Match = japanesePrompt.match(/「([^」]+)」という見出し/);
  const paragraphMatch = japanesePrompt.match(/「([^」]+)」という文章/);
  const styleMatch = japanesePrompt.match(/「([^」]+)」で制作/);

  const h2Text = h2Match ? h2Match[1] : '';
  const paragraphText = paragraphMatch ? paragraphMatch[1] : '';
  const promptStyle = styleMatch ? styleMatch[1] : 'professional illustration';

  return createEnglishYAMLPrompt(h2Text, paragraphText, promptStyle);
}