# Mandarin Master — Distribution Execution Guide

## Status Tracker

| # | Platform | Fee | Status | Action |
|---|----------|-----|--------|--------|
| 1 | **Microsoft Store** | FREE | 📝 Ready | Use PWABuilder.com to package |
| 2 | **Samsung Galaxy Store** | FREE | 📧 Ready to email | Send PWA submission email |
| 3 | **Huawei AppGallery** | FREE | ✅ APK ready | Upload build-artifacts/mandarin-master-apk/app-release.apk |
| 4 | **Google Play** | $25 (paid) | ✅ AAB ready | Upload build-artifacts/mandarin-master-aab/app-release.aab |
| 5 | **Amazon Appstore** | FREE (active) | ✅ APK ready | Upload build-artifacts/mandarin-master-apk/app-release.apk |
| 6 | **Product Hunt** | FREE | 📝 Ready | Launch post |
| 7 | **Lemon Squeezy** | 5%+$0.50 | 📝 Ready | Create sales page |
| 8 | **Directory Listings** | FREE | 📝 Ready | Submit to AlternativeTo, Capterra |

---

## PLATFORM 1: Microsoft Store (FREE — PWA Native)

### Why First
- FREE to publish
- PWAs run natively on Windows — no wrapping needed
- You keep 100% revenue (PayPal commerce stays yours)
- 1.4B+ Windows devices

### Steps
1. Go to https://www.pwabuilder.com
2. Enter: `https://mandarin-master.netlify.app`
3. Click "Package for stores" → Windows
4. Download the `.msixbundle` package
5. Go to https://partner.microsoft.com/dashboard
6. Create new app → Upload `.msixbundle`
7. Fill in store listing using `store-listings.md`
8. Upload screenshots from `tiktok_assets/`
9. Submit for review (typically 1-3 days)

### Alternative: GitHub Actions
- The `build-msix.yml` workflow is set up and running
- Download the artifact from GitHub Actions when complete

---

## PLATFORM 2: Samsung Galaxy Store (FREE — Email PWA)

### Why Second
- FREE, no developer fee
- Samsung has 30%+ mobile market share
- PWA submission via email — simplest process

### Email Template
**To**: pwasupport@samsung.com
**Subject**: PWA Submission Request — Mandarin Master (Education/Language Learning)

**Body**:
```
Hello Samsung Galaxy Store Team,

I would like to submit my Progressive Web App for inclusion in the Samsung Galaxy Store.

App Details:
- App Name: Mandarin Master - Learn Chinese HSK
- PWA URL: https://mandarin-master.netlify.app
- Web Manifest: https://mandarin-master.netlify.app/manifest.json
- Category: Education > Language Learning
- Description: Master Mandarin Chinese with 4,597 interactive HSK vocabulary words, character stroke tracing, spaced repetition, and pronunciation training. Complete HSK 1-6 coverage.
- Privacy Policy: https://mandarin-master.netlify.app/privacy-policy
- Support URL: https://mandarin-master.netlify.app/support
- Content Rating: Everyone

Key Features:
- Interactive character stroke tracing (HanziWriter)
- Native pronunciation audio
- Spaced repetition system
- Works offline (Service Worker cached)
- Dark/light theme support
- PWA installable with full manifest

Screenshots are attached.

Thank you for your consideration.

Best regards,
[Your Name]
```

Attach: `tiktok_assets/10_app_vocab_card.png` and `tiktok_assets/11_app_features_pro.png`

---

## PLATFORM 3: Huawei AppGallery (FREE — Education 80/20)

### Steps
1. Go to https://developer.huawei.com/consumer/en/appgallery
2. Register/login as developer (free for individuals)
3. Create new app → Android
4. Upload the TWA APK from GitHub Actions artifacts
5. Fill store listing from `store-listings.md`
6. Upload screenshots
7. Select category: Education > Language
8. Submit for review

### Revenue
- 80% to you / 20% Huawei for education apps
- Payout options include PayPal in some regions

---

## PLATFORM 4: Google Play Store (Existing Account)

### Prerequisites
- ✅ Developer account active ($25 paid)
- ⏳ Need signed AAB from GitHub Actions
- ⏳ Need `assetlinks.json` updated with signing fingerprint

### Steps
1. Download AAB from GitHub Actions → `mandarin-master-aab` artifact
2. Get SHA-256 fingerprint from build logs
3. Update `.well-known/assetlinks.json` with real fingerprint
4. Push update to Netlify
5. Go to https://play.google.com/console
6. Create new app → Upload AAB
7. Fill store listing, screenshots, feature graphic
8. Complete content rating questionnaire
9. Set pricing: Free (with in-app purchase via PayPal)
10. Submit for review (typically 1-7 days)

### Digital Asset Links
After getting the signing fingerprint from the build:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.netlify.mandarin_master.twa",
    "sha256_cert_fingerprints": ["YOUR_FINGERPRINT_HERE"]
  }
}]
```

---

## PLATFORM 5: Amazon Appstore (Existing Account)

### Steps
1. Download APK from GitHub Actions → `mandarin-master-apk` artifact
2. Go to https://developer.amazon.com/apps-and-games
3. Create new app → Android
4. Upload same TWA APK
5. Fill store listing from `store-listings.md`
6. Upload screenshots
7. Submit for review

### Revenue
- 80% to you / 20% Amazon
- Payout via bank transfer (check PayPal options)

---

## PLATFORM 6: Product Hunt Launch (FREE)

### Preparation
- **Tagline**: "Master Mandarin Chinese with 4,597 interactive HSK words"
- **Topics**: Education, Language Learning, Productivity, Mobile Apps
- **First Comment** (maker comment):
  "Hey PH! I built Mandarin Master because I was frustrated with existing Chinese learning apps that either cost $200/year or only covered basic vocabulary. This app covers all 4,597 HSK words with interactive stroke tracing, pronunciation training, and spaced repetition — starting at completely free for HSK 1. Would love your feedback!"
- **Launch Day**: Tuesday or Wednesday (best PH days)
- **Time**: 12:01 AM PT (to maximize upvote window)

---

## PLATFORM 7: Free Directory Listings

### AlternativeTo
- URL: https://alternativeto.net/software/mandarin-master/
- List as alternative to: Duolingo, HelloChinese, Pleco, ChineseSkill
- Tags: Language Learning, Chinese, HSK, Education

### Capterra / G2 / GetApp
- Submit as education software
- Free basic listing
- Helps with SEO backlinks

### SaaSHub
- URL: https://www.saashub.com
- Free listing for software products

---

## PLATFORM 8: Lemon Squeezy (PayPal Payouts)

### Setup
1. Go to https://www.lemonsqueezy.com
2. Create account → Connect PayPal
3. Create product: "Mandarin Master Premium"
4. Pricing: $4.99/month or $29.99/year
5. Add checkout link to app's upgrade flow
6. Fee: 5% + $0.50 per transaction

### Why Lemon Squeezy
- Direct PayPal payouts ✅
- Handles VAT/tax globally
- Beautiful checkout pages
- License key system for premium validation

---

## Post-Launch Checklist

- [ ] Microsoft Store — submitted
- [ ] Samsung Galaxy Store — email sent
- [ ] Huawei AppGallery — submitted
- [ ] Google Play — AAB uploaded
- [ ] Amazon Appstore — APK uploaded
- [ ] Product Hunt — launched
- [ ] AlternativeTo — listed
- [ ] Lemon Squeezy — sales page live
- [ ] Reddit posts in r/ChineseLanguage, r/LearnChinese, r/HSK
- [ ] Facebook groups seeded
- [ ] SEO blog post about HSK 3.0 (launching July 2026)
