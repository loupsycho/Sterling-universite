import { createClient } from '@supabase/supabase-js';
import { patchUrlMappings } from '@discord/embedded-app-sdk';

// IMPORTANT : le proxy Discord doit être configuré AVANT createClient.
// Supabase mémorise son transport lors de l'initialisation du client.
const isDiscordActivity =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('frame_id');

if (isDiscordActivity) {
  patchUrlMappings([
    { prefix: '/supabase', target: 'hentlmqphwnikbltbjbp.supabase.co' },
  ]);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Les variables Supabase sont manquantes.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
