// マルチエージェント オーケストレーター
import { ProperNounsAgent } from "./ProperNounsAgent";
import { NumbersStatsAgent } from "./NumbersStatsAgent";
import { DatesTimelineAgent } from "./DatesTimelineAgent";
import { FactsCasesAgent } from "./FactsCasesAgent";
import { CompanyAgent } from "./CompanyAgent";
import { CitationsAgent } from "./CitationsAgent";
import { TechnicalAgent } from "./TechnicalAgent";
import { LegalAgent } from "./LegalAgent";
import { SourceRequirementAgent } from "./SourceRequirementAgent";
import { SourceEnhancementAgent } from "./SourceEnhancementAgent";
import { IntegrationAgent } from "./IntegrationAgent";
import type { AgentResult, IntegrationResult } from "./types";
// latestAIModelsは汎用化のため削除

export interface MultiAgentConfig {
  enableLegalCheck?: boolean; // 法令チェックを実行するか
  disableCompanyAgent?: boolean; // 自社サービスエージェントを無効化（ファクトチェック用）
  timeout?: number; // 各エージェントのタイムアウト（ミリ秒）
  parallel?: boolean; // 並列実行するか
  onProgress?: (message: string, progress: number) => void;
  /** 税務・投資記事向けに各エージェントのプロンプトを補強 */
  domainVertical?: "general" | "ken-tax-invest";
}

export class MultiAgentOrchestrator {
  private phaseOneAgents: any[] = [];
  private phaseTwoAgents: any[] = [];
  private integrationAgent: IntegrationAgent;

  constructor(private config: MultiAgentConfig = {}) {
    // フェーズ1：検証エージェント（並列実行）
    this.phaseOneAgents = [
      new ProperNounsAgent(), // 固有名詞
      new NumbersStatsAgent(), // 数値・統計
      new DatesTimelineAgent(), // 日付・時系列
      new FactsCasesAgent(), // 事例・ファクト
      new TechnicalAgent(), // 技術仕様
    ];

    // 自社サービスエージェント（記事執筆時のみ）
    if (!config.disableCompanyAgent) {
      this.phaseOneAgents.push(new CompanyAgent());
    }

    // オプション：法令チェック
    if (config.enableLegalCheck) {
      this.phaseOneAgents.push(new LegalAgent());
    }

    // フェーズ2：出典処理エージェント（順次実行）
    this.phaseTwoAgents = [
      new SourceRequirementAgent(), // 出典必要性判定
      new SourceEnhancementAgent(), // 出典検索
      new CitationsAgent(), // 出典検証
    ];

    this.integrationAgent = new IntegrationAgent();
  }

  async execute(content: string, context?: any): Promise<IntegrationResult> {
    console.log("🤖 マルチエージェント校閲開始（フェーズ分け処理）");
    console.log("📊 デバッグ情報:");
    console.log("  - コンテンツ長:", content.length);
    console.log("  - フェーズ1エージェント数:", this.phaseOneAgents.length);
    console.log("  - フェーズ2エージェント数:", this.phaseTwoAgents.length);
    console.log("  - 設定:", this.config);

    const mergedContext = {
      ...(context ?? {}),
      domainVertical:
        context?.domainVertical ??
        this.config.domainVertical ??
        "general",
      keyword: context?.keyword,
    };

    const startTime = Date.now();

    try {
      // フェーズ1: 検証エージェント（並列実行）
      console.log("📋 フェーズ1: 基礎検証開始");
      console.log("📋 フェーズ1エージェント一覧:");
      this.phaseOneAgents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} (${agent.type})`);
      });

      const phaseOneResults = await this.executePhaseOne(content, mergedContext);
      console.log(
        `✅ フェーズ1完了: ${phaseOneResults.length}個のエージェント実行`
      );

      // フェーズ1の結果詳細をログ出力
      phaseOneResults.forEach((result, index) => {
        console.log(
          `  ${index + 1}. ${result.agentName}: ${result.status} (${
            result.executionTime
          }ms, スコア: ${result.score})`
        );
      });

      // フェーズ1の結果を構造化
      const phaseOneContext = this.structurePhaseOneResults(phaseOneResults);

      // フェーズ2: 出典処理（順次実行）
      console.log("📚 フェーズ2: 出典処理開始");
      console.log("📚 フェーズ2エージェント一覧:");
      this.phaseTwoAgents.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.name} (${agent.type})`);
      });

      const phaseTwoResults = await this.executePhaseTwo(content, {
        ...mergedContext,
        phaseOneResults: phaseOneContext,
      });
      console.log(
        `✅ フェーズ2完了: ${phaseTwoResults.length}個のエージェント実行`
      );

      // フェーズ2の結果詳細をログ出力
      phaseTwoResults.forEach((result, index) => {
        console.log(
          `  ${index + 1}. ${result.agentName}: ${result.status} (${
            result.executionTime
          }ms, スコア: ${result.score})`
        );
      });

      // 全結果を統合
      const allResults = [...phaseOneResults, ...phaseTwoResults];
      console.log("📊 全エージェント結果統合:");
      console.log(`  - 総エージェント数: ${allResults.length}`);
      console.log(
        `  - 成功: ${allResults.filter((r) => r.status === "success").length}`
      );
      console.log(
        `  - エラー: ${allResults.filter((r) => r.status === "error").length}`
      );
      console.log(
        `  - タイムアウト: ${
          allResults.filter((r) => r.status === "timeout").length
        }`
      );

      // 統合エージェントで結果を統合
      console.log("📊 結果を統合中...");
      const integrationResult = await this.integrationAgent.integrate(
        allResults
      );

      const executionTime = Date.now() - startTime;
      console.log(`✅ マルチエージェント校閲完了（${executionTime}ms）`);
      console.log(`📈 総合スコア: ${integrationResult.overallScore}/100点`);

      return integrationResult;
    } catch (error) {
      console.error("❌ マルチエージェント実行エラー:", error);
      console.error(
        "❌ エラースタック:",
        error instanceof Error ? error.stack : "スタックなし"
      );
      throw error;
    }
  }

  private async executePhaseOne(
    content: string,
    context?: any
  ): Promise<AgentResult[]> {
    console.log("⚡ フェーズ1: 並列実行");
    console.log(`⚡ 実行予定エージェント数: ${this.phaseOneAgents.length}`);

    const promises = this.phaseOneAgents.map((agent, index) => {
      console.log(`⚡ エージェント${index + 1}を開始: ${agent.name}`);
      return this.executeWithTimeout(agent, content, context);
    });

    console.log(`⚡ ${promises.length}個のPromiseを並列実行開始`);
    const results = await Promise.all(promises);
    console.log(`⚡ 並列実行完了: ${results.length}個の結果を取得`);

    return results;
  }

  private async executePhaseTwo(
    content: string,
    context?: any
  ): Promise<AgentResult[]> {
    console.log("📝 フェーズ2: 順次実行");
    const results: AgentResult[] = [];

    // 1. 出典必要性判定
    const requirementAgent = this.phaseTwoAgents[0];
    console.log("🔍 出典必要性を判定中...");
    const requirementResult = await this.executeWithTimeout(
      requirementAgent,
      content,
      context
    );
    results.push(requirementResult);

    // 出典が必要な箇所を抽出（要素番号ベース）
    const requirements = (requirementResult as any).requirements || [];
    const parsedElements = (requirementResult as any).parsedElements || [];

    console.log(`📋 解析済み要素数: ${parsedElements.length}`);
    console.log(`🎯 出典必要箇所: ${requirements.length}`);

    // 2. 出典検索
    const searchAgent = this.phaseTwoAgents[1];
    console.log(`🔎 ${requirements.length}箇所の出典を検索中...`);
    const searchResult = await this.executeWithTimeout(searchAgent, content, {
      ...context,
      requirements,
      parsedElements,
    });
    results.push(searchResult);

    // 3. 出典検証
    const verifyAgent = this.phaseTwoAgents[2];
    console.log("✅ 出典を検証中...");
    const verifyResult = await this.executeWithTimeout(verifyAgent, content, {
      ...context,
      sourceEnhancement: searchResult,
    });
    results.push(verifyResult);

    return results;
  }

  private structurePhaseOneResults(results: AgentResult[]): any {
    // フェーズ1の結果を構造化して返す
    return {
      properNouns:
        results.find((r) => r.agentType === "proper-nouns")?.issues || [],
      numbers:
        results.find((r) => r.agentType === "numbers-stats")?.issues || [],
      dates:
        results.find((r) => r.agentType === "dates-timeline")?.issues || [],
      facts: results.find((r) => r.agentType === "facts-cases")?.issues || [],
      technical: results.find((r) => r.agentType === "technical")?.issues || [],
      legal: results.find((r) => r.agentType === "legal")?.issues || [],
      company: results.find((r) => r.agentType === "company")?.issues || [],
    };
  }

  private async executeWithTimeout(
    agent: any,
    content: string,
    context?: any
  ): Promise<AgentResult> {
    console.log(`🔄 ${agent.name} 実行開始`);
    const startTime = Date.now();

    // BaseAgentと同じタイムアウト設定に統一（出典必要性判定のみ30分維持）
    const timeout = this.getTimeoutForAgentType(agent.type);

    console.log(`⏰ ${agent.name} タイムアウト設定: ${timeout}ms`);

    // 出典検索エージェントの場合、特別な処理
    if (agent.name === "出典検索エージェント") {
      console.log(`🔍 ${agent.name} 部分結果対応モードで実行`);
      return this.executeWithPartialResult(agent, content, context, timeout);
    }

    try {
      const result = await Promise.race([
        agent.execute(content, context),
        new Promise<AgentResult>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`${agent.name}がタイムアウトしました（${timeout}ms）`)
            );
          }, timeout);
        }),
      ]);

      const executionTime = Date.now() - startTime;
      console.log(
        `✅ ${agent.name} 実行完了 (${executionTime}ms, スコア: ${result.score})`
      );
      return result;
    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`⏱️ ${agent.name}: ${err.message} (${executionTime}ms)`);

      if (error && typeof error === "object" && "response" in error) {
        const r = (error as { response?: { data?: unknown } }).response;
        console.error(`API Response Error for ${agent.name}:`, r?.data);
      }
      if (err.stack) {
        console.error(`Stack trace for ${agent.name}:`, err.stack);
      }

      return {
        agentName: agent.name,
        agentType: agent.type,
        executionTime: executionTime,
        score: 0,
        issues: [],
        suggestions: [],
        confidence: 0,
        status: "error",
        error: err.message,
      };
    }
  }

  // 部分的な結果を許可する実行
  private async executeWithPartialResult(
    agent: any,
    content: string,
    context: any,
    timeout: number
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Promise.raceで通常実行とタイムアウトを競争
      const result = await Promise.race([
        agent.execute(content, context),
        new Promise<AgentResult>((resolve) => {
          setTimeout(() => {
            // タイムアウト時、エージェントから部分結果を取得
            const partialResult = agent.getPartialResults
              ? agent.getPartialResults()
              : null;

            if (partialResult && partialResult.completedItems > 0) {
              console.warn(
                `⚠️ ${agent.name}: 30分タイムアウト - 部分成功として処理`
              );
              console.log(
                `✅ ${agent.name}: ${partialResult.completedItems}/${partialResult.totalItems}件の出典を取得（部分成功）`
              );

              resolve({
                agentName: agent.name,
                agentType: agent.type,
                executionTime: timeout,
                score: Math.round(
                  (partialResult.completedItems / partialResult.totalItems) *
                    100
                ),
                issues: partialResult.issues || [],
                suggestions: partialResult.suggestions || [],
                confidence: Math.round(
                  (partialResult.completedItems / partialResult.totalItems) *
                    100
                ),
                status: "partial-success",
                partialData: {
                  completedItems: partialResult.completedItems,
                  totalItems: partialResult.totalItems,
                  message: `${partialResult.completedItems}/${partialResult.totalItems}件の出典を取得（追加検索推奨）`,
                },
                verified_urls: partialResult.verified_urls || [],
              });
            } else {
              // 部分結果がない場合は通常のタイムアウト
              resolve({
                agentName: agent.name,
                agentType: agent.type,
                executionTime: timeout,
                score: 0,
                issues: [],
                suggestions: [],
                confidence: 0,
                status: "timeout",
                error: `${agent.name}がタイムアウトしました（${timeout}ms）`,
              });
            }
          }, timeout);
        }),
      ]);

      return result;
    } catch (error: any) {
      console.error(`❌ ${agent.name}: エラー発生`, error);
      return {
        agentName: agent.name,
        agentType: agent.type,
        executionTime: Date.now() - startTime,
        score: 0,
        issues: [],
        suggestions: [],
        confidence: 0,
        status: "error",
        error: error.message,
      };
    }
  }

  // BaseAgentと同じタイムアウト設定（出典必要性判定のみ30分維持）
  private getTimeoutForAgentType(type: string): number {
    switch (type) {
      // 出典必要性判定は30分維持（現状通り）
      case "source-requirement":
        return 1800000; // 30分

      // 以下はBaseAgentと同じ値
      case "source-enhancement":
        return 2400000; // 40分
      case "legal":
      case "facts-cases":
      case "technical":
        return 1200000; // 20分
      case "proper-nouns":
      case "numbers-stats":
        return 900000; // 15分
      case "dates-timeline":
        return 720000; // 12分
      case "citations":
      case "company":
        return 600000; // 10分
      default:
        return 900000; // 15分（安全マージン）
    }
  }

  // 設定を動的に変更
  updateConfig(config: Partial<MultiAgentConfig>) {
    this.config = { ...this.config, ...config };
  }
}
