import { useMemo } from 'react';
import { UNIT_TO_GRAMS } from '../types';
import type { QuantityUnit, PurchaseCalcResult, CurrencyCode } from '../types';

interface UsePurchaseCalculatorInput {
  targetQuantity: number;
  targetUnit: QuantityUnit;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  listedPrice: number;
  currency: string;
  convertedRate?: number | null; // rate from currency to displayCurrency
  displayCurrency?: CurrencyCode | null;
}

/**
 * Computes how many packages must be bought to meet the target quantity,
 * the actual quantity purchased, excess, and total cost.
 *
 * packagesRequired = ceil(targetQuantity_in_g / packageQuantity_in_g)
 * actualQuantityPurchased = packagesRequired * packageQuantity
 * excess = actualQuantityPurchased - targetQuantity (in same base unit)
 * actualCost = packagesRequired * listedPrice
 */
export function usePurchaseCalculator(
  input: UsePurchaseCalculatorInput
): PurchaseCalcResult | null {
  return useMemo(() => {
    const {
      targetQuantity,
      targetUnit,
      packageQuantity,
      packageUnit,
      listedPrice,
      currency,
      convertedRate,
      displayCurrency,
    } = input;

    if (
      targetQuantity <= 0 ||
      packageQuantity <= 0 ||
      listedPrice <= 0
    ) {
      return null;
    }

    const targetGrams = targetQuantity * UNIT_TO_GRAMS[targetUnit];
    const packageGrams = packageQuantity * UNIT_TO_GRAMS[packageUnit];

    const packagesRequired = Math.ceil(targetGrams / packageGrams);
    const actualGrams = packagesRequired * packageGrams;
    const excessGrams = actualGrams - targetGrams;

    const actualCost = packagesRequired * listedPrice;

    const convertedActualCost =
      convertedRate != null && convertedRate > 0
        ? actualCost * convertedRate
        : null;

    return {
      packagesRequired,
      actualQuantityPurchased: actualGrams,
      actualUnit: 'g' as QuantityUnit,
      excessQuantity: excessGrams,
      actualCost,
      actualCostCurrency: currency,
      convertedActualCost,
      convertedCurrency: displayCurrency ?? null,
    };
  }, [input]);
}

/**
 * Standalone (non-hook) version for use outside React components.
 */
export function calcPurchase(
  targetQuantity: number,
  targetUnit: QuantityUnit,
  packageQuantity: number,
  packageUnit: QuantityUnit,
  listedPrice: number,
  currency: string
): Omit<PurchaseCalcResult, 'convertedActualCost' | 'convertedCurrency'> {
  const targetGrams = targetQuantity * UNIT_TO_GRAMS[targetUnit];
  const packageGrams = packageQuantity * UNIT_TO_GRAMS[packageUnit];

  const packagesRequired = Math.ceil(targetGrams / packageGrams);
  const actualGrams = packagesRequired * packageGrams;
  const excessGrams = actualGrams - targetGrams;
  const actualCost = packagesRequired * listedPrice;

  return {
    packagesRequired,
    actualQuantityPurchased: actualGrams,
    actualUnit: 'g',
    excessQuantity: excessGrams,
    actualCost,
    actualCostCurrency: currency,
  };
}
