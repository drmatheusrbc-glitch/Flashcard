import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no ambiente do servidor. Configure-a em Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

export interface MultimodalInputPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
  text?: string;
}

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('TIMEOUT')
  );
}

function isModelNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('is not found');
}

export function formatAiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand') || raw.includes('TIMEOUT')) {
    return 'Os servidores de IA estão temporariamente lentos ou com alta demanda. Tentamos automaticamente o modelo alternativo, mas a instabilidade persiste. Aguarde alguns segundos e clique em "Tentar novamente".';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Limite de requisições atingido temporariamente (erro 429). Aguarde um momento e tente novamente.';
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return 'Erro de autenticação com a API Gemini. Verifique a chave configurada em Settings > Secrets.';
  }
  return raw;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT: model response exceeded limit')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 1500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientError(error)) {
        const jitter = Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1) + jitter));
        continue;
      }
      if (attempt < retries && !isModelNotFoundError(error)) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

export async function generateWithFallback(
  params: Omit<GenerateContentParameters, 'model'> & { model?: string },
  timeoutMs = 45000
): Promise<GenerateContentResponse> {
  const ai = getGeminiClient();
  const primary = params.model || DEFAULT_MODEL;
  const candidates = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const isLastCandidate = i === candidates.length - 1;
    try {
      const config = params.config ? { ...params.config } : undefined;
      if (config && model !== 'gemini-3.8-flash' && 'thinkingConfig' in config) {
        delete config.thinkingConfig;
      }

      return await withRetry(
        () =>
          withTimeout(
            ai.models.generateContent({
              ...params,
              model,
              config,
            }),
            timeoutMs
          ),
        isLastCandidate ? 1 : 0,
        1200
      );
    } catch (error) {
      lastError = error;
      if (isTransientError(error) || isModelNotFoundError(error)) {
        continue;
      }
      throw new Error(formatAiError(error));
    }
  }

  throw new Error(formatAiError(lastError));
}
