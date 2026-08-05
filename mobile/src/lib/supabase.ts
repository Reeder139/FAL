import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { sessionStorage } from '@/lib/sessionStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in .env (see .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Off, and the password-reset screen redeems its token itself (see
    // app/reset-password.tsx). Deliberate: leaving this on makes *any* page
    // that happens to load with a token in its URL silently sign someone in,
    // and the reset screen would then be racing the client to find out
    // whether that had happened. Redeeming explicitly, on the one screen
    // that should, is both narrower and deterministic.
    detectSessionInUrl: false,
  },
});
