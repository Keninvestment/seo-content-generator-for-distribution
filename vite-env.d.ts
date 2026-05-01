/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_ORG_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_IMAGE_AGENT_URL?: string;
  readonly VITE_MAIN_APP_URL?: string;
  readonly VITE_SLACK_WEBHOOK_URL?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
