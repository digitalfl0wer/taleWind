/**
 * /src/lib/supabase/client.ts
 *
 * Server-side Supabase client using the service role key.
 * This client bypasses Row Level Security and must ONLY be used in
 * server-side code (API routes, lib helpers).
 *
 * Security rules:
 * - SUPABASE_SERVICE_ROLE_KEY must never have the NEXT_PUBLIC_ prefix.
 * - This module must never be imported from a client component.
 * - Never return this client instance in an API response.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client authenticated with the service role key.
 * Creates a new client instance on each call — Supabase clients are
 * lightweight and stateless so this is safe in serverless environments.
 *
 * @returns A Supabase SupabaseClient instance with service role access.
 * @throws If required environment variables are missing.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error(
      "[supabase/client] Missing NEXT_PUBLIC_SUPABASE_URL environment variable."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "[supabase/client] Missing SUPABASE_SERVICE_ROLE_KEY environment variable."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable automatic session persistence — this is a server-side service client
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
