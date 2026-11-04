import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or publishable key. Personal stickers will be unavailable until configured.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublishableKey || 'missing-publishable-key',
  {
    accessToken: async () => {
      const currentUser = auth.currentUser;
      return currentUser ? await currentUser.getIdToken() : null;
    }
  }
);
