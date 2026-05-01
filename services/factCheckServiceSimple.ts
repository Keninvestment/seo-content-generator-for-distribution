/**
 * 簡易版ファクトチェックサービス
 * 既存のマルチエージェントとarticleRevisionServiceを活用
 */

import { MultiAgentOrchestrator } from './finalProofreadingAgents/MultiAgentOrchestrator';
import { reviseBatchIssues, insertSourcesAfterRevision } from './articleRevisionService';
import type { Issue } from './finalProofreadingAgents/types';

export interface FactCheckResult {
  originalText: string;
  correctedText: string;
  score: number;
  issues: Array<{
    type: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  sourceInsertions: Array<{
    url: string;
    title: string;
    location?: string;
  }>;
}

/**
 * テキストのファクトチェックを実行
 * @param text チェック対象のテキスト
 * @returns ファクトチェック結果
 */
export interface FactCheckOptions {
  includeCompanyCheck?: boolean;  // 自社サービスチェックを含めるか
}

export async function performFactCheck(text: string, options: FactCheckOptions = {}): Promise<FactCheckResult> {
  console.log('🔍 === ファクトチェック開始 ===');
  console.log(`📝 入力文字数: ${text.length}文字`);
  console.log(`🏢 自社サービスチェック: ${options.includeCompanyCheck ? '有効' : '無効'}`);

  // Step 1: マルチエージェントでチェック
  console.log('📊 Step 1: マルチエージェントによるチェック...');

  const orchestrator = new MultiAgentOrchestrator({
    enableLegalCheck: false, // 法令チェックは省略
    parallel: true,
    disableCompanyAgent: !options.includeCompanyCheck, // オプションに基づいて自社サービスエージェントを制御
    onProgress: (message, progress) => {
      console.log(`  進捗 ${progress}%: ${message}`);
    }
  });

  const checkResult = await orchestrator.execute(text);
  console.log(`✅ チェック完了 - スコア: ${checkResult.overallScore}点`);

  // 問題点を収集
  const issues: FactCheckResult['issues'] = [];
  const sourceInsertions: FactCheckResult['sourceInsertions'] = [];
  // 修正用の詳細情報も保持
  const detailedIssues: any[] = [];

  // 各エージェントの結果から問題点を抽出
  for (const agentResult of checkResult.agentResults) {
    if (agentResult.issues) {
      for (const issue of agentResult.issues) {
        const displaySeverity =
          issue.severity === 'info' ? 'minor' : issue.severity;
        issues.push({
          type: agentResult.agentName,
          description: issue.description || '',
          severity: displaySeverity as 'critical' | 'major' | 'minor',
        });
        // 詳細情報も保存（suggestion, originalなど）
        detailedIssues.push({
          ...issue,
          agentName: agentResult.agentName
        });
      }
    }

    // 出典情報を収集（複数のエージェントから収集）
    if (agentResult.agentName === '出典検索エージェント' || agentResult.agentName === 'SourceEnhancementAgent') {
      // verified_urlsがある場合（出典検索エージェント）
      if ((agentResult as any).verified_urls) {
        for (const verifiedUrl of (agentResult as any).verified_urls) {
          if (verifiedUrl.url && verifiedUrl.title) {
            sourceInsertions.push({
              url: verifiedUrl.url,
              title: verifiedUrl.title,
              location: verifiedUrl.location || verifiedUrl.h2 || ''
            });
          }
        }
      }

      // suggestionsがある場合（両エージェント共通）
      if (agentResult.suggestions) {
        for (const suggestion of agentResult.suggestions) {
          if ((suggestion as any).url && (suggestion as any).title) {
            // 重複チェック
            const isDuplicate = sourceInsertions.some(
              si => si.url === (suggestion as any).url
            );
            if (!isDuplicate) {
              sourceInsertions.push({
                url: (suggestion as any).url,
                title: (suggestion as any).title,
                location: (suggestion as any).location || ''
              });
            }
          }
        }
      }
    }
  }

  // Step 2: 修正が必要な場合はGemini 2.5 Proで修正案を生成
  let correctedText = text;

  if (checkResult.overallScore < 80 && issues.length > 0) {
    console.log('📝 Step 2: 修正案の生成...');

    try {
      // デバッグ: 詳細情報を確認
      console.log('🔍 詳細な問題情報:');
      detailedIssues.forEach((issue, idx) => {
        console.log(`  問題${idx + 1}:`, {
          description: issue.description,
          original: issue.original,
          suggestion: issue.suggestion,
          severity: issue.severity,
          confidence: issue.confidence
        });
      });

      // reviseBatchIssuesの正しいパラメータ形式
      // reviseBatchIssuesは文字列を返す
      correctedText = await reviseBatchIssues({
        originalArticle: text,
        issues: detailedIssues.map(
          (issue): Issue => ({
            type: 'factual-error',
            severity:
              issue.severity === 'info' ? 'minor' : issue.severity,
            location:
              typeof issue.location === 'string'
                ? issue.location
                : (issue.location as { sectionHeading?: string } | undefined)
                    ?.sectionHeading ?? '',
            description: issue.description || '',
            original: issue.original || '',
            suggestion: issue.suggestion || '修正が必要です',
            confidence:
              typeof issue.confidence === 'number'
                ? issue.confidence > 1
                  ? issue.confidence / 100
                  : issue.confidence
                : 0.5,
            agentName: issue.agentName,
          })
        ),
        category: 'major',  // majorカテゴリーとして処理
        sourceInsertions: sourceInsertions.map(source => ({
          heading: source.location || '',
          h2: source.location || '',
          h3: '',
          url: source.url,
          title: source.title,
        })),
        // 手動ファクトチェック専用フラグ
        isManualFactCheck: true
      });

      console.log('✅ 修正案生成完了');

    } catch (error) {
      console.error('⚠️ 修正案生成エラー:', error);
      // エラーが発生しても元のテキストを返す
    }
  } else if (sourceInsertions.length > 0) {
    // スコアが高くても出典挿入が必要な場合
    console.log('📝 Step 2: 出典の挿入...');

    try {
      // 出典挿入データの形式を整える
      const formattedInsertions = sourceInsertions.map(source => ({
        heading: source.location || '',
        h2: source.location || '',
        h3: '',
        url: source.url,
        title: source.title,
      }));

      // 出典を挿入
      correctedText = await insertSourcesAfterRevision(
        text,
        formattedInsertions
      );

      console.log('✅ 出典挿入完了');
    } catch (error) {
      console.error('⚠️ 出典挿入エラー:', error);
    }
  }

  console.log('🎯 === ファクトチェック完了 ===');
  console.log(`  最終スコア: ${checkResult.overallScore}点`);
  console.log(`  検出された問題: ${issues.length}件`);
  console.log(`  追加された出典: ${sourceInsertions.length}件`);

  return {
    originalText: text,
    correctedText,
    score: checkResult.overallScore,
    issues,
    sourceInsertions
  };
}