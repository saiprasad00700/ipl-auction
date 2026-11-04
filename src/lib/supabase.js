import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or publishable key. Personal stickers will be unavailable until configured.');
}

const resolvedUrl = supabaseUrl || 'https://placeholder.supabase.co';
const resolvedKey = supabasePublishableKey || 'missing-publishable-key';

// Keep the existing database client on the publishable/anon key. Auction and
// team REST sync already use this client and must not unexpectedly receive a
// Firebase JWT as their Authorization bearer token.
export const supabase = createClient(resolvedUrl, resolvedKey);

// Firebase third-party auth is needed only for private per-user sticker storage.
// Isolating it prevents the sticker feature from changing auth on existing
// auctions/teams REST requests.
export const supabaseSticker = createClient(resolvedUrl, resolvedKey, {
  accessToken: async () => {
    const currentUser = auth.currentUser;
    return currentUser ? await currentUser.getIdToken() : null;
  }
});
