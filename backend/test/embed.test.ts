import { afterEach, describe, expect, it, vi } from "vitest";
import { documentInput, embedDocument, embedQuery, queryInput } from "../src/embed.js";

const originalKey = process.env.OPENROUTER_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("嵌入文本", () => {
  it("给卡片和搜索词加上不同前缀，并截断过长正文", () => {
    expect(documentInput("Fix login", "Users cannot authenticate")).toBe(
      "document: Fix login\nUsers cannot authenticate",
    );
    expect(queryInput("cannot sign in")).toBe("query: cannot sign in");

    const longBody = "a".repeat(3000);
    const document = documentInput("Title", longBody);
    expect(document.startsWith("document: Title\n")).toBe(true);
    expect(document.length).toBeLessThan(`document: Title\n${longBody}`.length);

    const cjk = "登".repeat(500);
    expect([...queryInput(cjk)].length).toBe("query: ".length + 480);
  });
});

describe("OpenRouter 请求", () => {
  it("没有 API Key 时直接失败，不发出请求", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(embedDocument("Fix login", "details")).rejects.toThrow("未配置 OPENROUTER_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("把模型名和 document 前缀发给 OpenRouter，并归一化 1024 维向量", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("liquid/lfm-2.5-embedding-350m:free");
      expect(body.input).toBe("document: Fix login\nUsers cannot authenticate");
      const embedding = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 4 : 0));
      return new Response(
        JSON.stringify({ data: [{ embedding, index: 0 }], model: body.model }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const vector = await embedDocument("Fix login", "Users cannot authenticate");
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://openrouter.ai/api/v1/embeddings");
    expect(vector).toHaveLength(1024);
    expect(vector[0]).toBeCloseTo(1);
    expect(vector[1]).toBeCloseTo(0);
  });

  it("搜索使用 query 前缀", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.input).toBe("query: cannot sign in");
      const embedding = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0));
      return new Response(JSON.stringify({ data: [{ embedding, index: 0 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await embedQuery("cannot sign in");
  });

  it("维度不对或服务报错时返回 502", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3], index: 0 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    await expect(embedQuery("hello")).rejects.toThrow("向量维度不正确");

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    await expect(embedQuery("hello")).rejects.toThrow("嵌入服务失败");
  });
});
