export type Status = "todo" | "doing" | "done";

export type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
  score?: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）`);
  }
  return data as T;
}

export function listCards() {
  return request<{ cards: Card[] }>("/api/cards");
}

export function createCard(title: string, description: string) {
  return request<{ card: Card }>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

export function moveCard(id: string, status: Status) {
  return request<{ card: Card }>(`/api/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function searchCards(query: string) {
  return request<{ cards: Card[] }>("/api/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}
