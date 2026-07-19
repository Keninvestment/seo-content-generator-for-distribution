// ファイル名ベースの意味的画像マッチング
import { GoogleGenAI } from "@google/genai";

// 類義語辞書（拡張可能）
const SYNONYM_GROUPS = {
  // 概要・基本系（新規追加）
  overview: [
    "とは",
    "概要",
    "基本",
    "基礎",
    "概念",
    "仕組み",
    "定義",
    "意味",
    "全体像",
    "overview",
    "入門",
    "初心者",
    "はじめに",
    "紹介",
  ],

  // ポジティブ系
  merit: [
    "メリット",
    "利点",
    "長所",
    "ベネフィット",
    "効果",
    "おすすめ",
    "推奨",
    "強み",
    "優位性",
    "アドバンテージ",
    "価値",
    "特徴",
    "魅力",
    "ポイント",
    "成功",
  ],

  // ネガティブ系
  demerit: [
    "デメリット",
    "リスク",
    "注意点",
    "課題",
    "懸念",
    "落とし穴",
    "問題",
    "短所",
    "弱点",
    "危険",
    "警告",
    "留意",
    "制約",
    "制限",
    "NG",
  ],

  // 活用・使い方系（拡張）
  usage: [
    "活用",
    "使い方",
    "利用",
    "応用",
    "実践",
    "運用",
    "活かし方",
    "使いこなす",
    "活用法",
    "利用方法",
    "用途",
    "適用",
  ],

  // 比較系
  comparison: [
    "比較",
    "違い",
    "対比",
    "VS",
    "versus",
    "対決",
    "差",
    "差異",
    "相違点",
    "共通点",
    "選び方",
    "選択",
  ],

  // 手順系
  howto: [
    "方法",
    "手順",
    "手続き",
    "ステップ",
    "やり方",
    "流れ",
    "フロー",
    "導入",
    "実装",
    "設定",
    "使い方",
    "ガイド",
    "チュートリアル",
  ],

  // 事例系
  example: [
    "事例",
    "例",
    "ケース",
    "実例",
    "成功事例",
    "失敗事例",
    "活用例",
    "実績",
    "導入例",
    "成果",
    "効果",
    "結果",
  ],

  // FAQ系（新規追加）
  faq: [
    "FAQ",
    "faq",
    "よくある質問",
    "質問",
    "Q&A",
    "QA",
    "疑問",
    "回答",
    "お問い合わせ",
    "ヘルプ",
  ],

  // 料金系
  pricing: [
    "料金",
    "価格",
    "費用",
    "コスト",
    "値段",
    "予算",
    "見積もり",
    "プラン",
    "プライシング",
    "無料",
    "有料",
  ],

  // まとめ系
  summary: [
    "まとめ",
    "総括",
    "結論",
    "要約",
    "サマリー",
    "振り返り",
    "ポイント",
    "重要",
    "キーポイント",
    "要点",
  ],

  // 解決系
  solution: [
    "解決",
    "解決策",
    "対策",
    "対処法",
    "改善",
    "提案",
    "ソリューション",
    "アプローチ",
    "施策",
    "打ち手",
    "ポイント",
    "活用",
  ],

  // サービス訴求系
  service: [
    "サービス",
    "service",
    "無料相談",
    "お問い合わせ",
    "ご相談",
    "導入支援",
    "弊社",
    "当社",
  ],
};

// ファイル名から関連するグループを特定（優先順位付き）
function identifyFileGroups(filename: string): string[] {
  // 中黒（・）と記号をスペースに置換して、個別の単語として認識させる
  const normalizedName = filename
    .toLowerCase()
    .replace(/・/g, " ")
    .replace(/？/g, " ")
    .replace(/[!！]/g, " ");
  const groups: string[] = [];
  let primaryGroup: string | null = null; // 最初に見つかったグループを記録

  console.log(`🔍 ファイル名解析: "${filename}" → "${normalizedName}"`);

  // 単語境界を考慮したマッチング
  const words = normalizedName.split(/[\s　]+/).filter((w) => w.length > 0); // スペースまたは全角スペースで分割

  // 最初の単語から優先的にマッチング
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const word = words[wordIndex];

    for (const [groupName, keywords] of Object.entries(SYNONYM_GROUPS)) {
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();

        if (word === keywordLower || word.includes(keywordLower)) {
          if (!groups.includes(groupName)) {
            groups.push(groupName);

            // 最初の単語でマッチしたグループを優先グループとする
            if (wordIndex === 0 && !primaryGroup) {
              primaryGroup = groupName;
              console.log(
                `  ⭐ 優先キーワード「${keyword}」でグループ「${groupName}」にマッチ`
              );
            } else {
              console.log(
                `  ✓ キーワード「${keyword}」でグループ「${groupName}」にマッチ`
              );
            }
          }
        }
      }
    }
  }

  // 優先グループを配列の先頭に移動
  if (primaryGroup && groups.includes(primaryGroup)) {
    const filteredGroups = groups.filter((g) => g !== primaryGroup);
    const result = [primaryGroup, ...filteredGroups];
    console.log(`  → 該当グループ（優先順）: [${result.join(", ")}]`);
    return result;
  }

  console.log(`  → 該当グループ: [${groups.join(", ")}]`);
  return groups;
}

// H2見出しがどのグループに属するか判定
function identifyH2Groups(h2Text: string): string[] {
  const normalizedText = h2Text.toLowerCase();
  const groups: string[] = [];

  console.log(`🔍 H2見出し解析: "${h2Text}"`);

  for (const [groupName, keywords] of Object.entries(SYNONYM_GROUPS)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        if (!groups.includes(groupName)) {
          groups.push(groupName);
          console.log(
            `  ✓ H2キーワード「${keyword}」でグループ「${groupName}」にマッチ`
          );
        }
      }
    }
  }

  console.log(`  → H2該当グループ: [${groups.join(", ")}]`);
  return groups;
}

// スコア計算（グループの重複度 + 優先順位考慮）
function calculateMatchScore(fileGroups: string[], h2Groups: string[]): number {
  console.log(
    `  📊 スコア計算: ファイルグループ[${fileGroups.join(
      ", "
    )}] vs H2グループ[${h2Groups.join(", ")}]`
  );

  if (fileGroups.length === 0 || h2Groups.length === 0) {
    console.log(`    → どちらかが空のため、スコア: 0`);
    return 0;
  }

  // 共通グループの数をカウント
  const commonGroups = fileGroups.filter((g) => h2Groups.includes(g));

  // 基本スコア = 共通グループ数 / 最大グループ数
  let score =
    commonGroups.length / Math.max(fileGroups.length, h2Groups.length);

  // 優先グループ（ファイル名の最初のグループ）がマッチした場合はボーナス
  if (fileGroups.length > 0 && h2Groups.includes(fileGroups[0])) {
    score += 0.5; // 優先グループボーナス
    console.log(`    → 優先グループ「${fileGroups[0]}」がマッチ！ボーナス付与`);
  }

  console.log(
    `    → 共通グループ: [${commonGroups.join(
      ", "
    )}], 最終スコア: ${score.toFixed(2)}`
  );
  return score;
}

// Gemini APIを使った意味的類似度の判定（オプション）
async function calculateSemanticSimilarity(
  filename: string,
  h2Text: string,
  apiKey: string
): Promise<number> {
  try {
    const genAI = new GoogleGenAI({ apiKey });
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
以下のファイル名とH2見出しの意味的な関連度を0-1のスコアで評価してください。
スコアのみを数値で返してください。

ファイル名: ${filename}
H2見出し: ${h2Text}

評価基準:
- 1.0: 完全に一致する概念
- 0.7-0.9: 強く関連する概念
- 0.4-0.6: ある程度関連する概念
- 0.1-0.3: わずかに関連する概念
- 0.0: 全く関連しない概念

スコア:`;

    const result = await model.generateContent({ contents: prompt });
    const score = parseFloat(result.text.trim());

    return isNaN(score) ? 0 : Math.min(1, Math.max(0, score));
  } catch (error) {
    console.error("Semantic similarity calculation failed:", error);
    return 0;
  }
}

// H2見出しが「まとめ」かどうかを判定
export function isSummaryHeading(h2Text: string): boolean {
  const text = h2Text.toLowerCase();
  // 「まとめ：」（コロン付き）の見出しのみを判定
  return text.includes("まとめ：");
}

// メイン関数：ファイル名ベースで最適な画像を選択
export async function matchImageByFilename(
  h2Text: string,
  imageMap: Map<string, string>,
  options: {
    useSemanticSimilarity?: boolean;
    apiKey?: string;
  } = {}
): Promise<{ filename: string; base64: string; score: number }> {
  const candidates: Array<{
    filename: string;
    base64: string;
    score: number;
  }> = [];

  // 各画像ファイルのスコアを計算
  for (const [filename, base64] of imageMap.entries()) {
    // ファイル名から拡張子を除去
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    // グループベースのマッチング
    const fileGroups = identifyFileGroups(nameWithoutExt);
    const h2Groups = identifyH2Groups(h2Text);
    let score = calculateMatchScore(fileGroups, h2Groups);

    // セマンティック類似度を追加（オプション）
    if (options.useSemanticSimilarity && options.apiKey && score < 0.5) {
      // スコアが低い場合のみAPIを使用（コスト削減）
      const semanticScore = await calculateSemanticSimilarity(
        nameWithoutExt,
        h2Text,
        options.apiKey
      );
      // 重み付け平均（グループマッチ: 0.6, セマンティック: 0.4）
      score = score * 0.6 + semanticScore * 0.4;
    }

    candidates.push({
      filename,
      base64,
      score,
    });

    console.log(
      `📊 マッチングスコア: ${filename} <-> "${h2Text}" = ${score.toFixed(2)}`
    );
  }

  // スコアが最も高い画像を選択
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0 || candidates[0].score === 0) {
    // マッチする画像がない場合はメリット系画像を優先的に選択
    console.log("⚠️ 適切な画像が見つからないため、メリット系画像を探します...");

    // メリット系の画像を探す
    for (const [filename, base64] of imageMap.entries()) {
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
      const fileGroups = identifyFileGroups(nameWithoutExt);

      if (fileGroups.includes("merit")) {
        console.log(`✅ メリット系画像 "${filename}" をデフォルトとして選択`);
        return {
          filename,
          base64,
          score: 0.1, // 低スコアだが0ではない
        };
      }
    }

    // メリット系も見つからない場合は最初の画像を使用
    const images = Array.from(imageMap.entries());
    if (images.length > 0) {
      console.log(`ℹ️ デフォルト画像として "${images[0][0]}" を選択`);
      return {
        filename: images[0][0],
        base64: images[0][1],
        score: 0,
      };
    }

    throw new Error("利用可能な画像がありません");
  }

  return candidates[0];
}

// 類義語グループを動的に追加する関数（拡張用）
export function addSynonymGroup(groupName: string, keywords: string[]) {
  SYNONYM_GROUPS[groupName] = keywords;
}

// デバッグ用：現在の類義語辞書を取得
export function getSynonymGroups() {
  return { ...SYNONYM_GROUPS };
}
