"""
TikTok Video Capture Script for Mandarin Master
Records a 15-second app walkthrough in 9:16 portrait
Outputs: tiktok_walkthrough.webm + individual screenshots for seedance.io
"""

import asyncio
import sys
import io
from playwright.async_api import async_playwright
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiktok_assets")
URL = "https://mandarin-master.netlify.app/"

DISMISS_AUTH = """
(() => {
    // Hide all auth/modal overlays
    document.querySelectorAll('dialog, .auth-overlay, .modal-overlay, .onboarding-overlay, .welcome-screen').forEach(d => {
        d.style.display = 'none';
        d.style.visibility = 'hidden';
        d.style.opacity = '0';
        d.style.pointerEvents = 'none';
        if (d.close) d.close();
    });
    // Hide by ID
    ['auth-modal', 'onboarding', 'welcome-modal'].forEach(id => {
        var el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.style.visibility = 'hidden'; }
    });
    // Force body scroll
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    // Try to init the app if needed
    if (typeof loadWord === 'function') loadWord();
    if (typeof switchSection === 'function') switchSection('vocab');

    return 'dismissed';
})()
"""

async def dismiss_and_setup(page):
    """Dismiss auth/onboarding and set up the app view"""
    # First try clicking Get Started or Skip
    for selector in [
        'button:has-text("Get Started")',
        'button:has-text("Skip")',
        'button:has-text("Continue")',
        'button:has-text("Close")',
        'a:has-text("I already have")',
    ]:
        try:
            await page.click(selector, timeout=1500)
            await asyncio.sleep(0.5)
        except:
            pass

    # Force dismiss via JS
    try:
        await page.evaluate(DISMISS_AUTH)
    except:
        pass
    await asyncio.sleep(1)

    # Try dismissing again after any transitions
    try:
        await page.evaluate(DISMISS_AUTH)
    except:
        pass
    await asyncio.sleep(0.5)


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # --- PART 1: High-res screenshots for seedance.io ---
        print("[1/2] Capturing high-res screenshots...")
        context = await browser.new_context(
            viewport={"width": 375, "height": 812},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
        )

        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle")
        await asyncio.sleep(3)

        # Also capture the onboarding screen - it's actually good marketing material
        print("  [0/10] Onboarding screen (bonus)")
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "00_onboarding.png"), full_page=False)

        # Dismiss auth/onboarding
        await dismiss_and_setup(page)

        # Verify we can see the app
        is_app_visible = await page.evaluate("""
            (() => {
                var vocab = document.getElementById('vocab-section');
                var card = document.querySelector('.word-card');
                return {
                    vocabVisible: vocab ? getComputedStyle(vocab).display !== 'none' : false,
                    cardVisible: card ? getComputedStyle(card).display !== 'none' : false,
                    bodyHTML: document.body.innerHTML.substring(0, 300)
                };
            })()
        """)
        print(f"  App state: {is_app_visible}")

        # Screenshot 1: Main vocab card
        print("  [1/10] Vocabulary card")
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "01_vocab_card.png"), full_page=False)

        # Click Listen
        print("  [2/10] After Listen")
        try:
            listen_btns = await page.query_selector_all('button')
            for btn in listen_btns:
                text = await btn.text_content()
                if text and 'Listen' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "02_after_listen.png"), full_page=False)

        # Click Write
        print("  [3/10] Writing practice")
        try:
            btns = await page.query_selector_all('button')
            for btn in btns:
                text = await btn.text_content()
                if text and 'Write' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(2)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "03_writing.png"), full_page=False)

        # Click Next word
        print("  [4/10] Next word")
        try:
            btns = await page.query_selector_all('button')
            for btn in btns:
                text = await btn.text_content()
                if text and 'Next' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "04_next_word.png"), full_page=False)

        # Phrases section
        print("  [5/10] Phrases")
        try:
            await page.evaluate("switchSection('phrases')")
        except:
            pass
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "05_phrases.png"), full_page=False)

        # Story section
        print("  [6/10] Story")
        try:
            await page.evaluate("switchSection('story')")
        except:
            pass
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "06_story.png"), full_page=False)

        # Back to vocab, scroll to features
        print("  [7/10] Features & stats")
        try:
            await page.evaluate("switchSection('vocab')")
        except:
            pass
        await asyncio.sleep(1)
        await page.evaluate("window.scrollTo({ top: 600, behavior: 'smooth' })")
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "07_features.png"), full_page=False)

        # Scroll to Pro upgrade card
        print("  [8/10] Pro upgrade card")
        await page.evaluate("window.scrollTo({ top: 1200, behavior: 'smooth' })")
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "08_pro_upgrade.png"), full_page=False)

        # Scroll further to HSK2 teaser
        print("  [9/10] HSK2 teaser")
        await page.evaluate("window.scrollTo({ top: 1800, behavior: 'smooth' })")
        await asyncio.sleep(1.5)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "09_hsk2_teaser.png"), full_page=False)

        # Full page
        print("  [10/10] Full page")
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
        await asyncio.sleep(1)
        await page.screenshot(path=os.path.join(OUTPUT_DIR, "full_page.png"), full_page=True)

        await context.close()
        print("  Screenshots done!")

        # --- PART 2: Video recording ---
        print("\n[2/2] Recording 15-second video walkthrough...")
        video_context = await browser.new_context(
            viewport={"width": 375, "height": 667},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            record_video_dir=OUTPUT_DIR,
            record_video_size={"width": 750, "height": 1334}
        )

        video_page = await video_context.new_page()
        await video_page.goto(URL, wait_until="networkidle")
        await asyncio.sleep(2)

        # Dismiss auth
        for selector in [
            'button:has-text("Get Started")',
            'button:has-text("Skip")',
            'a:has-text("I already have")',
        ]:
            try:
                await video_page.click(selector, timeout=1000)
                await asyncio.sleep(0.3)
            except:
                pass

        try:
            await video_page.evaluate(DISMISS_AUTH)
        except:
            pass
        await asyncio.sleep(1)

        # Scene 1: Show vocab card (2.5s)
        print("  Scene 1/6: Vocab card")
        await asyncio.sleep(2.5)

        # Scene 2: Click Listen (2s)
        print("  Scene 2/6: Listen")
        try:
            btns = await video_page.query_selector_all('button')
            for btn in btns:
                text = await btn.text_content()
                if text and 'Listen' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(2)

        # Scene 3: Click Write (2.5s)
        print("  Scene 3/6: Writing")
        try:
            btns = await video_page.query_selector_all('button')
            for btn in btns:
                text = await btn.text_content()
                if text and 'Write' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(2.5)

        # Scene 4: Next word (2s)
        print("  Scene 4/6: Next word")
        try:
            btns = await video_page.query_selector_all('button')
            for btn in btns:
                text = await btn.text_content()
                if text and 'Next' in text:
                    await btn.click()
                    break
        except:
            pass
        await asyncio.sleep(2)

        # Scene 5: Scroll to features (2.5s)
        print("  Scene 5/6: Features")
        await video_page.evaluate("window.scrollTo({ top: 500, behavior: 'smooth' })")
        await asyncio.sleep(2.5)

        # Scene 6: Scroll to Pro (2s)
        print("  Scene 6/6: Pro upgrade")
        await video_page.evaluate("window.scrollTo({ top: 1000, behavior: 'smooth' })")
        await asyncio.sleep(2)

        # Save video
        video_path = await video_page.video.path()
        await video_context.close()

        final_video = os.path.join(OUTPUT_DIR, "tiktok_walkthrough.webm")
        try:
            if os.path.exists(final_video):
                os.remove(final_video)
            if os.path.exists(video_path):
                os.rename(video_path, final_video)
                print(f"  Video saved: {final_video}")
        except Exception as e:
            print(f"  Video at: {video_path} (rename issue: {e})")

        await browser.close()

    print(f"\n=== TikTok Assets Ready! ===")
    print(f"Folder: {OUTPUT_DIR}")
    print(f"Files:")
    for f in sorted(os.listdir(OUTPUT_DIR)):
        size = os.path.getsize(os.path.join(OUTPUT_DIR, f))
        print(f"  {f} ({size//1024}KB)")
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
