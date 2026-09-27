import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CurrencyService, SUPPORTED_CURRENCIES, FALLBACK_RATES_USD } from '../services/currency.service';

const router = Router();
const currencyService = new CurrencyService();

const CURRENCY_METADATA = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
];

/**
 * GET /api/currencies
 * Returns base currency, live/cached rates map, and supported currencies.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rates = await currencyService.getAllRates('USD');
    return res.json({
      base: 'USD',
      rates,
      currencies: CURRENCY_METADATA,
      observedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      base: 'USD',
      rates: FALLBACK_RATES_USD,
      currencies: CURRENCY_METADATA,
      observedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/currencies/rates
 * Returns latest rates map.
 */
router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const rates = await currencyService.getAllRates('USD');
    return res.json({
      base: 'USD',
      rates,
      observedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      base: 'USD',
      rates: FALLBACK_RATES_USD,
      observedAt: new Date().toISOString(),
    });
  }
});

const ConvertSchema = z.object({
  amount: z.coerce.number().nonnegative(),
  from: z.string().length(3),
  to: z.string().length(3),
});

/**
 * GET & POST /api/currencies/convert
 * Convert amount from one currency to another.
 */
const handleConvert = async (req: Request, res: Response) => {
  const payload = req.method === 'GET' ? req.query : req.body;
  const parsed = ConvertSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { amount, from, to } = parsed.data;

  if (from.toUpperCase() === to.toUpperCase()) {
    return res.json({ amount, from, to, converted: amount, result: amount, rate: 1 });
  }

  try {
    const rate = await currencyService.getRate(from, to);
    const converted = amount * rate;
    return res.json({ amount, from, to, converted, result: converted, rate });
  } catch (err) {
    console.error('[Currencies/convert] Error:', err);
    return res.status(500).json({ error: 'Currency conversion failed' });
  }
};

router.get('/convert', handleConvert);
router.post('/convert', handleConvert);

/**
 * POST /api/currencies/refresh
 * Refresh exchange rates from external provider.
 */
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    const rates = await currencyService.getAllRates('USD');
    return res.json({ message: 'Exchange rates refreshed successfully', rates });
  } catch (err) {
    console.error('[Currencies/refresh] Error:', err);
    return res.status(500).json({ error: 'Failed to refresh exchange rates' });
  }
});

export default router;
