export type DiffTokenType = 'same' | 'add' | 'remove';

export interface DiffToken {
  type: DiffTokenType;
  text: string;
}

/**
 * Simple word-level diff using LCS.
 * Good enough to highlight where wording changed after Hebrew refine.
 */
export const diffWords = (before: string, after: string): DiffToken[] => {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);

  const m = a.length;
  const n = b.length;

  if (!m && !n) return [];

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array<number>(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (a[i] === b[j]) {
      tokens.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ type: 'remove', text: a[i] });
      i += 1;
    } else {
      tokens.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }

  while (i < m) {
    tokens.push({ type: 'remove', text: a[i] });
    i += 1;
  }
  while (j < n) {
    tokens.push({ type: 'add', text: b[j] });
    j += 1;
  }

  return tokens;
};


