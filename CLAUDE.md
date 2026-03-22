# Mandarin Master — Project Context

## Stack

- **Frontend**: Vanilla HTML/CSS/JS — no npm, no bundler, no framework
- **Auth**: Supabase Auth (Google OAuth, Facebook OAuth, email/password)
- **Payments**: PayPal JS SDK (client-side buttons, LIVE mode)
- **Character Writing**: HanziWriter 2.2 (CDN)
- **Screen Capture**: html2canvas 1.4.1 (CDN)
- **Hosting**: Netlify (static deploy)

## File Structure

```
mandarin-master/
├── index.html              Main app shell (sidebar + content sections + modals)
├── app.js                  Core app logic (vocab, phrases, story, leaderboard, PayPal)
├── styles.css              Global styles (dark/light theme, glassmorphism)
├── js/
│   ├── supabase.js         Supabase client init (window.supabaseClient)
│   └── auth.js             Auth module (window.auth) — signIn, signUp, OAuth, state listener
├── data/
│   ├── hsk1.js             HSK Level 1 vocabulary, phrases, story, resources (150 words)
│   └── hsk2.js             HSK Level 2 data (skeleton — needs content)
├── auth-modal.html         Reference copy of auth modal snippet (already inlined in index.html)
├── privacy-policy.html     GDPR/CCPA privacy policy
├── support.html            FAQ + contact support page
├── _redirects              Netlify clean URL rules
└── CLAUDE.md               This file
```

## Script Load Order (critical)

Scripts in `index.html` must load in this exact order:

```
1. <head>  Supabase CDN          — creates window.supabase global
2. <body>  data/hsk1.js          — HSK vocab data
3.         data/hsk2.js          — HSK vocab data
4.         js/supabase.js        — inits client → window.supabaseClient
5.         js/auth.js            — auth module → window.auth
6.         <inline script>       — AuthModal controller → window.AuthModal
7.         HanziWriter CDN       — character writing lib
8.         html2canvas CDN       — screen capture lib
9.         PayPal SDK            — payment buttons (LIVE client-id)
10.        app.js                — main app (depends on everything above)
```

## Auth Providers

| Provider | Method | Status |
|----------|--------|--------|
| Email/Password | `auth.signUp()` / `auth.signIn()` | Ready (needs Supabase project) |
| Google | `auth.signInWithGoogle()` → OAuth redirect | Ready (needs Google Cloud + Supabase config) |
| Facebook | `auth.signInWithFacebook()` → OAuth redirect | Ready (needs Meta Developer + Supabase config) |

### Auth flow

1. User clicks "Log In" or "Get Started Free" in sidebar
2. `AuthModal.show()` opens modal with social buttons + email tabs
3. On success, Supabase `onAuthStateChange` fires → `auth-state-changed` CustomEvent
4. `app.js` listens for event → sets `state.user`, calls `loadLevel()`
5. `auth.js` toggles `[data-auth="logged-in"]` / `[data-auth="logged-out"]` elements
6. AuthModal auto-hides on successful auth

### Supabase setup checklist

- [ ] Create project at https://supabase.com/dashboard
- [ ] Copy Project URL + anon key into `js/supabase.js`
- [ ] Enable Google provider (Authentication → Providers)
- [ ] Enable Facebook provider (Authentication → Providers)
- [ ] Enable Email provider (Authentication → Providers)
- [ ] Add site domain to Authentication → URL Configuration → Redirect URLs
- [ ] Set Site URL to production domain

## Payments

**PayPal JS SDK** — client-side only, LIVE mode.

- Client ID is in the `<script>` tag in `index.html`
- Payment flow is in `app.js` → `renderPayPalButton()`
- Premium status stored in `localStorage.isPremium`

### RULE: Never modify payments code

The PayPal integration in `app.js` (`renderPayPalButton`, `checkPremiumStatus`) is production-live.
**Do not touch payment-related functions** without explicit instruction.

## Supabase Tables (planned)

### `user_progress`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| level | int | HSK level (1-6) |
| word_index | int | Current word position |
| vocab_completed | bool | Level vocab done |
| phrases_completed | bool | Level phrases done |
| story_completed | bool | Level story done |
| score | int | XP score |
| updated_at | timestamptz | Last update |

### `subscriptions`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| paypal_order_id | text | PayPal transaction ID |
| plan | text | 'free' or 'premium' |
| started_at | timestamptz | Subscription start |
| expires_at | timestamptz | Subscription expiry |
| is_active | bool | Current status |

## Global Objects

| Object | Source | Purpose |
|--------|--------|---------|
| `window.supabaseClient` | js/supabase.js | Supabase client instance |
| `window.auth` | js/auth.js | Auth API (signIn, signUp, signOut, OAuth, getUser, etc.) |
| `window.AuthModal` | inline script | Modal controller (show, hide) |
| `window.speak` | app.js | Text-to-speech for Chinese characters |
| `hsk1Data` | data/hsk1.js | HSK 1 vocabulary dataset |
| `hsk2Data` | data/hsk2.js | HSK 2 vocabulary dataset |

## Conventions

- Vanilla JS only — no npm, no build step, no transpilation
- Mobile-first responsive design
- All errors caught and displayed to user (never silent failures)
- CSS scoping: auth modal uses `am-` prefix, sidebar auth uses `sidebar-auth-` prefix
- Dark theme by default, light mode toggle available
- `data-auth="logged-in"` / `data-auth="logged-out"` for auth-conditional UI elements

## Current Session Goals

- [x] Implement Supabase auth (js/supabase.js + js/auth.js)
- [x] Build auth modal with Google + Facebook + email (auth-modal.html)
- [x] Wire into index.html with sidebar nav buttons
- [x] Remove Firebase, clean up app.js
- [x] Document project in CLAUDE.md
- [ ] Create Supabase project and paste credentials
- [ ] Configure Google + Facebook OAuth in Supabase dashboard
- [ ] Deploy to Netlify
- [ ] Test full auth flow end-to-end
- [ ] Build user_progress + subscriptions tables in Supabase
