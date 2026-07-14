export const GEMINI_FLASH_MODEL =
  process.env.SEO_GEMINI_FLASH_MODEL || "gemini-3.5-flash";
export const GEMINI_PRO_MODEL =
  process.env.SEO_GEMINI_PRO_MODEL || "gemini-3.5-flash";
export const REVIEW_LIGHT_MODEL =
  process.env.SEO_REVIEW_LIGHT_MODEL || "gpt-5.6-luna";
export const REVIEW_HEAVY_MODEL =
  process.env.SEO_REVIEW_HEAVY_MODEL || "gpt-5.6-terra";

export function geminiThinkingConfig(model: string): Record<string, unknown> {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: "minimal" }; // gemini-3系
}
