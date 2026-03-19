// =============================================================
// Supabase Client — Mandarin Master
// =============================================================
// SETUP:
// 1. Go to https://supabase.com/dashboard → New Project
// 2. Copy your Project URL and anon (public) key
// 3. Paste them below
// 4. Add your site domain to Authentication → URL Configuration → Redirect URLs
//
// SECURITY NOTE:
// The anon key is safe to expose in frontend code.
// It only grants access controlled by Row Level Security (RLS) policies.
// Your service_role key must NEVER appear in frontend code.
// =============================================================

// --- Configuration ---
var SUPABASE_URL = 'https://dpvfmurocginoxatxlut.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_3RlvOJK2V6M04sW7_tzzxw_3vUbyZol';

// --- Initialize Client ---
(function () {
    'use strict';

    // Guard: ensure Supabase CDN loaded
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
        console.error(
            '[Mandarin Master] Supabase SDK not loaded. ' +
            'Make sure the CDN script tag is in <head> BEFORE this file.'
        );
        // Expose a stub so downstream code fails gracefully instead of crashing
        window.supabaseClient = null;
        return;
    }

    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,       // keep session in localStorage across reloads
            autoRefreshToken: true,      // silently refresh JWT before it expires
            detectSessionInUrl: true     // pick up OAuth redirect tokens from URL hash
        }
    });

    // Expose globally for auth.js and app.js
    window.supabaseClient = client;

    console.log('[Mandarin Master] Supabase client initialized');
})();
