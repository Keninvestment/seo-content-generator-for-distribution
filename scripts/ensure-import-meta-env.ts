/**
 * tsx / Node で services/*.ts を import する前提の import.meta.env 補完（Vite 非経由）。
 * orchestrator CLI より先に import すること。
 */

const im = import.meta as unknown as { env?: Record<string, string> };
if (!im.env) {
  im.env = {
    VITE_GEMINI_API_KEY:
      process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
    VITE_API_URL: process.env.VITE_API_URL || "",
    VITE_INTERNAL_API_KEY: process.env.VITE_INTERNAL_API_KEY || "",
    VITE_SERVICE_NAME: process.env.VITE_SERVICE_NAME || "",
  };
}
