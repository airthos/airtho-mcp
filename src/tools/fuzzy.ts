/**
 * Shared fuzzy-matching utilities used across job/vendor search tools.
 * All matching is done server-side so the model only sees filtered results.
 */

/**
 * Fuzzy-score a name against a set of query tokens.
 * Substring match = +1, exact word match = +2.
 * Returns 0 if no tokens match.
 */
export function fuzzyScore(name: string, tokens: string[]): number {
  const lower = name.toLowerCase();
  const words = lower.split(/[\s\-_&,]+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += 1;
    if (words.includes(token)) score += 2; // bonus for exact word match
  }
  return score;
}

/**
 * Tokenize a keyword string into lowercase search tokens (min length 2).
 * Returns empty array if keyword is blank/undefined.
 */
export function tokenize(keyword?: string): string[] {
  if (!keyword) return [];
  return keyword.toLowerCase().split(/[\s\-_,]+/).filter((t) => t.length > 1);
}

/**
 * Parse a folder name like "051 Factorial" or "1002 Warehouse fab & tool crib"
 * into a job number and human-readable job name.
 * job_number is null if the pattern doesn't match.
 */
export function parseJobFolder(folderName: string): { job_number: string | null; job_name: string } {
  const match = folderName.match(/^(\d+)\s+(.+)$/);
  if (match) {
    return { job_number: match[1], job_name: match[2] };
  }
  return { job_number: null, job_name: folderName };
}
