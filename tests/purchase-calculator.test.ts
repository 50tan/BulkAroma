describe('Purchase Calculator', () => {
  // Logic from usePurchaseCalculator and backend/src/routes/compare.ts:
  // packagesRequired = Math.ceil(targetQuantity / packageQuantity)
  // actualQuantityPurchased = packagesRequired * packageQuantity
  // excess = actualQuantityPurchased - targetQuantity
  // actualCost = packagesRequired * listedPrice

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

describe('Normalized Price Calculations', () => {
  // Equivalent price = (listedPrice / packageQty) * targetQty
  // NOT claiming a 100g package exists for $15!
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

  test('25g package @ $8 -> $32 per 100g equivalent', () => {
    const equiv = calculateEquivalent(25, 8, 100);
    expect(equiv).toBe(32);
  });

  test('Price per kg = price per 100g * 10', () => {
    const per100g = calculateEquivalent(200, 30, 100);
    const perKg = calculateEquivalent(200, 30, 1000);
    expect(perKg).toBe(per100g * 10);
  });
});
