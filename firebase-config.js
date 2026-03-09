// =============================================================
// Firebase Configuration for Mandarin Master
// =============================================================
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create project "mandarin-master"
// 3. Enable Authentication → Google (and Facebook if ready)
// 4. Register a Web app, copy your config values below
// 5. Add your Netlify domain to Authentication → Settings → Authorized domains
// =============================================================

// TODO: Replace these placeholder values with your real Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// NOTE: Firebase apiKey is safe to expose in frontend code.
// It only identifies your project — it does NOT grant access to your data.
// Security is enforced by Firebase Security Rules, not by hiding the key.

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- Auth Provider Setup ---
const googleProvider = new firebase.auth.GoogleAuthProvider();
const facebookProvider = new firebase.auth.FacebookAuthProvider();

// --- Auth Functions ---

function signInWithGoogle() {
    return auth.signInWithPopup(googleProvider);
}

function signInWithFacebook() {
    return auth.signInWithPopup(facebookProvider);
}

function signInWithApple() {
    const appleProvider = new firebase.auth.OAuthProvider('apple.com');
    return auth.signInWithPopup(appleProvider);
}

function signInWithEmail(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

function signUpWithEmail(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
}

function signOut() {
    return auth.signOut();
}

// --- Auth State Listener ---
// This fires on page load and on every sign-in/sign-out
auth.onAuthStateChanged(function (user) {
    if (user) {
        // User is signed in
        const userData = {
            id: user.uid,
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            photo: user.photoURL
        };
        localStorage.setItem('vocab_user', JSON.stringify(userData));
        window.firebaseUser = userData;
        window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { user: userData } }));
    } else {
        // User is signed out
        localStorage.removeItem('vocab_user');
        window.firebaseUser = null;
        window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { user: null } }));
    }
});
