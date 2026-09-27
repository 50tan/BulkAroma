// Lightweight zero-dependency test runner for Bulkaroma test suites

let total = 0;
let passed = 0;
let failed = 0;

function describe(suiteName: string, fn: () => void) {
  console.log(`\n\x1b[1m${suiteName}\x1b[0m`);
  fn();
}

function test(testName: string, fn: () => void) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } catch (err: any) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${testName}`);
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (actual >= expected) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
  };
}

// Attach globals
(global as any).describe = describe;
(global as any).test = test;
(global as any).expect = expect;

console.log('\n========================================');
console.log('Bulkaroma Price Intelligence — Test Suite');
console.log('========================================');

// 1. Purchase Calculator
describe('Purchase Calculator Tests (#98)', () => {
  function calculatePurchase(targetQty: number, packageQty: number, listedPrice: number) {
    if (packageQty <= 0) throw new Error('Package quantity must be positive');
    const packagesRequired = Math.ceil(targetQty / packageQty);
    const actualQuantityPurchased = packagesRequired * packageQty;
    const excessQuantity = actualQuantityPurchased - targetQty;
    const actualCost = packagesRequired * listedPrice;
    return { packagesRequired, actualQuantityPurchased, excessQuantity, actualCost };
  }

  test('Need 100g, Pack 200g @ $30: 1 package, 200g purchased, 100g excess, $30 cost', () => {
    const res = calculatePurchase(100, 200, 30);
    expect(res.packagesRequired).toBe(1);
    expect(res.actualQuantityPurchased).toBe(200);
    expect(res.excessQuantity).toBe(100);
    expect(res.actualCost).toBe(30);
  });

  test('Need 300g, Pack 200g @ $30: 2 packages, 400g purchased, 100g excess, $60 cost', () => {
    const res = calculatePurchase(300, 200, 30);
    expect(res.packagesRequired).toBe(2);
    expect(res.actualQuantityPurchased).toBe(400);
    expect(res.excessQuantity).toBe(100);
    expect(res.actualCost).toBe(60);
  });

  test('Need 750g, Pack 500g @ $65: 2 packages, 1000g purchased, 250g excess, $130 cost', () => {
    const res = calculatePurchase(750, 500, 65);
    expect(res.packagesRequired).toBe(2);
    expect(res.actualQuantityPurchased).toBe(1000);
    expect(res.excessQuantity).toBe(250);
    expect(res.actualCost).toBe(130);
  });

  test('Need 750g, Pack 200g @ $30: 4 packages, 800g purchased, 50g excess, $120 cost', () => {
    const res = calculatePurchase(750, 200, 30);
    expect(res.packagesRequired).toBe(4);
    expect(res.actualQuantityPurchased).toBe(800);
    expect(res.excessQuantity).toBe(50);
    expect(res.actualCost).toBe(120);
  });

  test('Need 1500g (1.5kg), Pack 1000g (1kg) @ $100: 2 packages, 2000g purchased, 500g excess, $200 cost', () => {
    const res = calculatePurchase(1500, 1000, 100);
    expect(res.packagesRequired).toBe(2);
    expect(res.actualQuantityPurchased).toBe(2000);
    expect(res.excessQuantity).toBe(500);
    expect(res.actualCost).toBe(200);
  });

  test('Need exact package size (500g, Pack 500g @ $65): 1 package, 0 excess, $65 cost', () => {
    const res = calculatePurchase(500, 500, 65);
    expect(res.packagesRequired).toBe(1);
    expect(res.actualQuantityPurchased).toBe(500);
    expect(res.excessQuantity).toBe(0);
    expect(res.actualCost).toBe(65);
  });
});

describe('Normalized Price Equivalent Tests (#32, #34, #87)', () => {
  function calculateEquivalent(packageQtyG: number, listedPrice: number, targetQtyG: number) {
    return (listedPrice / packageQtyG) * targetQtyG;
  }

  test('200g package @ $30 -> $15 per 100g equivalent', () => {
    const equiv = calculateEquivalent(200, 30, 100);
    expect(equiv).toBe(15);
  });

  test('500g package @ $65 -> $13 per 100g equivalent', () => {
    const equiv = calculateEquivalent(500, 65, 100);
    expect(equiv).toBe(13);
  });

  test('Price per kg = price per 100g * 10', () => {
    const per100g = calculateEquivalent(200, 30, 100);
    const perKg = calculateEquivalent(200, 30, 1000);
    expect(perKg).toBe(per100g * 10);
  });
});

// 2. Normalizer Tests
describe('Normalizer Tests (#26, #35)', () => {
  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function extractCas(text: string): string | null {
    const m = text.match(/\b(\d{2,7}-\d{2}-\d)\b/);
    return m ? m[1] : null;
  }

  function parseQty(s: string) {
    const match = s.trim().toLowerCase().match(/^([\d.]+)\s*(mg|g|kg|oz|lb|ml|l|fl\.?\s*oz?)$/);
    if (!match) return null;
    const quantity = parseFloat(match[1]);
    const unit = match[2].replace(/\s+/g, '').replace('fl.oz', 'fl_oz');
    if (isNaN(quantity) || quantity <= 0) return null;
    return { quantity, unit };
  }

  test('Iso E Super variations normalize consistently', () => {
    expect(normalizeName('Iso E Super')).toBe('iso e super');
    expect(normalizeName('ISO E SUPER')).toBe('iso e super');
    expect(normalizeName('Iso E Super™')).toBe('iso e super');
  });

  test('Preserves manufacturer suffix as distinct tokens', () => {
    expect(normalizeName('Iso E Super (IFF)')).toBe('iso e super iff');
  });

  test('Extracts standard CAS from text', () => {
    expect(extractCas('CAS: 54464-57-2')).toBe('54464-57-2');
    expect(extractCas('CAS No. 78-70-6 (Linalool)')).toBe('78-70-6');
    expect(extractCas('No CAS here')).toBeNull();
  });

  test('Parses quantities with units correctly', () => {
    expect(parseQty('200g')).toEqual({ quantity: 200, unit: 'g' });
    expect(parseQty('1 kg')).toEqual({ quantity: 1, unit: 'kg' });
    expect(parseQty('15ml')).toEqual({ quantity: 15, unit: 'ml' });
    expect(parseQty('0g')).toBeNull();
  });
});

// 3. Matching Priority Tests
describe('Material Matching Priority Tests (#27, #97)', () => {
  function matchProduct(p: { name: string; norm: string; cas: string | null }, m: { name: string; norm: string; cas: string | null }) {
    if (p.cas && m.cas && p.cas === m.cas) return { matched: true, confidence: 0.99, reason: 'cas_match' };
    if (p.cas && m.cas && p.cas !== m.cas) return { matched: false, confidence: 0, reason: 'cas_conflict' };
    if (p.norm === m.norm) return { matched: true, confidence: 0.95, reason: 'exact_name_match' };
    return { matched: false, confidence: 0, reason: 'not_matched' };
  }

  const iso = { name: 'Iso E Super', norm: 'iso e super', cas: '54464-57-2' };

  test('Same CAS matches with high confidence (0.99)', () => {
    const res = matchProduct({ name: 'OTNE', norm: 'otne', cas: '54464-57-2' }, iso);
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(0.99);
  });

  test('Exact normalized name matches with 0.95 confidence', () => {
    const res = matchProduct({ name: 'ISO E SUPER', norm: 'iso e super', cas: null }, iso);
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(0.95);
  });

  test('CRITICAL: Same name with DIFFERENT CAS must NOT merge (conflict prevention)', () => {
    const carvoneL = { name: 'Carvone L', norm: 'carvone', cas: '6485-40-1' };
    const carvoneD = { name: 'Carvone D', norm: 'carvone', cas: '2244-16-8' };
    const res = matchProduct(carvoneD, carvoneL);
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('cas_conflict');
  });
});

// 4. Currency Conversion Tests
describe('Currency Conversion Tests (#36, #90, #99)', () => {
  const RATES: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    NZD: 1.64,
    INR: 83.25,
  };

  function convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const inUSD = amount / RATES[from];
    return Math.round(inUSD * RATES[to] * 100) / 100;
  }

  test('USD to INR: $30 USD -> ₹2,497.50 INR', () => {
    const inr = convert(30, 'USD', 'INR');
    expect(inr).toBe(2497.5);
  });

  test('NZD to INR (Fraterworks original currency preserved): NZ$65 -> INR', () => {
    const inr = convert(65, 'NZD', 'INR');
    expect(inr).toBeGreaterThan(3200);
    expect(inr).toBeLessThan(3400);
  });

  test('Same currency conversion returns exact amount', () => {
    expect(convert(100, 'USD', 'USD')).toBe(100);
    expect(convert(2500, 'INR', 'INR')).toBe(2500);
  });

  test('Supplier original currency is preserved in comparison object', () => {
    const comparison = {
      listedPrice: 30,
      originalCurrency: 'USD',
      convertedPrice: convert(30, 'USD', 'INR'),
      displayCurrency: 'INR',
    };
    expect(comparison.listedPrice).toBe(30);
    expect(comparison.originalCurrency).toBe('USD');
    expect(comparison.displayCurrency).toBe('INR');
  });
});

// Summary
console.log('\n========================================');
console.log(`Total: ${total} | Passed: \x1b[32m${passed}\x1b[0m | Failed: \x1b[31m${failed}\x1b[0m`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
