// =============================================================
// Authentication Module — Mandarin Master
// =============================================================
// Depends on: js/supabase.js (must load first)
// Exposes:    window.auth
// =============================================================

(function () {
    'use strict';

    // --- Guard ---
    if (!window.supabaseClient) {
        console.error('[Auth] supabaseClient not found. Load js/supabase.js first.');
        window.auth = null;
        return;
    }

    var sb = window.supabaseClient;

    // --- Helpers ---

    /**
     * Show an error message in the #auth-error element (if it exists).
     * Clears itself after 6 seconds.
     */
    function showError(message) {
        var el = document.getElementById('auth-error');
        if (!el) {
            console.error('[Auth]', message);
            return;
        }
        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(showError._timer);
        showError._timer = setTimeout(function () {
            el.textContent = '';
            el.style.display = 'none';
        }, 6000);
    }
    showError._timer = null;

    /** Clear any visible auth error. */
    function clearError() {
        var el = document.getElementById('auth-error');
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    /**
     * Set loading state on a button.
     * Disables it & stores original text; restore with setLoading(btn, false).
     */
    function setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = 'Please wait\u2026';
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.originalText || btn.textContent;
            btn.disabled = false;
        }
    }

    // --- Email / Password ---

    /**
     * Create a new account with email + password.
     * @param {string} email
     * @param {string} password  (min 6 chars, enforced by Supabase)
     * @param {string} name      display name stored in user_metadata
     * @returns {Promise<object>} Supabase user object on success
     */
    async function signUp(email, password, name) {
        clearError();
        try {
            var result = await sb.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { display_name: name }
                }
            });
            if (result.error) throw result.error;
            return result.data.user;
        } catch (err) {
            showError(err.message || 'Sign-up failed. Please try again.');
            throw err;
        }
    }

    /**
     * Sign in with existing email + password.
     */
    async function signIn(email, password) {
        clearError();
        try {
            var result = await sb.auth.signInWithPassword({
                email: email,
                password: password
            });
            if (result.error) throw result.error;
            return result.data.user;
        } catch (err) {
            showError(err.message || 'Sign-in failed. Check your credentials.');
            throw err;
        }
    }

    /**
     * Sign out the current user.
     */
    async function signOut() {
        clearError();
        try {
            var result = await sb.auth.signOut();
            if (result.error) throw result.error;
        } catch (err) {
            showError(err.message || 'Sign-out failed.');
            throw err;
        }
    }

    // --- Password Reset ---

    /**
     * Send a password-reset email.
     * The link in the email redirects to /reset-password.html
     */
    async function resetPassword(email) {
        clearError();
        try {
            var result = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });
            if (result.error) throw result.error;
            return true;
        } catch (err) {
            showError(err.message || 'Password reset failed.');
            throw err;
        }
    }

    // --- Session Helpers ---

    /**
     * Get the currently signed-in user (or null).
     */
    async function getUser() {
        try {
            var result = await sb.auth.getUser();
            if (result.error) return null;
            return result.data.user;
        } catch (err) {
            return null;
        }
    }

    /**
     * Get the current session (or null).
     */
    async function getSession() {
        try {
            var result = await sb.auth.getSession();
            if (result.error) return null;
            return result.data.session;
        } catch (err) {
            return null;
        }
    }

    /**
     * Route-protection helper.
     * If no active session, redirects to the given path (default: '/').
     * Use at the top of protected pages:  auth.requireAuth();
     */
    async function requireAuth(redirectPath) {
        var session = await getSession();
        if (!session) {
            window.location.href = redirectPath || '/';
        }
        return session;
    }

    // --- UI State Binding ---

    /**
     * Toggle visibility of elements based on auth state.
     *   data-auth="logged-in"   → shown when signed in, hidden when signed out
     *   data-auth="logged-out"  → shown when signed out, hidden when signed in
     */
    function updateAuthUI(user) {
        var loggedInEls = document.querySelectorAll('[data-auth="logged-in"]');
        var loggedOutEls = document.querySelectorAll('[data-auth="logged-out"]');

        var i;
        for (i = 0; i < loggedInEls.length; i++) {
            loggedInEls[i].style.display = user ? '' : 'none';
        }
        for (i = 0; i < loggedOutEls.length; i++) {
            loggedOutEls[i].style.display = user ? 'none' : '';
        }
    }

    // --- Auth State Listener ---

    sb.auth.onAuthStateChange(function (event, session) {
        var user = session ? session.user : null;

        // Update data-auth elements
        updateAuthUI(user);

        // Dispatch custom event for app.js and other listeners
        window.dispatchEvent(new CustomEvent('auth-state-changed', {
            detail: {
                event: event,   // 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', etc.
                user: user,
                session: session
            }
        }));

        if (event === 'SIGNED_IN') {
            console.log('[Auth] Signed in:', user.email);
        } else if (event === 'SIGNED_OUT') {
            console.log('[Auth] Signed out');
        }
    });

    // Run once on page load to set initial UI state
    getUser().then(function (user) {
        updateAuthUI(user);
    });

    // --- Public API ---
    window.auth = {
        // Email/password
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,

        // Password reset
        resetPassword: resetPassword,

        // Session
        getUser: getUser,
        getSession: getSession,
        requireAuth: requireAuth,

        // UI helpers
        showError: showError,
        clearError: clearError,
        setLoading: setLoading
    };

    console.log('[Auth] Module ready');
})();
