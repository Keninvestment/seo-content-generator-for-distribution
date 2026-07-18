import { H2Section } from '../types';

const summarizeH2 = (text: string): string => {
    return text.replace(/\s+/g, ' ').trim().slice(0, 120);
};

// HTMLからH1タイトルを抽出する関数
export const extractH1Title = (htmlContent: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const h1 = doc.querySelector('h1');
    
    if (h1) {
        return h1.textContent?.trim() || 'AI Generated Article';
    }
    
    // H1が見つからない場合、titleタグを探す
    const title = doc.querySelector('title');
    if (title) {
        return title.textContent?.trim() || 'AI Generated Article';
    }
    
    return 'AI Generated Article';
};

export const parseHtml = (htmlContent: string, baseImageMap: Map<string, string>, promptStyle: string): H2Section[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const h2s = doc.querySelectorAll('h2');
    
    const sections: H2Section[] = [];
    const availableImages = Array.from(baseImageMap.entries());

    if (availableImages.length === 0) {
        return [];
    }

    // 画像を均等に分散するためのインデックス管理
    let imageUsageCount = new Map<string, number>();
    availableImages.forEach(([name]) => imageUsageCount.set(name, 0));

    h2s.forEach((h2, index) => {
        const h2Text = h2.textContent?.trim() || '';
        if (!h2Text) return;

        const altText = summarizeH2(h2Text);
        
        let paragraphText = '';
        let nextElement = h2.nextElementSibling;
        if (nextElement && nextElement.tagName.toLowerCase() === 'p') {
            paragraphText = (nextElement.textContent || '').trim().slice(0, 120);
        }

        // 最も使用回数が少ない画像を選択（均等分散）
        let selectedImage = availableImages[0];
        let minUsage = imageUsageCount.get(availableImages[0][0]) || 0;
        
        for (const image of availableImages) {
            const usage = imageUsageCount.get(image[0]) || 0;
            if (usage < minUsage) {
                minUsage = usage;
                selectedImage = image;
            }
        }
        
        const [selectedImageName, selectedImageB64] = selectedImage;
        imageUsageCount.set(selectedImageName, (imageUsageCount.get(selectedImageName) || 0) + 1);
        
        const prompt = `あなたはプロのイラストレーターです。提供されたベース画像の持つ画風（アートスタイル）を参考程度に留めながら、以下の指示に従ってイラストを生成してください。

# 指示
- **最重要テーマ:** 「${h2Text}」という見出しの内容を、イラストの主題として表現してください。これが最も優先されるべき指示です。
- **補足情報:** 「${paragraphText}」という文章も参考に、イラストの具体的なシーンを描写してください。
- **イラストのスタイル:** 「${promptStyle}」で制作してください。
- **構図と仕様:**
  - 16:9の横長サイズ。
  - 魅力的でプロフェッショナルな構図。
  - 文字、ロゴ、署名、透かしは一切含めないでください。
`;

        sections.push({
            id: index,
            h2Text,
            altText,
            paragraphText,
            baseImageName: selectedImageName,
            baseImage: selectedImageB64,
            prompt,
            backgroundInstruction: '',
            status: 'pending',
            generatedImage: null,
            errorMessage: null,
            mediaId: null,
            sourceUrl: null,
            generationStep: null,
        });
    });

    return sections;
};