import React, { useState, useCallback, useEffect, useRef } from "react";
import { WPConfig, PostConfig, H2Section, AppState, ReportLog } from "./types";
import { extractH1Title } from "./utils/parsers";
import {
  parseHtmlWithIntelligentMatching,
  parseHtmlSimple,
  parseHtmlWithFilenameMatching,
} from "./utils/intelligentParser";
import {
  loadDefaultImages,
  createFileFromBase64,
} from "./utils/defaultImageLoader";
import { slackService } from "./services/slackService";
import { FileUpload } from "./components/FileUpload";
import { ConfigForm } from "./components/ConfigForm";
import { ProcessingView } from "./components/ProcessingView";
import { ReportView } from "./components/ReportView";
import {
  CheckCircleIcon,
  DocumentTextIcon,
  PhotoIcon,
  ArrowRightIcon,
} from "./components/icons";
import { TestSlackButton } from "./components/TestSlackButton";

// 外部から記事データを受け取るためのインターフェース
interface ArticleData {
  title?: string;
  htmlContent: string;
  metaDescription?: string;
  slug?: string; // slugを追加
  keyword?: string;
}

interface AppProps {
  // 将来的に外部から記事データを受け取る
  initialArticleData?: ArticleData;
}

const App: React.FC<AppProps> = ({ initialArticleData }) => {
  const [appState, setAppState] = useState<AppState>(AppState.CONFIG);

  // 環境変数から初期値を読み込む（認証情報はサーバー側で管理）
  console.log("🔧 環境変数の読み込み状況:");
  console.log("  VITE_API_URL:", import.meta.env.VITE_API_URL);
  console.log(
    "  VITE_WP_DEFAULT_POST_STATUS:",
    import.meta.env.VITE_WP_DEFAULT_POST_STATUS
  );

  // WordPress設定（認証情報はサーバー側で管理、UIは空欄だが機能は正常）
  const [wpConfig, setWpConfig] = useState<WPConfig>({
    base: "",
    user: "",
    app_password: "",
  });
  const [postConfig, setPostConfig] = useState<PostConfig>({
    title: "AI Generated Article", // 記事データから自動的に設定される
    status:
      (import.meta.env.VITE_WP_DEFAULT_POST_STATUS as "draft" | "publish") ||
      "draft",
  });
  const [promptStyle, setPromptStyle] = useState<string>(
    "Simple and clean illustration style"
  );

  // WordPress設定をサーバーから取得
  useEffect(() => {
    const fetchWpConfig = async () => {
      try {
        const apiUrl =
          import.meta.env.VITE_API_URL || "http://localhost:3001/api";
        const apiKey = import.meta.env.VITE_INTERNAL_API_KEY || "";
        const response = await fetch(`${apiUrl}/wordpress/config`, {
          headers: {
            "x-api-key": apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const config = await response.json();

        console.log("✅ WordPress設定を取得しました:", {
          baseUrl: config.baseUrl,
          username: config.username,
          defaultPostStatus: config.defaultPostStatus,
        });

        setWpConfig({
          base: config.baseUrl || "",
          user: config.username || "",
          app_password: "", // 空（サーバー側で管理）
        });

        setPostConfig((prev) => ({
          ...prev,
          status: config.defaultPostStatus || "draft",
        }));
      } catch (error) {
        console.error("❌ WordPress設定の取得に失敗:", error);
      }
    };

    fetchWpConfig();
  }, []);

  // localStorageから記事データを取得
  const storedArticleData =
    typeof window !== "undefined"
      ? localStorage.getItem("articleDataForImageGen_5176") ||
        localStorage.getItem("articleDataForImageGen")
      : null;
  const articleDataFromStorage = storedArticleData
    ? JSON.parse(storedArticleData)
    : null;

  const [articleHtml, setArticleHtml] = useState<string | null>(
    initialArticleData?.htmlContent ||
      articleDataFromStorage?.htmlContent ||
      null
  );
  const [articleMetaData, setArticleMetaData] = useState<{
    metaDescription?: string;
    slug?: string;
    keyword?: string;
  }>({
    metaDescription:
      initialArticleData?.metaDescription ||
      articleDataFromStorage?.metaDescription,
    slug: initialArticleData?.slug || articleDataFromStorage?.slug,
    keyword: initialArticleData?.keyword || articleDataFromStorage?.keyword,
  });
  const [baseImages, setBaseImages] = useState<File[]>([]);

  const [h2Sections, setH2Sections] = useState<H2Section[]>([]);
  const [processedSections, setProcessedSections] = useState<H2Section[]>([]);
  const [reportLogs, setReportLogs] = useState<ReportLog[]>([]);
  const [useIntelligentMatching, setUseIntelligentMatching] =
    useState<boolean>(true);
  const [processingMessage, setProcessingMessage] = useState<string>("");
  const [baseImageMap, setBaseImageMap] = useState<Map<string, string>>(
    new Map()
  );
  const [useDefaultImages, setUseDefaultImages] = useState<boolean>(true); // デフォルトでtrueに変更
  const [defaultImagesAvailable, setDefaultImagesAvailable] =
    useState<boolean>(false);
  const [isLoadingDefaultImages, setIsLoadingDefaultImages] =
    useState<boolean>(false);
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);

  // 自動実行用のrefを追加
  const autoExecuteRef = useRef<boolean>(false);
  const processArticleRef = useRef<(() => void) | null>(null);

  const allInputsProvided =
    articleHtml &&
    articleHtml.trim() !== "" &&
    (baseImages.length > 0 || useDefaultImages);
  const tooManyImages = baseImages.length > 10;

  // postMessageリスナーを設定（メインアプリからのデータ受信用）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // セキュリティ: 許可されたオリジンからのメッセージのみ受信
      const ALLOWED_ORIGINS = [
        "http://localhost:5178", // 現行開発環境
        "http://localhost:5176", // レガシー（互換性）
        "http://localhost:5177", // 画像生成エージェント
        "http://127.0.0.1:5176", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5177", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5178", // 127.0.0.1でアクセスした場合
        import.meta.env.VITE_MAIN_APP_URL, // 本番用（.envで設定）
      ].filter(Boolean); // undefined を除外

      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn("⚠️ Rejected message from unknown origin:", event.origin);
        console.log("📋 Allowed origins:", ALLOWED_ORIGINS);
        return;
      }

      console.log("📨 postMessageを受信:", event);

      if (event.data?.type === "ARTICLE_DATA" && event.data?.data) {
        const articleData = event.data.data;

        // ✅ localStorage に保存（ページ更新に備える・容量不足時はスキップ）
        try {
          localStorage.setItem(
            "articleDataForImageGen",
            JSON.stringify(articleData)
          );
          console.log("💾 データを localStorage に保存しました");
        } catch (error) {
          // 容量不足でも処理は継続（postMessageでデータは既に受信済み）
          console.warn("⚠️ localStorage保存スキップ（容量不足）- 処理は継続します");
        }

        // HTMLからH1タイトルを自動抽出
        const extractedTitle =
          articleData.title || extractH1Title(articleData.htmlContent);

        // 投稿設定を更新（タイトルを実際の記事タイトルに）
        setPostConfig((prev) => ({
          ...prev,
          title: extractedTitle,
        }));

        // HTMLコンテンツをセット
        setArticleHtml(articleData.htmlContent);

        // メタ情報を保存
        setArticleMetaData({
          metaDescription: articleData.metaDescription,
          slug: articleData.slug,
          keyword: articleData.keyword,
        });

        // スプレッドシート行番号をlocalStorageに保存（5177側で）
        if (articleData.spreadsheetRow) {
          try {
            localStorage.setItem(
              "currentSpreadsheetRow",
              articleData.spreadsheetRow.toString()
            );
            console.log(
              "📊 スプレッドシート行番号を保存:",
              articleData.spreadsheetRow
            );
          } catch (error) {
            console.warn("⚠️ スプレッドシート行番号の保存スキップ");
          }
        }

        console.log("✅ postMessage経由で記事データを受け取りました:");
        console.log("  タイトル:", extractedTitle);
        console.log("  HTML文字数:", articleData.htmlContent.length);
        console.log("  キーワード:", articleData.keyword);
        console.log("  スコア:", articleData.score);
        console.log(
          "  スプレッドシート行:",
          articleData.spreadsheetRow || "なし"
        );

        // 🎯 自動実行フラグの判定（データソースに基づく）
        const isTestMode =
          articleData.isTestMode ||
          articleData.slug === "test-article-for-image-generation";

        if (isTestMode) {
          // テストモード：手動実行
          autoExecuteRef.current = false;
          console.log(
            "🧪 テストモード検出：手動で「Process Article」ボタンを押してください。"
          );
        } else {
          // フル自動モード：自動実行
          autoExecuteRef.current = true;
          console.log("🚀 フル自動モードを有効化しました");

          // 3秒後に自動でProcess Articleを実行
          setTimeout(() => {
            console.log("⏰ 3秒経過 - Process Articleを自動実行します");
            // Process Article処理を直接トリガー
            if (processArticleRef.current) {
              processArticleRef.current();
            }
          }, 3000);
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // 外部から記事データが提供された場合の初期化処理
  useEffect(() => {
    // initialArticleDataまたはlocalStorageから記事データを取得
    const articleData = initialArticleData || articleDataFromStorage;

    if (articleData?.htmlContent) {
      // HTMLからH1タイトルを自動抽出
      const extractedTitle =
        articleData.title || extractH1Title(articleData.htmlContent);

      // 投稿設定を更新（タイトルを実際の記事タイトルに）
      setPostConfig((prev) => ({
        ...prev,
        title: extractedTitle,
      }));

      // HTMLコンテンツをセット
      setArticleHtml(articleData.htmlContent);

      console.log("📝 記事データを受け取りました:");
      console.log("  タイトル:", extractedTitle);
      console.log("  HTML文字数:", articleData.htmlContent.length);
      console.log("  ソース:", initialArticleData ? "props" : "localStorage");

      // localStorageから読み込んだ場合は、読み込み後にクリア
      if (!initialArticleData && storedArticleData) {
        localStorage.removeItem("articleDataForImageGen");
        console.log("  localStorageをクリアしました");
      }

      // 将来的には、ベース画像も自動的に用意できるようにする
      // 例：キーワードに基づいて適切な画像セットを自動選択
    }
  }, [initialArticleData, storedArticleData]);

  // postMessageでデータを受信（ARTICLE_DATA_TRANSFER用）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // セキュリティ: 許可されたオリジンからのメッセージのみ受信
      const ALLOWED_ORIGINS = [
        "http://localhost:5178", // 現行開発環境
        "http://localhost:5176", // レガシー（互換性）
        "http://localhost:5177", // 画像生成エージェント
        "http://127.0.0.1:5176", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5177", // 127.0.0.1でアクセスした場合
        "http://127.0.0.1:5178", // 127.0.0.1でアクセスした場合
        import.meta.env.VITE_MAIN_APP_URL, // 本番用（.envで設定）
      ].filter(Boolean); // undefined を除外

      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn(
          "⚠️ Rejected ARTICLE_DATA_TRANSFER from unknown origin:",
          event.origin
        );
        console.log("📋 Allowed origins:", ALLOWED_ORIGINS);
        return;
      }

      // 記事データ転送メッセージの処理
      if (event.data?.type === "ARTICLE_DATA_TRANSFER") {
        const articleData = event.data.data;
        console.log("📨 postMessageで記事データを受信しました！");
        console.log("  タイトル:", articleData.title);
        console.log("  HTML文字数:", articleData.htmlContent?.length);

        // ✅ localStorage に保存（ページ更新に備える・容量不足時はスキップ）
        try {
          localStorage.setItem(
            "articleDataForImageGen",
            JSON.stringify(articleData)
          );
          console.log(
            "💾 ARTICLE_DATA_TRANSFER データを localStorage に保存しました"
          );
        } catch (error) {
          // 容量不足でも処理は継続（postMessageでデータは既に受信済み）
          console.warn("⚠️ localStorage保存スキップ（容量不足）- 処理は継続します");
        }

        // HTMLからH1タイトルを自動抽出
        const extractedTitle =
          articleData.title || extractH1Title(articleData.htmlContent);

        // 投稿設定を更新
        setPostConfig((prev) => ({
          ...prev,
          title: extractedTitle,
        }));

        // HTMLコンテンツをセット
        setArticleHtml(articleData.htmlContent);

        // メタ情報を保存
        setArticleMetaData({
          metaDescription: articleData.metaDescription,
          slug: articleData.slug,
          keyword: articleData.keyword,
        });
      }
    };

    // メッセージリスナーを登録
    window.addEventListener("message", handleMessage);

    // クリーンアップ
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // デフォルト画像の存在確認
  useEffect(() => {
    const checkDefaultImages = async () => {
      try {
        const response = await fetch("/default-images/manifest.json");
        if (response.ok) {
          const manifest = await response.json();
          if (manifest.files && manifest.files.length > 0) {
            setDefaultImagesAvailable(true);
            console.log(
              `📁 ${manifest.files.length}個のデフォルト画像が利用可能です`
            );
          }
        }
      } catch (error) {
        console.log("デフォルト画像は設定されていません");
      }
    };
    checkDefaultImages();
  }, []);

  const handleProcessArticle = useCallback(async () => {
    if (!allInputsProvided) {
      alert(
        "記事HTMLを入力し、画像をアップロードするか、デフォルト画像を使用してください。"
      );
      return;
    }

    if (!useDefaultImages && tooManyImages) {
      alert(
        "最大10枚までの画像をアップロードしてください。現在" +
          baseImages.length +
          "枚がアップロードされています。"
      );
      return;
    }

    try {
      let baseImageMap = new Map<string, string>();

      if (useDefaultImages) {
        // デフォルト画像を読み込む
        setIsLoadingDefaultImages(true);
        setProcessingMessage("デフォルト画像を読み込み中...");
        baseImageMap = await loadDefaultImages();
        setIsLoadingDefaultImages(false);

        if (baseImageMap.size === 0) {
          alert(
            "デフォルト画像が見つかりません。/public/default-images/フォルダに画像を配置してください。"
          );
          setProcessingMessage("");
          return;
        }
      } else {
        // アップロードされた画像を使用
        const promises = baseImages.map((file) => {
          return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              baseImageMap.set(file.name, e.target?.result as string);
              resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        });
        await Promise.all(promises);
      }

      // 以下の処理は変更なし
      // baseImageMapをstateに保存
      setBaseImageMap(baseImageMap);

      try {
        let sections: H2Section[];

        // デバッグログ：マッチング方式の選択を明確にする
        console.log("🔍 画像マッチング方式の選択:", {
          useDefaultImages,
          useIntelligentMatching,
          baseImageMapSize: baseImageMap.size,
          willUseFilenameMatching:
            useDefaultImages ||
            (useIntelligentMatching && baseImageMap.size >= 2),
        });

        if (
          useDefaultImages ||
          (useIntelligentMatching && baseImageMap.size >= 2)
        ) {
          // デフォルト画像または2枚以上の画像がある場合はファイル名ベースマッチングを使用
          console.log("✅ ファイル名ベースのインテリジェントマッチングを使用");
          if (useDefaultImages) {
            console.log("  理由: デフォルト画像を使用中");
          } else {
            console.log("  理由: 手動アップロード画像が2枚以上");
          }
          setProcessingMessage("ファイル名ベースの画像マッチングを実行中...");
          sections = await parseHtmlWithFilenameMatching(
            articleHtml,
            baseImageMap,
            promptStyle,
            (msg) => setProcessingMessage(msg)
          );
        } else {
          // 1枚の場合または無効化されている場合は従来の均等分散
          console.log("📦 従来の均等分散方式を使用");
          console.log(
            "  理由:",
            !useIntelligentMatching ? "トグルがオフ" : "画像が1枚のみ"
          );
          sections = parseHtmlSimple(articleHtml, baseImageMap, promptStyle);
        }

        setH2Sections(sections);
        setProcessingMessage("");
        setProcessingStartTime(Date.now()); // 処理開始時刻を記録
        setAppState(AppState.PROCESSING);
      } catch (error) {
        console.error("パース処理エラー:", error);
        // フォールバック：従来のシンプル版を使用
        console.log(
          "⚠️ エラーが発生したため、従来の均等分散方式にフォールバック"
        );
        const sections = parseHtmlSimple(
          articleHtml,
          baseImageMap,
          promptStyle
        );
        setH2Sections(sections);
        setProcessingMessage("");
        setProcessingStartTime(Date.now()); // 処理開始時刻を記録
        setAppState(AppState.PROCESSING);
      }
    } catch (error) {
      console.error("Error processing files:", error);
      alert(
        `Error processing files: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [
    articleHtml,
    baseImages,
    promptStyle,
    allInputsProvided,
    tooManyImages,
    useDefaultImages,
  ]);

  // handleProcessArticle関数をrefに保存
  useEffect(() => {
    processArticleRef.current = handleProcessArticle;
  }, [handleProcessArticle]);

  const handleProcessingComplete = useCallback(
    async (finalSections: H2Section[], logs: ReportLog[]) => {
      setProcessedSections(finalSections);
      setReportLogs(logs);
      setAppState(AppState.REPORT);

      // 画像生成完了をSlackに通知
      try {
        const processingTime = Math.floor(
          (Date.now() - processingStartTime) / 1000
        ); // 秒単位
        const imageCount = finalSections.filter((s) => s.generatedImage).length;
        const keyword =
          articleMetaData.keyword || postConfig.title || "Unknown";

        await slackService.notifyImageGenerationComplete({
          keyword,
          imageCount,
          processingTime,
        });
      } catch (error) {
        console.error("Slack通知エラー:", error);
        // 通知エラーは無視して処理続行
      }
    },
    [processingStartTime, articleMetaData.keyword, postConfig.title]
  );

  // 戻るボタンのハンドラー
  const handleGoBack = useCallback(() => {
    if (appState === AppState.REPORT) {
      // レポート画面から処理画面に戻る
      setAppState(AppState.PROCESSING);
      // 処理済みデータは保持（再処理可能）
    } else if (appState === AppState.PROCESSING) {
      // 処理中画面から設定画面に戻る
      setAppState(AppState.CONFIG);
      // H2セクションデータをクリア
      setH2Sections([]);
    }
  }, [appState]);

  const renderContent = () => {
    switch (appState) {
      case AppState.CONFIG:
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* HTML Text Area Input */}
              <div className="bg-white p-6 rounded-lg shadow-md flex flex-col h-full">
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100">
                    {articleHtml && articleHtml.trim() !== "" ? (
                      <CheckCircleIcon className="w-8 h-8 text-indigo-600" />
                    ) : (
                      <DocumentTextIcon className="w-8 h-8 text-indigo-600" />
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    Article HTML
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {articleHtml && articleHtml.trim() !== ""
                      ? articleDataFromStorage
                        ? "記事データを自動読み込みしました 🎉"
                        : "HTML content provided."
                      : "Paste your content below."}
                  </p>
                </div>
                <div className="mt-4 flex-grow">
                  <textarea
                    value={articleHtml || ""}
                    onChange={(e) => setArticleHtml(e.target.value)}
                    placeholder="<h2>Title</h2><p>Your article content...</p>"
                    className="w-full h-full min-h-[150px] p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    aria-label="Article HTML Content"
                  />
                </div>
              </div>

              {/* Base Images Upload */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                {defaultImagesAvailable && (
                  <div className="mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={useDefaultImages}
                        onChange={(e) => setUseDefaultImages(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        デフォルト画像を使用する
                        <span className="text-xs text-gray-500 ml-2">
                          （事前に設定された画像セットを使用）
                        </span>
                      </span>
                    </label>
                  </div>
                )}
                {!useDefaultImages && (
                  <FileUpload
                    icon={<PhotoIcon />}
                    title="Base Images"
                    files={baseImages}
                    onFilesUpload={setBaseImages}
                    accept="image/*"
                    multiple
                  />
                )}
                {useDefaultImages && (
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100">
                      <CheckCircleIcon className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">
                      デフォルト画像
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      事前設定された画像セットを使用します
                    </p>
                  </div>
                )}
              </div>
            </div>
            <ConfigForm
              wpConfig={wpConfig}
              setWpConfig={setWpConfig}
              postConfig={postConfig}
              setPostConfig={setPostConfig}
              promptStyle={promptStyle}
              setPromptStyle={setPromptStyle}
            />

            {/* インテリジェントマッチング設定 */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                🤖 画像マッチング設定
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    ファイル名ベースマッチング
                    {baseImages.length < 2 && (
                      <span className="text-orange-500 ml-2">
                        （2枚以上の画像が必要）
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ファイル名のキーワードを基に、H2内容に最適な画像を自動選択します
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useIntelligentMatching && baseImages.length >= 2}
                    disabled={baseImages.length < 2}
                    onChange={(e) =>
                      setUseIntelligentMatching(e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                </label>
              </div>
              {processingMessage && (
                <div className="mt-3 p-2 bg-blue-50 rounded text-sm text-blue-700">
                  {processingMessage}
                </div>
              )}
            </div>
            <div className="text-center">
              <button
                onClick={handleProcessArticle}
                disabled={!allInputsProvided || tooManyImages}
                className="inline-flex items-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Process Article <ArrowRightIcon className="ml-2" />
              </button>
              {tooManyImages && (
                <p className="mt-2 text-sm text-red-600">
                  画像は最大10枚までアップロード可能です。現在
                  {baseImages.length}枚がアップロードされています。
                </p>
              )}
            </div>
          </div>
        );
      case AppState.PROCESSING:
        return (
          <div className="space-y-6">
            {/* 戻るボタン */}
            <div className="flex justify-between items-center">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white font-medium rounded-lg shadow hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                設定に戻る
              </button>
            </div>
            <ProcessingView
              sections={h2Sections}
              onComplete={handleProcessingComplete}
              availableImages={Array.from(baseImageMap.entries()).map(
                ([name, base64]) => ({
                  name,
                  base64,
                })
              )}
              autoExecute={autoExecuteRef.current}
            />
          </div>
        );
      case AppState.REPORT:
        return (
          <div className="space-y-6">
            {/* 戻るボタン */}
            <div className="flex justify-between items-center">
              <button
                onClick={handleGoBack}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white font-medium rounded-lg shadow hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Processing Article Sectionsに戻る
              </button>
              <div className="text-sm text-gray-500">
                ※ 生成済みの画像データは保持されます（再処理可能）
              </div>
            </div>
            <ReportView
              logs={reportLogs}
              sections={processedSections}
              articleHtml={articleHtml}
              postConfig={postConfig}
              wpConfig={wpConfig}
              metaData={articleMetaData}
              autoExecute={autoExecuteRef.current}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            AI Article Imager for WordPress
          </h1>
          <p className="mt-1 text-gray-500">
            Automate generating and inserting contextual images into your
            articles.
          </p>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>
      <footer className="text-center py-4 text-sm text-gray-500">
        <p>Built by a world-class senior frontend React engineer.</p>
      </footer>

      {/* Slack通知テストボタン（開発用） */}
      <TestSlackButton />
    </div>
  );
};

export default App;
