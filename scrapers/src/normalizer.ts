/**
 * normalizer.ts
 *
 * Standalone, pure-function utilities for text normalisation, CAS extraction,
 * quantity / price parsing, and fuzzy product matching.
 * All functions are side-effect free and fully unit-testable.
 */

// ─── Exported types ────────────────────────────────────────────────────────────

export interface ParsedQuantity {
  quantity: number;
  unit: string;
}

export interface PriceParsed {
  amount: number;
  currency: string;
}

export interface ProductData {
  name: string;
  casNumber?: string | null;
  brand?: string | null;
}

export type MatchConfidence = "exact" | "strong" | "weak" | "none";

export interface MatchResult {
  confidence: MatchConfidence;
  /** Number 0–1; 1 = identical */
  score: number;
  evidence: MatchEvidence[];
}

export type MatchEvidence =
  | "exact_name"
  | "normalized_name"
  | "cas_match"
  | "fuzzy_name"
  | "cas_conflict"
  | "name_conflict";

// ─── Name normalisation ────────────────────────────────────────────────────────

/**
 * Normalises a fragrance ingredient name for comparison:
 *  - Strips trademark / registered symbols (™, ®, ©)
 *  - Removes parenthetical suffixes like "(IFF)" → keeps inner text as a word
 *  - Collapses whitespace
 *  - Lower-cases
 *
 * Examples:
 *   'Iso E Super™'      → 'iso e super'
 *   'Iso E Super (IFF)' → 'iso e super iff'
 *   'ISO E SUPER'       → 'iso e super'
 */
export function normalizeName(name: string): string {
  return name
    .replace(/[™®©]/g, "")           // strip trademark symbols
    .replace(/\(([^)]+)\)/g, " $1 ") // expand parenthetical content
    .replace(/[^a-zA-Z0-9\s-]/g, "") // remove remaining punctuation
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim()
    .toLowerCase();
}

// ─── CAS number extraction ─────────────────────────────────────────────────────

/**
 * Finds and returns the first CAS registry number in a string.
 * A CAS number looks like: 1-7 digits, dash, 2 digits, dash, 1 digit.
 * Handles labels like "CAS: ", "CAS No.", "CAS#", etc.
 *
 * Returns null if no CAS number is found.
 */
export function extractCasNumber(text: string): string | null {
  if (!text) return null;
  // 1. Prioritize explicit CAS label: "CAS", "CAS#", "CAS No.", "CAS Number"
  const labeled = text.match(/CAS\s*(?:#|no\.?|number)?[:\s]*([0-9]{2,7}-[0-9]{2}-[0-9])/i);
  if (labeled) {
    return labeled[1].trim();
  }
  // 2. Fallback: check digit-hyphen pattern only if valid CAS checksum
  const allMatches = text.matchAll(/\b([0-9]{2,7}-[0-9]{2}-[0-9])\b/g);
  for (const m of allMatches) {
    const candidate = m[1];
    if (isCasChecksumValid(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Validates the CAS registry number check digit. */
function isCasChecksumValid(cas: string): boolean {
  const digits = cas.replace(/-/g, "");
  const allDigits = digits.split("").map(Number);
  const checkDigit = allDigits[allDigits.length - 1];
  const body = allDigits.slice(0, -1).reverse();
  const sum = body.reduce((acc, d, i) => acc + d * (i + 1), 0);
  return sum % 10 === checkDigit;
}

// ─── Quantity parsing ──────────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  ml: "ml",
  milliliter: "ml",
  millilitre: "ml",
  milliliters: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  litre: "l",
  liters: "l",
  litres: "l",
  fl: "fl_oz",
  "fl oz": "fl_oz",
  fl_oz: "fl_oz",
};

/**
 * Parses a quantity string into a numeric value and canonical unit.
 *
 * Examples:
 *   '200g'   → { quantity: 200, unit: 'g' }
 *   '1 kg'   → { quantity: 1,   unit: 'kg' }
 *   '4 oz'   → { quantity: 4,   unit: 'oz' }
 *   '500 ml' → { quantity: 500, unit: 'ml' }
 */
export function parseQuantityString(s: string): ParsedQuantity | null {
  const trimmed = s.trim().toLowerCase();

  // Pattern: number (int or decimal) then optional space then unit
  const match = trimmed.match(
    /^([\d,]+(?:\.\d+)?)\s*(g|kg|oz|lb|lbs|ml|l|fl\s*oz|fl_oz|gram|grams|kilogram|kilograms|ounce|ounces|pound|pounds|liter|litre|liters|litres|milliliter|millilitre|milliliters|millilitres)s?$/i
  );

  if (!match) return null;

  const quantity = parseFloat(match[1].replace(/,/g, ""));
  const rawUnit = match[2].replace(/\s+/g, " ").toLowerCase();
  const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;

  if (isNaN(quantity) || quantity <= 0) return null;

  return { quantity, unit };
}

// ─── Price parsing ─────────────────────────────────────────────────────────────

/**
 * Parses a price string into an amount and ISO currency code.
 *
 * Examples:
 *   '$30.00'   → { amount: 30,  currency: 'USD' }
 *   'NZ$45.00' → { amount: 45,  currency: 'NZD' }
 *   '£12.50'   → { amount: 12.5, currency: 'GBP' }
 *   '€9.99'    → { amount: 9.99, currency: 'EUR' }
 *   'AU$18.00' → { amount: 18,  currency: 'AUD' }
 */
export function parsePriceString(s: string): PriceParsed | null {
  const trimmed = s.trim();

  // Map symbol/prefix → ISO code
  const currencyMap: Array<[RegExp, string]> = [
    [/^NZ\$/i, "NZD"],
    [/^AU\$/i, "AUD"],
    [/^CA\$/i, "CAD"],
    [/^US\$/i, "USD"],
    [/^\$/, "USD"],
    [/^£/, "GBP"],
    [/^€/, "EUR"],
    [/^¥/, "JPY"],
  ];

  let currency = "USD";
  let remaining = trimmed;

  for (const [pattern, code] of currencyMap) {
    if (pattern.test(remaining)) {
      currency = code;
      remaining = remaining.replace(pattern, "").trim();
      break;
    }
  }

  // Strip trailing currency labels like "USD", "NZD"
  remaining = remaining.replace(/\s*(USD|NZD|AUD|GBP|EUR|JPY|CAD)$/i, "").trim();

  // Remove commas used as thousands separators
  remaining = remaining.replace(/,/g, "");

  const amount = parseFloat(remaining);
  if (isNaN(amount)) return null;

  return { amount, currency };
}

// ─── Jaro-Winkler similarity ───────────────────────────────────────────────────

/**
 * Computes the Jaro-Winkler similarity between two strings.
 * Returns a value in [0, 1] where 1 means identical.
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  if (matchWindow < 0) return 0;

  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Winkler prefix bonus (up to 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ─── Product matching ──────────────────────────────────────────────────────────

/**
 * Determines whether two products represent the same material.
 *
 * Rules:
 *  - If both have a CAS number and they DIFFER → hard "none" with cas_conflict
 *  - If both have a CAS number and they match  → "exact" with cas_match
 *  - Exact normalised name match               → "exact"
 *  - Jaro-Winkler ≥ 0.92                       → "strong"
 *  - Jaro-Winkler ≥ 0.75                       → "weak"
 *  - Otherwise                                 → "none"
 */
export function isSameMaterial(a: ProductData, b: ProductData): MatchResult {
  const evidence: MatchEvidence[] = [];

  // CAS conflict check — must never auto-merge different CAS numbers
  if (a.casNumber && b.casNumber && a.casNumber !== b.casNumber) {
    return {
      confidence: "none",
      score: 0,
      evidence: ["cas_conflict"],
    };
  }

  // CAS match is high-confidence
  if (a.casNumber && b.casNumber && a.casNumber === b.casNumber) {
    evidence.push("cas_match");
  }

  const normA = normalizeName(a.name);
  const normB = normalizeName(b.name);

  if (normA === normB) {
    evidence.push(a.name === b.name ? "exact_name" : "normalized_name");
    return {
      confidence: "exact",
      score: 1,
      evidence,
    };
  }

  const similarity = calculateStringSimilarity(normA, normB);

  if (evidence.includes("cas_match") || similarity >= 0.92) {
    evidence.push("fuzzy_name");
    return {
      confidence: "strong",
      score: similarity,
      evidence,
    };
  }

  if (similarity >= 0.75) {
    evidence.push("fuzzy_name");
    return {
      confidence: "weak",
      score: similarity,
      evidence,
    };
  }

  return {
    confidence: "none",
    score: similarity,
    evidence,
  };
}
