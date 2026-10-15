import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { Card } from "./api";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function column(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!(section instanceof HTMLElement)) throw new Error(`找不到栏位 ${name}`);
  return section;
}

describe("看板界面", () => {
  const cards: Card[] = [];

  beforeEach(() => {
    cards.splice(0, cards.length);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === "/api/cards" && method === "GET") return json({ cards });
        if (url === "/api/cards" && method === "POST") {
          const body = JSON.parse(String(init?.body)) as { title: string; description: string };
          const card: Card = {
            id: "card-1",
            title: body.title,
            description: body.description,
            status: "todo",
            createdAt: "2026-10-15T00:00:00.000Z",
          };
          cards.push(card);
          return json({ card }, 201);
        }
        if (url === "/api/search" && method === "POST") {
          return json({
            cards: cards.map((card) => ({ ...card, score: 0.91 })),
          });
        }
        if (url === "/api/cards/card-1" && method === "PATCH") {
          const body = JSON.parse(String(init?.body)) as { status: Card["status"] };
          const card = cards.find((item) => item.id === "card-1");
          if (!card) return json({ error: "卡片不存在" }, 404);
          card.status = body.status;
          return json({ card });
        }
        return json({ error: `未预期的请求 ${method} ${url}` }, 500);
      }),
    );
  });

  it("展示三个栏位和创建入口", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "To-do" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Doing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Done" })).toBeTruthy();
    expect(screen.getAllByText("没有卡片")).toHaveLength(3);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/cards", expect.any(Object)));
  });

  it("创建后卡片出现在 To-do", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "创建卡片" }));
    await user.click(screen.getByRole("button", { name: "创建" }));
    expect(screen.getByText("名称不能为空")).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "名称" }), "Fix login failure");
    await user.type(screen.getByRole("textbox", { name: "描述" }), "Users cannot authenticate");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(within(column("To-do")).getByText("Fix login failure")).toBeTruthy());
    expect(within(column("To-do")).getByText("Users cannot authenticate")).toBeTruthy();
    expect(within(column("Doing")).getByText("没有卡片")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "创建卡片" })).toBeNull();
  });

  it("按栏位摆放已有卡片，搜索时只显示命中并带相似度", async () => {
    cards.push({
      id: "card-1",
      title: "Fix login failure",
      description: "Users cannot authenticate",
      status: "doing",
      createdAt: "2026-10-15T00:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(within(column("Doing")).getByText("Fix login failure")).toBeTruthy());
    expect(within(column("To-do")).queryByText("Fix login failure")).toBeNull();

    await user.type(screen.getByRole("searchbox", { name: "搜索卡片" }), "cannot sign in");
    await waitFor(() => expect(within(column("Doing")).getByText("91% 相似")).toBeTruthy());
    const searchCall = vi.mocked(fetch).mock.calls.find((call) => call[0] === "/api/search");
    expect(searchCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ query: "cannot sign in" }),
    });
  });

  it("较慢的旧搜索不会覆盖新结果", async () => {
    const user = userEvent.setup();
    let resolveOld: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === "/api/cards" && method === "GET") return json({ cards: [] });
        if (url === "/api/search" && method === "POST") {
          const body = JSON.parse(String(init?.body)) as { query: string };
          if (body.query === "old") {
            return new Promise<Response>((resolve) => {
              resolveOld = resolve;
            });
          }
          return json({
            cards: [
              {
                id: "new",
                title: "new result",
                description: "",
                status: "todo",
                createdAt: "2026-10-15T00:00:00.000Z",
                score: 0.8,
              },
            ],
          });
        }
        return json({ error: "unexpected" }, 500);
      }),
    );

    render(<App />);
    await screen.findAllByText("没有卡片");
    const search = screen.getByRole("searchbox", { name: "搜索卡片" });
    await user.type(search, "old");
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    await user.clear(search);
    await user.type(search, "new");
    await screen.findByText("new result");
    resolveOld?.(
      json({
        cards: [
          {
            id: "old",
            title: "old result",
            description: "",
            status: "todo",
            createdAt: "2026-10-15T00:00:00.000Z",
            score: 0.4,
          },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText("old result")).toBeNull();
    expect(screen.getByText("new result")).toBeTruthy();
  });

  it("列表失败时显示错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "无法连接 Postgres" }, 500)));
    render(<App />);
    expect(await screen.findByText("无法连接 Postgres")).toBeTruthy();
  });
});
