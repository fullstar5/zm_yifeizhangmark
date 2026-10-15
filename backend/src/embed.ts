import OpenAI from "openai";
import { HttpError } from "./types.js";

const MODEL = "liquid/lfm-2.5-embedding-350m:free";
const DIMENSIONS = 1024;
const MAX_BODY_TOKENS = 480;

let client: OpenAI | null = null;
let cachedKey = "";

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(502, "未配置 OPENROUTER_API_KEY");
  }
  if (!client || cachedKey !== apiKey) {
    cachedKey = apiKey;
    client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Kanban Board",
      },
      fetch: (input, init) => globalThis.fetch(input, init),
    });
  }
  return client;
}

function truncateToTokens(text: string, maxTokens: number): string {
  let tokens = 0;
  let result = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const next = tokens + (code > 0x2e80 ? 1 : 0.25);
    if (next > maxTokens) break;
    tokens = next;
    result += ch;
  }
  return result;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    throw new HttpError(502, "嵌入服务返回了空向量");
  }
  return vector.map((value) => value / norm);
}

async function embed(text: string): Promise<number[]> {
  try {
    const response = await getClient().embeddings.create({
      model: MODEL,
      input: text,
      encoding_format: "float",
    });
    const vector = response.data[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== DIMENSIONS) {
      throw new HttpError(502, "嵌入服务返回的向量维度不正确");
    }
    return normalize(vector);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof OpenAI.APIError) {
      throw new HttpError(502, `嵌入服务失败：${error.message}`);
    }
    throw new HttpError(502, "嵌入服务失败");
  }
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export function documentInput(title: string, description: string): string {
  const body = truncateToTokens(`${title}\n${description}`.trim(), MAX_BODY_TOKENS);
  return `document: ${body}`;
}

export function queryInput(query: string): string {
  return `query: ${truncateToTokens(query.trim(), MAX_BODY_TOKENS)}`;
}

export function embedDocument(title: string, description: string): Promise<number[]> {
  return embed(documentInput(title, description));
}

export function embedQuery(query: string): Promise<number[]> {
  return embed(queryInput(query));
}
