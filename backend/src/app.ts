import express from "express";
import { createCard, listCards, searchCards, updateStatus } from "./db.js";
import { embedDocument, embedQuery } from "./embed.js";
import { HttpError, isStatus } from "./types.js";

export type Embedder = {
  embedDocument(title: string, description: string): Promise<number[]>;
  embedQuery(query: string): Promise<number[]>;
};

const defaultEmbedder: Embedder = { embedDocument, embedQuery };

function readText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field}必须是字符串`);
  }
  return value.trim();
}

export function createApp(embedder: Embedder = defaultEmbedder) {
  const app = express();
  app.use(express.json());

  app.get("/api/cards", async (_req, res, next) => {
    try {
      res.json({ cards: await listCards() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cards", async (req, res, next) => {
    try {
      const title = readText(req.body?.title, "名称");
      const description = readText(req.body?.description ?? "", "描述");
      if (!title) throw new HttpError(400, "名称不能为空");
      if (title.length > 200) throw new HttpError(400, "名称过长");
      if (description.length > 5000) throw new HttpError(400, "描述过长");
      const embedding = await embedder.embedDocument(title, description);
      const card = await createCard(title, description, embedding);
      res.status(201).json({ card });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/cards/:id", async (req, res, next) => {
    try {
      if (!isStatus(req.body?.status)) {
        throw new HttpError(400, "栏位必须是 todo、doing 或 done");
      }
      const card = await updateStatus(req.params.id, req.body.status);
      res.json({ card });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/search", async (req, res, next) => {
    try {
      const query = readText(req.body?.query, "搜索词");
      if (!query) {
        res.json({ cards: await listCards() });
        return;
      }
      const embedding = await embedder.embedQuery(query);
      res.json({ cards: await searchCards(embedding) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "服务器错误" });
  });

  return app;
}
