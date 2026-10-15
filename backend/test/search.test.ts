import { describe, expect, it } from "vitest";
import { lexicalScore, rankMatch, tokenize } from "../src/search.js";

const title = "Setup project repository";
const description = "Initialize Vite + React template with Tailwind CSS and ESLint configuration.";

describe("混合检索", () => {
  it("按词切分，并忽略标点", () => {
    expect(tokenize("  Project, repository! ")).toEqual(["project", "repository"]);
  });

  it("标题里的整词比描述里的整词分高，子串不算命中", () => {
    expect(lexicalScore(title, description, ["project"])).toBe(1);
    expect(lexicalScore(title, description, ["vite"])).toBe(0.7);
    expect(lexicalScore(title, description, ["tail"])).toBe(0);
    expect(lexicalScore("Cannot sign in", "Users cannot authenticate", ["in"])).toBe(1);
  });

  it("一两个词向量分低时，字符串命中仍保留卡片", () => {
    const ranked = rankMatch(0.19, title, description, "project");
    expect(ranked.include).toBe(true);
    expect(ranked.score).toBeGreaterThan(0.5);
  });

  it("没有字符串重合、向量分也低时不返回", () => {
    const ranked = rankMatch(0.19, title, description, "weather");
    expect(ranked.include).toBe(false);
  });

  it("无效向量分不会变成 NaN", () => {
    const ranked = rankMatch(Number.NaN, title, description, "project");
    expect(ranked.include).toBe(true);
    expect(Number.isFinite(ranked.score)).toBe(true);
  });

  it("无效向量分按 0 处理，不会得到 NaN", () => {
    const ranked = rankMatch(Number.NaN, title, description, "project");
    expect(ranked.include).toBe(true);
    expect(Number.isFinite(ranked.score)).toBe(true);
  });

  it("长查询的高向量分不会被少量重合词拉低", () => {
    const ranked = rankMatch(0.99, "Fix login failure", "Users cannot authenticate", "cannot sign in");
    expect(ranked.include).toBe(true);
    expect(ranked.score).toBe(0.99);
  });
});