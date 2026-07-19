
export interface WPConfig {
  base: string;
  user: string;
  app_password: string;
}

export interface PostConfig {
  title: string;
  status: 'draft' | 'publish';
  slug?: string;
}

export interface H2Section {
  id: number;
  h2Text: string;
  altText: string;
  paragraphText: string;
  baseImageName: string | null;
  baseImage: string | null; // base64 data URL
  prompt: string;
  backgroundInstruction: string; // New field for background customization
  status: 'pending' | 'generating' | 'success' | 'error';
  generatedImage: string | null; // base64 data URL
  errorMessage: string | null;
  mediaId: number | null;
  sourceUrl: string | null;
  generationStep: string | null;
}

export enum AppState {
  CONFIG,
  PROCESSING,
  REPORT,
}

export interface ReportLog {
    h2Text: string;
    status: 'success' | 'error' | 'skipped';
    message: string;
    imageUrl?: string;
    mediaId?: number;
}