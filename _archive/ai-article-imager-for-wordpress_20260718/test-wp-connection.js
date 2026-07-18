#!/usr/bin/env node

/**
 * WordPress接続テストスクリプト
 * .envファイルから読み込んだ認証情報でWordPress REST APIへの接続をテストします
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 親ディレクトリの.envを読み込み
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 環境変数から認証情報を取得
const WP_BASE_URL = process.env.WP_BASE_URL || process.env.VITE_WP_BASE_URL;
const WP_USERNAME = process.env.WP_USERNAME || process.env.VITE_WP_USERNAME;
const WP_APP_PASSWORD =
  process.env.WP_APP_PASSWORD || process.env.VITE_WP_APP_PASSWORD;

console.log('=== WordPress接続テスト ===\n');

// 認証情報の確認
console.log('1. 環境変数チェック:');
console.log(`   - Base URL: ${WP_BASE_URL ? '✅ 設定済み' : '❌ 未設定'} ${WP_BASE_URL || ''}`);
console.log(`   - Username: ${WP_USERNAME ? '✅ 設定済み' : '❌ 未設定'} ${WP_USERNAME || ''}`);
console.log(`   - App Password: ${WP_APP_PASSWORD ? '✅ 設定済み' : '❌ 未設定'} (${WP_APP_PASSWORD ? '***表示省略***' : ''})`);

if (!WP_BASE_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
    console.error('\n❌ エラー: 必要な環境変数が設定されていません');
    process.exit(1);
}

// Basic認証ヘッダーの作成
const authString = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const headers = {
    'Authorization': `Basic ${authString}`,
    'Content-Type': 'application/json'
};

console.log('\n2. API接続テスト開始...\n');

// 1. ユーザー情報の取得（認証確認）
async function testUserAuth() {
    console.log('📋 認証テスト: /wp-json/wp/v2/users/me');
    try {
        const response = await fetch(`${WP_BASE_URL}wp-json/wp/v2/users/me`, {
            headers: headers
        });
        
        if (response.ok) {
            const user = await response.json();
            console.log(`   ✅ 認証成功: ${user.name} (ID: ${user.id})`);
            console.log(`   - ユーザー名: ${user.slug}`);
            console.log(`   - 権限: ${user.roles ? user.roles.join(', ') : 'N/A'}`);
            return true;
        } else {
            console.log(`   ❌ 認証失敗: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log(`   エラー詳細: ${text}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ 接続エラー: ${error.message}`);
        return false;
    }
}

// 2. 投稿一覧の取得（読み取り権限確認）
async function testPostsRead() {
    console.log('\n📄 投稿読み取りテスト: /wp-json/wp/v2/posts');
    try {
        const response = await fetch(`${WP_BASE_URL}wp-json/wp/v2/posts?per_page=3`, {
            headers: headers
        });
        
        if (response.ok) {
            const posts = await response.json();
            console.log(`   ✅ 投稿一覧取得成功: ${posts.length}件`);
            posts.forEach((post, index) => {
                console.log(`   ${index + 1}. "${post.title.rendered}" (ID: ${post.id})`);
            });
            return true;
        } else {
            console.log(`   ❌ 取得失敗: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ エラー: ${error.message}`);
        return false;
    }
}

// 3. メディアライブラリの確認（アップロード権限確認）
async function testMediaLibrary() {
    console.log('\n🖼️ メディアライブラリテスト: /wp-json/wp/v2/media');
    try {
        const response = await fetch(`${WP_BASE_URL}wp-json/wp/v2/media?per_page=3`, {
            headers: headers
        });
        
        if (response.ok) {
            const media = await response.json();
            console.log(`   ✅ メディア一覧取得成功: ${media.length}件`);
            media.forEach((item, index) => {
                console.log(`   ${index + 1}. "${item.title.rendered}" (ID: ${item.id}, Type: ${item.mime_type})`);
            });
            return true;
        } else {
            console.log(`   ❌ 取得失敗: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ エラー: ${error.message}`);
        return false;
    }
}

// 4. テスト投稿の作成（書き込み権限確認）
async function testPostCreate() {
    console.log('\n✍️ 投稿作成テスト: /wp-json/wp/v2/posts');
    
    const testPost = {
        title: `テスト投稿 - ${new Date().toLocaleString('ja-JP')}`,
        content: '<p>これはWordPress REST API接続テストのための投稿です。</p>',
        status: 'draft', // 下書きとして作成
        meta_description: 'テスト投稿のメタディスクリプション'
    };
    
    try {
        const response = await fetch(`${WP_BASE_URL}wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(testPost)
        });
        
        if (response.ok) {
            const post = await response.json();
            console.log(`   ✅ 投稿作成成功:`);
            console.log(`   - ID: ${post.id}`);
            console.log(`   - タイトル: ${post.title.rendered}`);
            console.log(`   - ステータス: ${post.status}`);
            console.log(`   - URL: ${post.link}`);
            
            // 作成した投稿を削除（クリーンアップ）
            console.log('\n   🗑️ テスト投稿を削除中...');
            const deleteResponse = await fetch(`${WP_BASE_URL}wp-json/wp/v2/posts/${post.id}`, {
                method: 'DELETE',
                headers: headers
            });
            
            if (deleteResponse.ok) {
                console.log('   ✅ テスト投稿を削除しました');
            } else {
                console.log('   ⚠️ テスト投稿の削除に失敗しました（手動で削除してください）');
            }
            
            return true;
        } else {
            console.log(`   ❌ 作成失敗: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log(`   エラー詳細: ${text}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ エラー: ${error.message}`);
        return false;
    }
}

// すべてのテストを実行
async function runAllTests() {
    console.log('テストを実行中...\n');
    
    const results = {
        auth: await testUserAuth(),
        read: await testPostsRead(),
        media: await testMediaLibrary(),
        write: await testPostCreate()
    };
    
    console.log('\n=== テスト結果サマリー ===');
    console.log(`認証: ${results.auth ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`投稿読み取り: ${results.read ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`メディア読み取り: ${results.media ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`投稿作成: ${results.write ? '✅ 成功' : '❌ 失敗'}`);
    
    const allPassed = Object.values(results).every(r => r === true);
    
    if (allPassed) {
        console.log('\n🎉 すべてのテストが成功しました！');
        console.log('WordPress REST APIへの接続と認証が正常に動作しています。');
    } else {
        console.log('\n⚠️ 一部のテストが失敗しました。');
        console.log('環境変数と権限設定を確認してください。');
    }
}

// メイン実行
runAllTests().catch(error => {
    console.error('テスト実行中にエラーが発生しました:', error);
    process.exit(1);
});