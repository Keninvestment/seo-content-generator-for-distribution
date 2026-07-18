import React, { useState } from 'react';
import { slackService } from '../services/slackService';

export const TestSlackButton: React.FC = () => {
  const [isTestingImage, setIsTestingImage] = useState(false);
  const [isTestingWP, setIsTestingWP] = useState(false);

  const testImageNotification = async () => {
    setIsTestingImage(true);
    try {
      await slackService.notifyImageGenerationComplete({
        keyword: 'テストキーワード',
        imageCount: 3,
        processingTime: 45
      });
      alert('✅ 画像生成完了通知を送信しました！Slackを確認してください。');
    } catch (error) {
      alert('❌ エラー: ' + (error as Error).message);
    } finally {
      setIsTestingImage(false);
    }
  };

  const testWPNotification = async () => {
    setIsTestingWP(true);
    try {
      await slackService.notifyWordPressPostComplete({
        title: 'テスト記事タイトル',
        postUrl: 'https://example.com/test-post',
        imageCount: 5,
        status: 'draft',
        metaDescription: 'これはテスト用のメタディスクリプションです。SEO対策に重要な説明文を160文字以内で記載します。',
        slug: 'test-post-slug'
      });
      alert('✅ WordPress投稿完了通知を送信しました！Slackを確認してください。');
    } catch (error) {
      alert('❌ エラー: ' + (error as Error).message);
    } finally {
      setIsTestingWP(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 space-y-2">
      <button
        onClick={testImageNotification}
        disabled={isTestingImage}
        className="block px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 text-sm"
      >
        {isTestingImage ? 'テスト中...' : '🎨 画像通知テスト'}
      </button>
      <button
        onClick={testWPNotification}
        disabled={isTestingWP}
        className="block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-sm"
      >
        {isTestingWP ? 'テスト中...' : '📝 WP通知テスト'}
      </button>
    </div>
  );
};