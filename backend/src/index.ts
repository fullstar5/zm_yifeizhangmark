import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const { initDb } = await import("./db.js");
const { createApp } = await import("./app.js");

const port = Number(process.env.PORT ?? 3001);

try {
  await initDb();
  createApp().listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
