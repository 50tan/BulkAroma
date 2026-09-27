describe('Global Currency Conversion and Normalization Suite', () => {
  // Reference rates (relative to USD = 1.0)
  const RATES: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    AUD: 1.52,
    CAD: 1.35,
    NZD: 1.64,
    JPY: 148.5,
    SGD: 1.34,
    AED: 3.67,
    INR: 83.25,
  };

  function convertCurrency(amount: number, from: string, to: string): number {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return amount;
    const fromRate = RATES[f];
    const toRate = RATES[t];
    if (!fromRate || !toRate) throw new Error(`Unsupported currency pair: ${from} -> ${to}`);
    const inUSD = amount / fromRate;
    return Math.round(inUSD * toRate * 100) / 100;
  }

  describe('Direct Pair Conversion Matrix', () => {
    test('1. USD to INR ($80 USD -> INR)', () => {
      const res = convertCurrency(80, 'USD', 'INR');
      // 80 * 83.25 = 6660
      expect(res).toBe(6660);
    });

    test('2. USD to EUR ($100 USD -> EUR)', () => {
      const res = convertCurrency(100, 'USD', 'EUR');
      expect(res).toBe(92);
    });

    test('3. USD to GBP ($100 USD -> GBP)', () => {
      const res = convertCurrency(100, 'USD', 'GBP');
      expect(res).toBe(79);
    });

    test('4. USD to AUD ($100 USD -> AUD)', () => {
      const res = convertCurrency(100, 'USD', 'AUD');
      expect(res).toBe(152);
    });

    test('5. USD to CAD ($100 USD -> CAD)', () => {
      const res = convertCurrency(100, 'USD', 'CAD');
      expect(res).toBe(135);
    });

    test('6. USD to NZD ($100 USD -> NZD)', () => {
      const res = convertCurrency(100, 'USD', 'NZD');
      expect(res).toBe(164);
    });

    test('7. USD to JPY ($10 USD -> JPY)', () => {
      const res = convertCurrency(10, 'USD', 'JPY');
      expect(res).toBe(1485);
    });

    test('8. USD to SGD ($100 USD -> SGD)', () => {
      const res = convertCurrency(100, 'USD', 'SGD');
      expect(res).toBe(134);
    });

    test('9. USD to AED ($100 USD -> AED)', () => {
      const res = convertCurrency(100, 'USD', 'AED');
      expect(res).toBe(367);
    });

    test('10. NZD to INR (Fraterworks supplier currency: NZ$20 -> INR)', () => {
      // 20 / 1.64 * 83.25 ≈ 1015.24
      const res = convertCurrency(20, 'NZD', 'INR');
      expect(res).toBeGreaterThan(1000);
      expect(res).toBeLessThan(1050);
    });

    test('11. EUR to INR (€50 EUR -> INR)', () => {
      // 50 / 0.92 * 83.25 ≈ 4524.46
      const res = convertCurrency(50, 'EUR', 'INR');
      expect(res).toBeGreaterThan(4500);
      expect(res).toBeLessThan(4600);
    });

    test('12. GBP to INR (£50 GBP -> INR)', () => {
      // 50 / 0.79 * 83.25 ≈ 5268.99
      const res = convertCurrency(50, 'GBP', 'INR');
      expect(res).toBeGreaterThan(5200);
      expect(res).toBeLessThan(5300);
    });

    test('13. AUD to INR (A$50 AUD -> INR)', () => {
      // 50 / 1.52 * 83.25 ≈ 2738.49
      const res = convertCurrency(50, 'AUD', 'INR');
      expect(res).toBeGreaterThan(2700);
      expect(res).toBeLessThan(2800);
    });
  });

  describe('Integrity & Invariant Rules', () => {
    test('14. Identity: converting to same currency returns exact amount without precision loss', () => {
      expect(convertCurrency(100, 'USD', 'USD')).toBe(100);
      expect(convertCurrency(7673.5, 'INR', 'INR')).toBe(7673.5);
      expect(convertCurrency(45.25, 'NZD', 'NZD')).toBe(45.25);
      expect(convertCurrency(89.99, 'EUR', 'EUR')).toBe(89.99);
    });

    test('15. Separation of source currency vs display currency', () => {
      const pshItem = {
        sourceCurrency: 'USD',
        listedPrice: 80.0,
        displayCurrency: 'INR',
        fxRate: 83.25,
        convertedPrice: convertCurrency(80, 'USD', 'INR'),
      };
      expect(pshItem.sourceCurrency).toBe('USD');
      expect(pshItem.listedPrice).toBe(80.0);
      expect(pshItem.displayCurrency).toBe('INR');
      expect(pshItem.convertedPrice).toBe(6660);
      expect(pshItem.listedPrice === pshItem.convertedPrice).toBe(false);
    });

    test('16. Purchase calculation logic remains independent of FX, then converted cleanly', () => {
      const targetQuantity = 100; // grams
      const packageQuantity = 200; // grams
      const listedPrice = 80.0; // USD
      const fxRate = 83.25;

      const packagesRequired = Math.ceil(targetQuantity / packageQuantity); // 1
      const actualQuantityPurchased = packagesRequired * packageQuantity; // 200
      const excessQuantity = actualQuantityPurchased - targetQuantity; // 100
      const actualCost = packagesRequired * listedPrice; // $80.00
      const convertedCost = Math.round(actualCost * fxRate * 100) / 100; // ₹6,660.00

      expect(packagesRequired).toBe(1);
      expect(actualQuantityPurchased).toBe(200);
      expect(excessQuantity).toBe(100);
      expect(actualCost).toBe(80.0);
      expect(convertedCost).toBe(6660.0);
    });

    test('17. Price per 100g normalization in both source and display currencies', () => {
      const packageGrams = 250;
      const listedPriceUSD = 34.0;
      const fxRate = 83.25;

      const origPer100g = Math.round(((listedPriceUSD / packageGrams) * 100) * 100) / 100; // 13.6
      const convertedPrice = listedPriceUSD * fxRate; // 2830.5
      const convertedPer100g = Math.round(((convertedPrice / packageGrams) * 100) * 100) / 100; // 1132.2

      expect(origPer100g).toBe(13.6);
      expect(convertedPer100g).toBe(1132.2);
      expect(Math.abs((convertedPer100g / origPer100g) - fxRate) < 0.01).toBe(true);
    });
  });
});
