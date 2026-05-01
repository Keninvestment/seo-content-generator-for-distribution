/**
 * Supabase Client
 *
 * 一次情報DB（Supabase）との接続管理
 *
 * テーブル構造:
 * - sources: ソース文書の管理
 * - documents: ドキュメント（セクション単位）
 * - chunks: 実際のコンテンツ（文単位、全文検索用）
 * - vectors: ベクトル埋め込み（将来的なセマンティック検索用）
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 型定義
export interface Source {
  id: string;
  title: string;
  source_type: 'pdf' | 'video' | 'web' | 'internal';
  url: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

export interface Document {
  id: string;
  source_id: string;
  title: string;
  content: string;
  page_number: number | null;
  section_number: number | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

export interface Chunk {
  chunk_id: string; // 実際のDBカラム名
  doc_id: string;
  source_id: string;
  sentence: string;
  tsv: any; // PostgreSQL tsvector type
  category: string | null;
  tags: string[] | null;
  chunk_ord: number;
  updated_at: string;
  source_type: string | null;
  date: string | null;
  source_ref_url: string | null; // note URLなどの出典URL
}

export interface ChunkWithSource extends Chunk {
  document: Document & { source?: Source | null };
}

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: Source;
        Insert: Omit<Source, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>;
      };
      documents: {
        Row: Document;
        Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Document, 'id' | 'created_at' | 'updated_at'>>;
      };
      chunks: {
        Row: Chunk; // Chunkにsource_ref_urlが含まれているので自動的に反映される
        Insert: Omit<Chunk, 'chunk_id' | 'updated_at'>;
        Update: Partial<Omit<Chunk, 'chunk_id' | 'updated_at'>>;
      };
    };
  };
}

/**
 * Supabaseクライアントを初期化
 * 環境変数からURL・Keyを取得
 */
function createSupabaseClient(): SupabaseClient<Database> | null {
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

  // 環境変数が設定されていない場合はnullを返す（エラーハンドリング用）
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] 環境変数が設定されていません。Supabase機能は無効化されます。');
    console.warn('[Supabase] 必要な環境変数: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
    return null;
  }

  try {
    const client = createClient<Database>(supabaseUrl, supabaseAnonKey);
    console.log('[Supabase] クライアント初期化成功');
    return client;
  } catch (error) {
    console.error('[Supabase] クライアント初期化エラー:', error);
    return null;
  }
}

// シングルトンインスタンス
let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Supabaseクライアントインスタンスを取得
 * シングルトンパターンで1つのインスタンスを共有
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient();
  }
  return supabaseInstance;
}

/**
 * Supabaseが利用可能かチェック
 */
export function isSupabaseAvailable(): boolean {
  const client = getSupabaseClient();
  return client !== null;
}

/**
 * 接続テスト用ヘルパー関数
 */
export async function testSupabaseConnection(): Promise<boolean> {
  const client = getSupabaseClient();

  if (!client) {
    console.error('[Supabase] クライアントが初期化されていません');
    return false;
  }

  try {
    // sourcesテーブルから1件取得してみる
    const { data, error } = await client
      .from('sources')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[Supabase] 接続テスト失敗:', error);
      return false;
    }

    console.log('[Supabase] 接続テスト成功');
    return true;
  } catch (error) {
    console.error('[Supabase] 接続テスト例外:', error);
    return false;
  }
}
