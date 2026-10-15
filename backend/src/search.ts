const VECTOR_THRESHOLD = 0.35;
const LEXICAL_THRESHOLD = 0.5;
const SHORT_QUERY_TOKENS = 2;
const SHORT_QUERY_LEXICAL_WEIGHT = 0.6;
const LONG_QUERY_LEXICAL_WEIGHT = 0.25;
const DESCRIPTION_MATCH = 0.7;

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length >= 2);
}

function includesWord(text: string, token: string): boolean {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return pattern.test(text);
}

export function lexicalScore(title: string, description: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hits = tokens.reduce((sum, token) => {
    if (includesWord(title, token)) return sum + 1;
    if (includesWord(description, token)) return sum + DESCRIPTION_MATCH;
    return sum;
  }, 0);
  return hits / tokens.length;
}

export function rankMatch(vectorScore: number, title: string, description: string, query: string) {
  const vector = Number.isFinite(vectorScore) ? vectorScore : 0;
  const tokens = tokenize(query);
  const lexical = lexicalScore(title, description, tokens);
  const lexicalWeight = tokens.length <= SHORT_QUERY_TOKENS ? SHORT_QUERY_LEXICAL_WEIGHT : LONG_QUERY_LEXICAL_WEIGHT;
  const blended = tokens.length === 0 ? vector : (1 - lexicalWeight) * vector + lexicalWeight * lexical;
  return {
    score: Math.max(vector, blended),
    include: vector >= VECTOR_THRESHOLD || lexical >= LEXICAL_THRESHOLD,
  };
}
