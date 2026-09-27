import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './env';

/**
 * Server-side Supabase client using the SERVICE ROLE (secret) key.
 * This client bypasses Row Level Security and has full DB access.
 * NEVER expose this client or its key to the frontend.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: WebSocket as any,
  },
});
