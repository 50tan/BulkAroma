import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { supabase } from '../config/supabase';

/**
 * Admin authentication middleware.
 *
 * Accepts either:
 *   1. Authorization: Bearer <SUPABASE_SECRET_KEY>   (service-level access)
 *   2. Authorization: Bearer <valid Supabase JWT>     (authenticated user)
 *
 * In production, restrict JWT users further by checking their role/claims.
 */
export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7).trim();

  // ── 1. Service-key check ──────────────────────────────────────────────────
  if (token === env.supabaseSecretKey) {
    next();
    return;
  }

  // ── 2. Supabase JWT check ─────────────────────────────────────────────────
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
      return;
    }

    // Attach user to request for downstream use
    (req as Request & { user: typeof data.user }).user = data.user;
    next();
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Auth check failed' });
  }
}
