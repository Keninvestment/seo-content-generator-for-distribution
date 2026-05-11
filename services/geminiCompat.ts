import { GoogleGenAI, Type } from "@google/genai";
import type {
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAIOptions,
  Tool,
} from "@google/genai";

type LegacyGenerationConfig = GenerateContentConfig & {
  responseMimeType?: string;
  responseSchema?: unknown;
};

type LegacyModelConfig = {
  model: string;
  generationConfig?: LegacyGenerationConfig;
  tools?: Tool[];
  safetySettings?: GenerateContentConfig["safetySettings"];
  systemInstruction?: GenerateContentConfig["systemInstruction"];
  toolConfig?: GenerateContentConfig["toolConfig"];
};

type LegacyGenerateContentResult = {
  response: GenerateContentResponse & { text: () => string };
};

export const SchemaType = Type;

function normalizeTools(tools: Tool[] | undefined): Tool[] | undefined {
  if (!tools) return undefined;
  return tools;
}

function legacyResponse(response: GenerateContentResponse): LegacyGenerateContentResult {
  const responseWithText = response as GenerateContentResponse & { text: () => string };
  const raw = (response as unknown as { text?: string }).text ?? "";
  Object.defineProperty(responseWithText, "text", {
    configurable: true,
    value: () => raw,
  });
  return { response: responseWithText };
}

export class GoogleGenerativeAI {
  private readonly client: GoogleGenAI;

  constructor(apiKeyOrOptions: string | GoogleGenAIOptions) {
    this.client =
      typeof apiKeyOrOptions === "string"
        ? new GoogleGenAI({ apiKey: apiKeyOrOptions })
        : new GoogleGenAI(apiKeyOrOptions);
  }

  getGenerativeModel(modelConfig: LegacyModelConfig) {
    const {
      model,
      generationConfig,
      tools,
      safetySettings,
      systemInstruction,
      toolConfig,
    } = modelConfig;
    const baseConfig: GenerateContentConfig = {
      ...(generationConfig ?? {}),
      ...(safetySettings ? { safetySettings } : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(toolConfig ? { toolConfig } : {}),
    };
    const normalizedTools = normalizeTools(tools);
    if (normalizedTools) {
      baseConfig.tools = normalizedTools;
    }

    return {
      generateContent: async (contents: string): Promise<LegacyGenerateContentResult> => {
        const response = await this.client.models.generateContent({
          model,
          contents,
          config: baseConfig,
        });
        return legacyResponse(response);
      },
    };
  }
}
