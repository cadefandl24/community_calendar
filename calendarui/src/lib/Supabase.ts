import { createClient } from '@supabase/supabase-js';

export function makeSupabase(getToken: () => Promise<string>) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { accessToken: getToken }
  );
}