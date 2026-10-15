export const STATUSES = ["todo", "doing", "done"] as const;

export type Status = (typeof STATUSES)[number];

export type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
  score?: number;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && STATUSES.includes(value as Status);
}
