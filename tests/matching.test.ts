describe('Material Matching Priority', () => {
  // Priority:
  // 1. CAS match (highest confidence)
  // 2. Manufacturer + strong name match
  // 3. Chemical identity match
  // 4. Known alias
  // 5. Strong normalized name match
  // 6. Fuzzy similarity

  interface Product {
    name: string;
    normalizedName: string;
    casNumber: string | null;
    manufacturer: string | null;
  }

  interface Material {
    canonicalName: string;
    normalizedName: string;
    casNumber: string | null;
    aliases: string[];
  }

  function matchProduct(product: Product, material: Material): { matched: boolean; confidence: number; reason: string } {
    // 1. Same CAS -> CAS match (confidence 0.99)
    if (product.casNumber && material.casNumber && product.casNumber === material.casNumber) {
      return { matched: true, confidence: 0.99, reason: 'cas_match' };
    }

    // CONFLICT: Same name but DIFFERENT verified CAS -> Must NOT merge!
    if (product.casNumber && material.casNumber && product.casNumber !== material.casNumber) {
      return { matched: false, confidence: 0, reason: 'cas_conflict' };
    }

    // 2. Exact normalized name
    if (product.normalizedName === material.normalizedName) {
      return { matched: true, confidence: 0.95, reason: 'exact_name_match' };
    }

    // 3. Known alias
    if (material.aliases.includes(product.normalizedName)) {
      return { matched: true, confidence: 0.9, reason: 'alias_match' };
    }

    // 4. Strong name match with manufacturer
    if (product.manufacturer && product.normalizedName.includes(material.normalizedName)) {
      return { matched: true, confidence: 0.85, reason: 'name_and_manufacturer_match' };
    }

    return { matched: false, confidence: 0, reason: 'not_matched' };
  }

  const isoESuper: Material = {
    canonicalName: 'Iso E Super',
    normalizedName: 'iso e super',
    casNumber: '54464-57-2',
    aliases: ['iso e super iff', 'iso e super tm'],
  };

  test('CAS match gives highest confidence (0.99)', () => {
    const p: Product = {
      name: 'OTNE (Iso E Super)',
      normalizedName: 'otne iso e super',
      casNumber: '54464-57-2',
      manufacturer: 'IFF',
    };
    const res = matchProduct(p, isoESuper);
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(0.99);
    expect(res.reason).toBe('cas_match');
  });

  test('Exact normalized name matches with 0.95 confidence', () => {
    const p: Product = {
      name: 'ISO E SUPER',
      normalizedName: 'iso e super',
      casNumber: null,
      manufacturer: null,
    };
    const res = matchProduct(p, isoESuper);
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(0.95);
  });

  test('Known alias matches with 0.90 confidence', () => {
    const p: Product = {
      name: 'Iso E Super (IFF)',
      normalizedName: 'iso e super iff',
      casNumber: null,
      manufacturer: 'IFF',
    };
    const res = matchProduct(p, isoESuper);
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(0.9);
  });

  test('CRITICAL: Same name but DIFFERENT CAS must NOT automatically merge (conflict)', () => {
    // Example: L-Carvone (CAS 6485-40-1, spearmint) vs D-Carvone (CAS 2244-16-8, caraway)
    // Both might be called "Carvone" by a supplier, but they have different CAS numbers
    const carvoneL: Material = {
      canonicalName: 'L-Carvone',
      normalizedName: 'carvone',
      casNumber: '6485-40-1',
      aliases: [],
    };
    const carvoneDProduct: Product = {
      name: 'Carvone (Dextro)',
      normalizedName: 'carvone',
      casNumber: '2244-16-8', // Different CAS!
      manufacturer: null,
    };

    const res = matchProduct(carvoneDProduct, carvoneL);
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('cas_conflict');
  });
});
