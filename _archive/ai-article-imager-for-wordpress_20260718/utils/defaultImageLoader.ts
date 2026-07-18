// デフォルト画像の読み込みユーティリティ

// デフォルト画像のパスを定義
const DEFAULT_IMAGES_PATH = '/default-images/';

// 対応する画像拡張子
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

/**
 * URLからbase64形式に変換
 */
async function urlToBase64(url: string): Promise<string> {
  try {
    // Viteは日本語ファイル名を正しく扱えない可能性があるため、
    // エンコーディングせずにそのまま試す
    console.log(`🔗 Fetching: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      // 失敗した場合はエンコードを試す
      console.log(`❌ Direct fetch failed, trying with encoding...`);
      const urlParts = url.split('/');
      const filename = urlParts.pop() || '';
      const encodedFilename = encodeURIComponent(filename);
      const encodedUrl = [...urlParts, encodedFilename].join('/');

      console.log(`🔗 Fetching encoded: ${encodedUrl}`);
      const encodedResponse = await fetch(encodedUrl);

      if (!encodedResponse.ok) {
        throw new Error(`HTTP error! status: ${encodedResponse.status} for ${url}`);
      }

      const blob = await encodedResponse.blob();
      return blobToBase64(blob);
    }

    const blob = await response.blob();
    return blobToBase64(blob);
  } catch (error) {
    console.error(`Failed to convert URL to base64: ${url}`, error);
    throw error;
  }
}

/**
 * BlobをBase64に変換するヘルパー関数
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * デフォルト画像のリストを取得
 * 注：Viteではpublicフォルダの内容を動的に取得できないため、
 * 手動でファイル名をリストする必要があります。
 * 実際の運用では、ビルド時にファイルリストを生成するか、
 * サーバーAPIを使用することを推奨します。
 */
export async function getDefaultImageList(): Promise<string[]> {
  // ここに実際のファイル名を追加してください
  // 例: return ['merit.jpg', 'demerit.png', 'overview.jpg'];
  
  // 開発用：manifest.jsonファイルを使用してファイルリストを管理
  try {
    const response = await fetch(`${DEFAULT_IMAGES_PATH}manifest.json`);
    if (response.ok) {
      const manifest = await response.json();
      return manifest.files || [];
    }
  } catch (error) {
    console.log('No manifest.json found, using empty list');
  }
  
  return [];
}

/**
 * デフォルト画像を読み込んでMapとして返す
 */
export async function loadDefaultImages(): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  
  try {
    const fileList = await getDefaultImageList();
    
    if (fileList.length === 0) {
      console.log('📁 デフォルト画像が見つかりません。/public/default-images/フォルダに画像を配置してください。');
      return imageMap;
    }
    
    console.log(`📁 ${fileList.length}個のデフォルト画像を読み込み中...`);
    
    // 並列で画像を読み込み
    const loadPromises = fileList.map(async (filename) => {
      try {
        const url = `${DEFAULT_IMAGES_PATH}${filename}`;
        const base64 = await urlToBase64(url);
        return { filename, base64 };
      } catch (error) {
        console.error(`❌ 画像読み込みエラー: ${filename}`, error);
        return null;
      }
    });
    
    const results = await Promise.all(loadPromises);
    
    // 成功した画像をMapに追加
    results.forEach(result => {
      if (result) {
        imageMap.set(result.filename, result.base64);
        console.log(`✅ 読み込み完了: ${result.filename}`);
      }
    });
    
    console.log(`📁 デフォルト画像の読み込み完了: ${imageMap.size}個`);
    
  } catch (error) {
    console.error('デフォルト画像の読み込みに失敗しました:', error);
  }
  
  return imageMap;
}

/**
 * FileオブジェクトをBase64文字列とファイル名のMapから作成
 * （既存のFileUploadコンポーネントとの互換性のため）
 */
export async function createFileFromBase64(filename: string, base64: string): Promise<File> {
  // base64からblobを作成
  const res = await fetch(base64);
  const blob = await res.blob();
  
  // blobからFileオブジェクトを作成
  return new File([blob], filename, { type: blob.type });
}