import type { Express } from "express";
import pg from "pg";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Embedder } from "../src/app.js";
import { HttpError } from "../src/types.js";

const ADMIN_URL = "postgres://board:board@localhost:5432/board";
const TEST_URL = "postgres://board:board@localhost:5432/board_test";

function axis(index: number): number[] {
  return Array.from({ length: 1024 }, (_, current) => (current === index ? 1 : 0));
}

function normalize(values: number[]): number[] {
  const vector = Array.from({ length: 1024 }, (_, index) => values[index] ?? 0);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
}

const embedder: Embedder & { queries: string[] } = {
  queries: [],
  async embedDocument(title: string) {
    if (title === "Fix login failure") return axis(0);
    if (title === "Update billing invoice") return axis(1);
    if (title === "Embedding failed") throw new HttpError(502, "嵌入服务失败：rate limited");
    return axis(2);
  },
  async embedQuery(query: string) {
    this.queries.push(query);
    if (query.includes("sign in")) return axis(0);
    if (query === "borderline-low") return normalize([0.2, 0, Math.sqrt(1 - 0.04)]);
    if (query === "borderline-high") return normalize([0.5, 0, Math.sqrt(0.75)]);
    return axis(3);
  },
};

describe("看板 API", () => {
  let app: Express;
  let realApp: Express;
  let db: pg.Pool;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    try {
      await admin.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new Error(`测试数据库连不上。先在仓库根目录执行 docker compose up -d。${message}`);
    }
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'board_test'");
    if (existing.rowCount === 0) {
      await admin.query("CREATE DATABASE board_test");
    }
    await admin.end();

    process.env.DATABASE_URL = TEST_URL;
    const database = await import("../src/db.js");
    await database.initDb();
    const { createApp } = await import("../src/app.js");
    app = createApp(embedder);
    realApp = createApp();
    db = new pg.Pool({ connectionString: TEST_URL });
  }, 30000);

  beforeEach(async () => {
    embedder.queries = [];
    await db.query("DELETE FROM cards");
  });

  it("启用 pgvector，并把新卡片放进 todo", async () => {
    const extension = await db.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(extension.rowCount).toBe(1);
    const index = await db.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'cards' AND indexname = 'cards_embedding_hnsw'",
    );
    expect(index.rowCount).toBe(1);

    const created = await request(app)
      .post("/api/cards")
      .send({ title: "Fix login failure", description: "Users cannot authenticate" });
    expect(created.status).toBe(201);
    expect(created.body.card).toMatchObject({
      title: "Fix login failure",
      description: "Users cannot authenticate",
      status: "todo",
    });
    expect(created.body.card.embedding).toBeUndefined();

    const listed = await request(app).get("/api/cards");
    expect(listed.status).toBe(200);
    expect(listed.body.cards).toHaveLength(1);
    expect(listed.body.cards[0].status).toBe("todo");
  });

  it("拒绝空名称，嵌入失败时不落库", async () => {
    const empty = await request(app).post("/api/cards").send({ title: "   ", description: "x" });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post("/api/cards")
      .send({ title: "t".repeat(201), description: "" });
    expect(tooLong.status).toBe(400);

    const failed = await request(app)
      .post("/api/cards")
      .send({ title: "Embedding failed", description: "will not persist" });
    expect(failed.status).toBe(502);

    const listed = await request(app).get("/api/cards");
    expect(listed.body.cards).toHaveLength(0);
  });

  it("可以在三个栏位之间移动，刷新后仍然保持", async () => {
    const created = await request(app).post("/api/cards").send({
      title: "Ship the board",
      description: "Drag between columns",
    });
    const id = created.body.card.id as string;

    const moved = await request(app).patch(`/api/cards/${id}`).send({ status: "doing" });
    expect(moved.status).toBe(200);
    expect(moved.body.card.status).toBe("doing");

    const done = await request(app).patch(`/api/cards/${id}`).send({ status: "done" });
    expect(done.body.card.status).toBe("done");

    const listed = await request(app).get("/api/cards");
    expect(listed.body.cards[0].status).toBe("done");

    const invalid = await request(app).patch(`/api/cards/${id}`).send({ status: "archived" });
    expect(invalid.status).toBe(400);
    const missing = await request(app)
      .patch("/api/cards/00000000-0000-0000-0000-000000000000")
      .send({ status: "todo" });
    expect(missing.status).toBe(404);
    const badId = await request(app).patch("/api/cards/not-a-uuid").send({ status: "todo" });
    expect(badId.status).toBe(400);
  });

  it("用余弦相似度过滤卡片，低于阈值的不返回", async () => {
    await request(app).post("/api/cards").send({
      title: "Fix login failure",
      description: "Users cannot authenticate",
    });
    await request(app).post("/api/cards").send({
      title: "Update billing invoice",
      description: "Receipt total looks wrong",
    });

    const matched = await request(app).post("/api/search").send({ query: "cannot sign in" });
    expect(matched.status).toBe(200);
    expect(matched.body.cards.map((card: { title: string }) => card.title)).toEqual(["Fix login failure"]);
    expect(matched.body.cards[0].score).toBeGreaterThan(0.99);

    const low = await request(app).post("/api/search").send({ query: "borderline-low" });
    expect(low.body.cards).toEqual([]);

    const high = await request(app).post("/api/search").send({ query: "borderline-high" });
    expect(high.body.cards).toHaveLength(1);
    expect(high.body.cards[0].title).toBe("Fix login failure");
    expect(high.body.cards[0].score).toBeGreaterThan(0.35);
    expect(high.body.cards[0].score).toBeLessThan(0.99);

    const unrelated = await request(app).post("/api/search").send({ query: "weather tomorrow" });
    expect(unrelated.body.cards).toEqual([]);
  });

  it("空搜索不调用嵌入，没有 Key 时列表仍可读、创建和搜索失败", async () => {
    await request(app).post("/api/cards").send({
      title: "Fix login failure",
      description: "Users cannot authenticate",
    });

    const all = await request(app).post("/api/search").send({ query: "   " });
    expect(all.status).toBe(200);
    expect(all.body.cards).toHaveLength(1);
    expect(embedder.queries).toEqual([]);

    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const listed = await request(realApp).get("/api/cards");
      expect(listed.status).toBe(200);
      expect(listed.body.cards).toHaveLength(1);

      const created = await request(realApp).post("/api/cards").send({ title: "Another", description: "" });
      expect(created.status).toBe(502);
      expect(created.body.error).toContain("OPENROUTER_API_KEY");

      const searched = await request(realApp).post("/api/search").send({ query: "cannot sign in" });
      expect(searched.status).toBe(502);

      const stillThere = await request(realApp).get("/api/cards");
      expect(stillThere.body.cards).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });
});
