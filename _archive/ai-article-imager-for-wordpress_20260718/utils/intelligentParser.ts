import { H2Section } from '../types';
import {
  analyzeImageFeatures,
  groupImagesByStyle,
  selectBestImageForH2,
  enhancePromptWithGroupStyle,
  type ImageFeatures,
  type ImageGroup
} from '../services/imageAnalyzer';
import { matchImageByFilename, isSummaryHeading } from './filenameBasedMatcher';
import { createEnglishYAMLPrompt } from './promptHelper';

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

// インテリジェントな画像マッチングを使用したパース
export const parseHtmlWithIntelligentMatching = async (
  htmlContent: string, 
  baseImageMap: Map<string, string>, 
  promptStyle: string,
  onProgress?: (message: string) => void
): Promise<H2Section[]> => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const h2s = doc.querySelectorAll('h2');
    
    const sections: H2Section[] = [];
    const availableImages = Array.from(baseImageMap.entries());

    if (availableImages.length === 0) {
        return [];
    }

    onProgress?.('📸 画像の特徴を分析中...');
    
    // Step 1: 全画像の特徴を分析
    const imageFeatures: ImageFeatures[] = [];
    for (const [name, b64] of availableImages) {
      try {
        const features = await analyzeImageFeatures(name, b64);
        imageFeatures.push(features);
        onProgress?.(`✅ ${name} を分析完了`);
      } catch (error) {
        console.error(`画像分析エラー (${name}):`, error);
      }
    }

    // Step 2: 画像をグループ化
    onProgress?.('🎨 画像をスタイル別にグループ化中...');
    const imageGroups = groupImagesByStyle(imageFeatures);
    
    console.log('📊 画像グループ分析結果:');
    imageGroups.forEach((group, idx) => {
      console.log(`  グループ${idx + 1}: ${group.commonStyle}/${group.commonMood}`);
      console.log(`    画像数: ${group.images.length}`);
      console.log(`    共通要素: ${group.commonElements.join(', ')}`);
      console.log(`    適した話題: ${group.bestForTopics.slice(0, 5).join(', ')}`);
    });

    // Step 3: 各H2セクションに最適な画像を選択
    onProgress?.('🔍 各セクションに最適な画像を選択中...');
    
    for (let index = 0; index < h2s.length; index++) {
      const h2 = h2s[index];
      const h2Text = h2.textContent?.trim() || '';
      if (!h2Text) continue;

      // 「まとめ」見出しはスキップ
      if (isSummaryHeading(h2Text)) {
          console.log(`⏭️ "${h2Text}" は「まとめ」見出しのため、画像配置をスキップします`);
          continue;
      }

      // まとめ直前のセクション（サービス訴求）にも画像を配置するため、スキップ処理を無効化
      // if (index + 1 < h2s.length) {
      //     const nextH2 = h2s[index + 1];
      //     const nextH2Text = nextH2.textContent?.trim() || '';
      //     if (isSummaryHeading(nextH2Text)) {
      //         console.log(`⏭️ "${h2Text}" は「まとめ」の直前（サービス訴求セクション）のため、画像配置をスキップします`);
      //         continue;
      //     }
      // }

      const altText = summarizeH2(h2Text);
      
      let paragraphText = '';
      let nextElement = h2.nextElementSibling;
      if (nextElement && nextElement.tagName.toLowerCase() === 'p') {
          paragraphText = (nextElement.textContent || '').trim().slice(0, 120);
      }

      // H2内容に最適な画像を選択
      const { selectedGroup, selectedImage, matchReason } = await selectBestImageForH2(
        h2Text,
        paragraphText,
        imageGroups
      );

      console.log(`  H2「${h2Text.slice(0, 30)}...」→ ${selectedGroup.commonStyle}グループ (${matchReason})`);

      // 英語YAML形式のプロンプトを作成
      const basePrompt = createEnglishYAMLPrompt(
        h2Text,
        paragraphText,
        promptStyle
      );

      // グループスタイル情報でプロンプトを強化（英語YAMLにも適用可能）
      const enhancedPrompt = basePrompt; // enhancePromptWithGroupStyle は一旦スキップ（YAML形式への対応が必要）

      sections.push({
          id: index,
          h2Text,
          altText,
          paragraphText,
          baseImageName: selectedImage.imageName,
          baseImage: selectedImage.imageB64,
          prompt: enhancedPrompt,
          backgroundInstruction: '',
          status: 'pending',
          generatedImage: null,
          errorMessage: null,
          mediaId: null,
          sourceUrl: null,
          generationStep: null,
      });
    }

    onProgress?.('✅ 画像マッチング完了！');
    return sections;
};

// ファイル名ベースのインテリジェントマッチング（新機能）
export const parseHtmlWithFilenameMatching = async (
  htmlContent: string,
  baseImageMap: Map<string, string>,
  promptStyle: string,
  onProgress?: (message: string) => void
): Promise<H2Section[]> => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const h2s = doc.querySelectorAll('h2');
    
    const sections: H2Section[] = [];
    
    if (baseImageMap.size === 0) {
        return [];
    }

    onProgress?.('📝 ファイル名ベースの画像マッチングを開始...');
    
    // 画像使用回数を追跡（バランスを保つため）
    const imageUsageCount = new Map<string, number>();
    for (const [filename] of baseImageMap.entries()) {
        imageUsageCount.set(filename, 0);
    }

    for (let index = 0; index < h2s.length; index++) {
        const h2 = h2s[index];
        const h2Text = h2.textContent?.trim() || '';
        if (!h2Text) continue;

        // 「まとめ」見出しはスキップ
        if (isSummaryHeading(h2Text)) {
            console.log(`⏭️ "${h2Text}" は「まとめ」見出しのため、画像配置をスキップします`);
            continue;
        }

        // まとめ直前のセクション（サービス訴求）にも画像を配置するため、スキップ処理を無効化
        // if (index + 1 < h2s.length) {
        //     const nextH2 = h2s[index + 1];
        //     const nextH2Text = nextH2.textContent?.trim() || '';
        //     if (isSummaryHeading(nextH2Text)) {
        //         console.log(`⏭️ "${h2Text}" は「まとめ」の直前（サービス訴求セクション）のため、画像配置をスキップします`);
        //         continue;
        //     }
        // }

        const altText = summarizeH2(h2Text);

        let paragraphText = '';
        let nextElement = h2.nextElementSibling;
        if (nextElement && nextElement.tagName.toLowerCase() === 'p') {
            paragraphText = (nextElement.textContent || '').trim().slice(0, 120);
        }

        onProgress?.(`🔍 "${h2Text}" に最適な画像を選択中...`);

        // ファイル名ベースでマッチング
        const matchResult = await matchImageByFilename(
            h2Text,
            baseImageMap,
            {
                useSemanticSimilarity: false, // まずは類義語辞書のみで判定
                apiKey: import.meta.env.VITE_GEMINI_API_KEY
            }
        );

        // 使用回数を更新
        const currentCount = imageUsageCount.get(matchResult.filename) || 0;
        imageUsageCount.set(matchResult.filename, currentCount + 1);

        // スコアが低すぎる場合の警告
        if (matchResult.score < 0.3) {
            console.warn(`⚠️ "${h2Text}" に適切な画像が見つかりませんでした。"${matchResult.filename}" を使用します（スコア: ${matchResult.score.toFixed(2)}）`);
        } else {
            console.log(`✅ "${h2Text}" に "${matchResult.filename}" を選択（スコア: ${matchResult.score.toFixed(2)}）`);
        }

        // 英語YAML形式のプロンプトを作成
        const prompt = createEnglishYAMLPrompt(
          h2Text,
          paragraphText,
          promptStyle
        );

        sections.push({
            id: index,
            h2Text,
            altText,
            paragraphText,
            baseImageName: matchResult.filename,
            baseImage: matchResult.base64,
            prompt,
            backgroundInstruction: '',
            status: 'pending',
            generatedImage: null,
            errorMessage: null,
            mediaId: null,
            sourceUrl: null,
            generationStep: null,
        });
    }

    // 使用統計を表示
    console.log('\n📊 画像使用統計:');
    for (const [filename, count] of imageUsageCount.entries()) {
        console.log(`  ${filename}: ${count}回使用`);
    }

    onProgress?.('✅ ファイル名ベースのマッチング完了！');
    return sections;
};

// 従来の均等分散版（フォールバック用）
export const parseHtmlSimple = (htmlContent: string, baseImageMap: Map<string, string>, promptStyle: string): H2Section[] => {
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

        // 「まとめ」見出しはスキップ
        if (isSummaryHeading(h2Text)) {
            console.log(`⏭️ "${h2Text}" は「まとめ」見出しのため、画像配置をスキップします`);
            return;
        }

        // まとめ直前のセクション（サービス訴求）にも画像を配置するため、スキップ処理を無効化
        // if (index + 1 < h2s.length) {
        //     const nextH2 = h2s[index + 1];
        //     const nextH2Text = nextH2.textContent?.trim() || '';
        //     if (isSummaryHeading(nextH2Text)) {
        //         console.log(`⏭️ "${h2Text}" は「まとめ」の直前（サービス訴求セクション）のため、画像配置をスキップします`);
        //         return;
        //     }
        // }

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
        
        // 英語YAML形式のプロンプトを作成
        const prompt = createEnglishYAMLPrompt(
          h2Text,
          paragraphText,
          promptStyle
        );

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