import { fuzzyScore, tokenize, parseJobFolder } from "../fuzzy.js";

describe("tokenize", () => {
  it("splits on spaces and dashes", () => {
    expect(tokenize("Factorial Energy")).toEqual(["factorial", "energy"]);
    expect(tokenize("billerica-cleanroom")).toEqual(["billerica", "cleanroom"]);
  });

  it("filters tokens shorter than 2 chars", () => {
    expect(tokenize("a b factorial")).toEqual(["factorial"]);
  });

  it("returns empty array for blank input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });
});

describe("fuzzyScore", () => {
  it("returns 0 when no tokens match", () => {
    expect(fuzzyScore("051 Factorial", ["billerica"])).toBe(0);
  });

  it("scores substring match (+1) and exact word match (+2)", () => {
    // "fact" is a substring of "factorial" but not an exact word
    expect(fuzzyScore("051 Factorial", ["fact"])).toBe(1);
    // "factorial" is both substring and exact word
    expect(fuzzyScore("051 Factorial", ["factorial"])).toBe(3);
  });

  it("accumulates score across multiple tokens", () => {
    const score = fuzzyScore("062 Factorial Phase2- Billerica", ["factorial", "billerica"]);
    // Each token: substring (+1) + exact word (+2) = 3 each → 6
    expect(score).toBe(6);
  });

  it("matches case-insensitively against folder name (tokens are pre-lowercased by tokenize)", () => {
    // Uppercase in folder name is still matched against lowercase tokens
    expect(fuzzyScore("051 FACTORIAL", ["factorial"])).toBe(3);
  });

  it("handles special chars in folder name", () => {
    expect(fuzzyScore("1002 Warehouse fab & tool crib areas- Summer 2025", ["warehouse"])).toBe(3);
  });
});

describe("parseJobFolder", () => {
  it("parses standard job number + name", () => {
    expect(parseJobFolder("051 Factorial")).toEqual({ job_number: "051", job_name: "Factorial" });
    expect(parseJobFolder("1000 Demo Room")).toEqual({ job_number: "1000", job_name: "Demo Room" });
  });

  it("parses multi-word names", () => {
    expect(parseJobFolder("1002 Warehouse fab & tool crib areas- Summer 2025")).toEqual({
      job_number: "1002",
      job_name: "Warehouse fab & tool crib areas- Summer 2025",
    });
  });

  it("returns null job_number for non-standard names", () => {
    expect(parseJobFolder("000-Airtho Client Reference List")).toEqual({
      job_number: null,
      job_name: "000-Airtho Client Reference List",
    });
  });
});
