import pg from "pg";
import { toVectorLiteral } from "./embed.js";
import { rankMatch } from "./search.js";
import { Card, HttpError, Status } from "./types.js";

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://board:board@localhost:5432/board",
    });
  }
  return pool;
}

type CardRow = {
  id: string;
  title: string;
  description: string;
  status: Status;
  created_at: Date;
  score?: number | string;
};

function toCard(row: CardRow, includeScore = false): Card {
  const card: Card = {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
  if (includeScore && row.score !== undefined) {
    card.score = Number(row.score);
  }
  return card;
}

export async function initDb(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await getPool().query("SELECT 1");
      await getPool().query("CREATE EXTENSION IF NOT EXISTS vector");
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS cards (
          id uuid PRIMARY KEY,
          title text NOT NULL,
          description text NOT NULL DEFAULT '',
          status text NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
          embedding vector(1024) NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await getPool().query(`
        CREATE INDEX IF NOT EXISTS cards_embedding_hnsw
        ON cards USING hnsw (embedding vector_cosine_ops)
      `);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const message = lastError instanceof Error ? lastError.message : "未知错误";
  throw new Error(`无法连接 Postgres：${message}`);
}

export async function listCards(): Promise<Card[]> {
  const result = await getPool().query<CardRow>(
    `SELECT id, title, description, status, created_at
     FROM cards
     ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => toCard(row));
}

export async function createCard(
  title: string,
  description: string,
  embedding: number[],
): Promise<Card> {
  const result = await getPool().query<CardRow>(
    `INSERT INTO cards (id, title, description, status, embedding)
     VALUES (gen_random_uuid(), $1, $2, 'todo', $3::vector)
     RETURNING id, title, description, status, created_at`,
    [title, description, toVectorLiteral(embedding)],
  );
  return toCard(result.rows[0]);
}

export async function updateStatus(id: string, status: Status): Promise<Card> {
  try {
    const result = await getPool().query<CardRow>(
      `UPDATE cards
       SET status = $1
       WHERE id = $2
       RETURNING id, title, description, status, created_at`,
      [status, id],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "卡片不存在");
    }
    return toCard(result.rows[0]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isInvalidText(error)) throw new HttpError(400, "卡片编号不正确");
    throw error;
  }
}

function isInvalidText(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "22P02";
}

export async function searchCards(embedding: number[], query: string): Promise<Card[]> {
  const result = await getPool().query<CardRow>(
    `SELECT id, title, description, status, created_at,
            1 - (embedding <=> $1::vector) AS score
     FROM cards`,
    [toVectorLiteral(embedding)],
  );
  return result.rows
    .map((row) => {
      const ranked = rankMatch(Number(row.score), row.title, row.description, query);
      return { card: toCard({ ...row, score: ranked.score }, true), include: ranked.include };
    })
    .filter((item) => item.include)
    .sort((left, right) => (right.card.score ?? 0) - (left.card.score ?? 0))
    .map((item) => item.card);
}
