import { normalizeName, parsePriceString, parseQuantityString, extractCasNumber } from '../scrapers/src/normalizer';

describe('Normalizer', () => {
  describe('normalizeName', () => {
    test('Iso E Super variations all normalize consistently', () => {
      expect(normalizeName('Iso E Super')).toBe('iso e super');
      expect(normalizeName('ISO E SUPER')).toBe('iso e super');
      expect(normalizeName('Iso E Super™')).toBe('iso e super');
      expect(normalizeName('  Iso   E   Super  ')).toBe('iso e super');
    });

    test('Preserves manufacturer suffix as distinct tokens', () => {
      expect(normalizeName('Iso E Super (IFF)')).toBe('iso e super iff');
    });
  });

  describe('extractCasNumber', () => {
    test('Extracts standard CAS from text', () => {
      expect(extractCasNumber('CAS: 54464-57-2')).toBe('54464-57-2');
      expect(extractCasNumber('CAS No. 78-70-6 (Linalool)')).toBe('78-70-6');
      expect(extractCasNumber('115-95-7')).toBe('115-95-7');
    });

    test('Returns null when no CAS present', () => {
      expect(extractCasNumber('No CAS available')).toBeNull();
      expect(extractCasNumber('')).toBeNull();
    });
  });

  describe('parseQuantityString', () => {
    test('Parses gram quantities', () => {
      expect(parseQuantityString('5g')).toEqual({ quantity: 5, unit: 'g' });
      expect(parseQuantityString('25 g')).toEqual({ quantity: 25, unit: 'g' });
      expect(parseQuantityString('200g')).toEqual({ quantity: 200, unit: 'g' });
      expect(parseQuantityString('500 g')).toEqual({ quantity: 500, unit: 'g' });
    });

    test('Parses kilogram quantities', () => {
      expect(parseQuantityString('1 kg')).toEqual({ quantity: 1, unit: 'kg' });
      expect(parseQuantityString('2.5kg')).toEqual({ quantity: 2.5, unit: 'kg' });
    });

    test('Parses milliliter quantities', () => {
      expect(parseQuantityString('15ml')).toEqual({ quantity: 15, unit: 'ml' });
      expect(parseQuantityString('100 ml')).toEqual({ quantity: 100, unit: 'ml' });
    });

    test('Parses ounce quantities', () => {
      expect(parseQuantityString('4 oz')).toEqual({ quantity: 4, unit: 'oz' });
      expect(parseQuantityString('8 fl oz')).toEqual({ quantity: 8, unit: 'fl_oz' });
    });

    test('Returns null for invalid quantities', () => {
      expect(parseQuantityString('invalid')).toBeNull();
      expect(parseQuantityString('0g')).toBeNull();
      expect(parseQuantityString('-5g')).toBeNull();
    });
  });

  describe('parsePriceString', () => {
    test('Parses USD prices', () => {
      expect(parsePriceString('$30.00')).toEqual({ amount: 30, currency: 'USD' });
      expect(parsePriceString('$12.50')).toEqual({ amount: 12.5, currency: 'USD' });
      expect(parsePriceString('$ 65')).toEqual({ amount: 65, currency: 'USD' });
    });

    test('Parses NZD prices', () => {
      expect(parsePriceString('NZ$45.00')).toEqual({ amount: 45, currency: 'NZD' });
      expect(parsePriceString('NZ$ 130.00')).toEqual({ amount: 130, currency: 'NZD' });
    });

    test('Returns null for unparseable prices', () => {
      expect(parsePriceString('Free')).toBeNull();
      expect(parsePriceString('')).toBeNull();
    });
  });
});
