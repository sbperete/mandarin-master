// --- CONSTANTS ---
const FREE_WORD_LIMIT = 25; // Free users can learn 25 words before paywall

// --- STATE MANAGEMENT ---
const state = {
    currentLevel: 1,
    currentWordIndex: 0,
    currentSection: 'vocab',
    progress: { vocabCompleted: false, phrasesCompleted: false, storyCompleted: false },
    writer: null,
    // Learning flow steps: listen → speak → write → next
    listenPassed: false,
    pronunciationPassed: false,
    writingPassed: false,
    currentStep: 1, // 1=listen, 2=speak, 3=write, 4=next
    canvasMode: 'trace', // 'trace' or 'free'
    micPermissionGranted: false,
    micPermissionAsked: false,
    user: JSON.parse(localStorage.getItem('vocab_user')) || null,
    isLoggedIn: false,
    isPremium: false,
    score: parseInt(localStorage.getItem('mm_score')) || 1250,
    failedStrokes: [],
    reviewMode: false,
    reviewIndex: 0
};

// Data References
const levelData = {
    1: typeof hsk1Data !== 'undefined' ? hsk1Data : null,
    2: typeof hsk2Data !== 'undefined' ? hsk2Data : null,
    3: typeof hsk3Data !== 'undefined' ? hsk3Data : null,
    4: typeof hsk4Data !== 'undefined' ? hsk4Data : null,
    5: typeof hsk5Data !== 'undefined' ? hsk5Data : null,
    6: typeof hsk6Data !== 'undefined' ? hsk6Data : null
};

// --- DOM ELEMENTS ---
const elements = {
    sidebarLinks: document.querySelectorAll('.nav-links li'),
    levelSelect: document.getElementById('level-select'),
    themeToggle: document.getElementById('theme-toggle'),
    sections: document.querySelectorAll('.content-section'),

    // Vocab Section
    vocabSection: document.getElementById('vocab-section'),
    pinyinDisplay: document.getElementById('pinyin-display'),
    englishDisplay: document.getElementById('english-display'),
    audioBtn: document.getElementById('audio-btn'),
    characterTarget: document.getElementById('character-target'),
    feedback: document.getElementById('feedback'),
    listenBtn: document.getElementById('listen-btn'),
    pronounceBtn: document.getElementById('pronounce-btn'),
    drawBtn: document.getElementById('draw-btn'),
    nextBtn: document.getElementById('next-btn'),
    progressText: document.getElementById('progress-text'),
    progressSegment: document.getElementById('progress-segment'),
    shareBtn: document.getElementById('share-btn'),

    // Step indicators
    stepListen: document.getElementById('step-listen'),
    stepSpeak: document.getElementById('step-speak'),
    stepWrite: document.getElementById('step-write'),
    stepNext: document.getElementById('step-next'),

    // Canvas mode
    canvasModeToggle: document.getElementById('canvas-mode-toggle'),
    modeTraceBtn: document.getElementById('mode-trace-btn'),
    modeFreeBtn: document.getElementById('mode-free-btn'),
    freeDrawWrapper: document.getElementById('free-draw-wrapper'),
    freeDrawCanvas: document.getElementById('free-draw-canvas'),
    clearCanvasBtn: document.getElementById('clear-canvas-btn'),

    // Other Sections
    phrasesList: document.getElementById('phrases-list'),
    storyTitle: document.getElementById('story-title'),
    storyContent: document.getElementById('story-content'),
    resourcesGrid: document.getElementById('resources-grid'),
    togglePinyinBtn: document.getElementById('toggle-pinyin-btn'),
    leaderboardList: document.getElementById('leaderboard-list'),

    // Mobile
    mobileLevelSelect: document.getElementById('mobile-level-select'),

    // Modals
    upgradeModal: document.getElementById('upgrade-modal'),
    upgradeTitle: document.getElementById('upgrade-title'),
    upgradeSubtitle: document.getElementById('upgrade-subtitle'),
    upgradeBtn: document.getElementById('upgrade-btn'),
    closeModals: document.querySelectorAll('.close-modal'),

    // Review mode
    reviewBtn: document.getElementById('review-btn'),
    reviewBar: document.getElementById('review-bar'),
    reviewSlider: document.getElementById('review-slider'),
    reviewPosition: document.getElementById('review-position'),
    reviewPrev: document.getElementById('review-prev'),
    reviewNext: document.getElementById('review-next'),
    reviewExit: document.getElementById('review-exit')
};

// --- SUBSCRIPTION & PAYPAL ---

function checkPremiumStatus() {
    var localPremium = localStorage.getItem('isPremium') === 'true';

    // Check localStorage first (fast path — existing users keep working)
    if (localPremium) {
        state.isPremium = true;
        unlockAllLevels();
    }

    // Sync with Supabase: check server, and back-fill if needed
    if (window.supabaseClient && state.isLoggedIn) {
        window.supabaseClient.auth.getUser().then(function(result) {
            if (result.data && result.data.user && result.data.user.user_metadata) {
                var meta = result.data.user.user_metadata;

                if (meta.is_premium === true) {
                    // Server says premium — trust it, update local
                    state.isPremium = true;
                    localStorage.setItem('isPremium', 'true');
                    unlockAllLevels();
                } else if (localPremium && !meta.is_premium) {
                    // LOCAL says premium but server doesn't know yet
                    // This covers EXISTING users who paid before the Supabase sync was added
                    // Back-fill their Supabase profile so it persists across devices
                    console.log('[Premium] Syncing existing premium status to Supabase...');
                    window.supabaseClient.auth.updateUser({
                        data: { is_premium: true, premium_since: new Date().toISOString(), source: 'legacy_sync' }
                    }).then(function() {
                        console.log('[Premium] Legacy premium synced to Supabase');
                    }).catch(function(err) {
                        console.warn('[Premium] Sync failed:', err);
                    });
                }
            }
        }).catch(function() { /* silent — localStorage fallback still works */ });
    }
}

// --- PROGRESS PERSISTENCE ---

function saveProgress() {
    // Save to localStorage (instant, offline-friendly)
    localStorage.setItem('mm_currentLevel', state.currentLevel);
    localStorage.setItem('mm_currentWordIndex', state.currentWordIndex);
    localStorage.setItem('mm_progress', JSON.stringify(state.progress));
    localStorage.setItem('mm_score', state.score);

    // Async sync to Supabase user_metadata (cross-device persistence)
    if (window.supabaseClient && state.isLoggedIn) {
        window.supabaseClient.auth.updateUser({
            data: {
                currentLevel: state.currentLevel,
                currentWordIndex: state.currentWordIndex,
                progress: state.progress,
                score: state.score,
                progress_updated_at: new Date().toISOString()
            }
        }).then(function() {
            console.log('[Progress] Synced to Supabase');
        }).catch(function(err) {
            console.warn('[Progress] Supabase sync failed:', err);
        });
    }
}

function restoreProgressFromLocal() {
    var savedLevel = parseInt(localStorage.getItem('mm_currentLevel'));
    var savedIndex = parseInt(localStorage.getItem('mm_currentWordIndex'));
    var savedProgress = localStorage.getItem('mm_progress');
    var savedScore = parseInt(localStorage.getItem('mm_score'));

    if (!isNaN(savedLevel) && savedLevel >= 1 && savedLevel <= 6) {
        state.currentLevel = savedLevel;
    }
    if (!isNaN(savedIndex) && savedIndex >= 0) {
        state.currentWordIndex = savedIndex;
    }
    if (savedProgress) {
        try {
            var parsed = JSON.parse(savedProgress);
            state.progress = {
                vocabCompleted: !!parsed.vocabCompleted,
                phrasesCompleted: !!parsed.phrasesCompleted,
                storyCompleted: !!parsed.storyCompleted
            };
        } catch (e) { /* ignore corrupt data */ }
    }
    if (!isNaN(savedScore)) {
        state.score = savedScore;
    }
}

function restoreProgressFromSupabase() {
    if (!window.supabaseClient || !state.isLoggedIn) return;

    window.supabaseClient.auth.getUser().then(function(result) {
        if (!result.data || !result.data.user || !result.data.user.user_metadata) return;
        var meta = result.data.user.user_metadata;

        // Only restore if Supabase has progress data
        if (typeof meta.currentWordIndex === 'number') {
            var supabaseIndex = meta.currentWordIndex || 0;
            var supabaseLevel = meta.currentLevel || 1;

            // Use Supabase data if it has more progress than local
            if (supabaseIndex > state.currentWordIndex || supabaseLevel > state.currentLevel) {
                state.currentLevel = supabaseLevel;
                state.currentWordIndex = supabaseIndex;
                if (meta.progress) {
                    state.progress = {
                        vocabCompleted: !!meta.progress.vocabCompleted,
                        phrasesCompleted: !!meta.progress.phrasesCompleted,
                        storyCompleted: !!meta.progress.storyCompleted
                    };
                }
                if (typeof meta.score === 'number' && meta.score > state.score) {
                    state.score = meta.score;
                }

                // Update localStorage with Supabase data
                localStorage.setItem('mm_currentLevel', state.currentLevel);
                localStorage.setItem('mm_currentWordIndex', state.currentWordIndex);
                localStorage.setItem('mm_progress', JSON.stringify(state.progress));
                localStorage.setItem('mm_score', state.score);

                // Re-render
                if (elements.levelSelect) elements.levelSelect.value = state.currentLevel;
                if (elements.mobileLevelSelect) elements.mobileLevelSelect.value = state.currentLevel;

                // Unlock sections based on progress
                if (state.progress.vocabCompleted) unlockSection('phrases');
                if (state.progress.phrasesCompleted) unlockSection('story');
                if (state.progress.storyCompleted) unlockSection('resources');

                loadWord(state.currentWordIndex);
                updateProgress();
                console.log('[Progress] Restored from Supabase: Level', state.currentLevel, 'Word', state.currentWordIndex);
            }
        } else if (state.currentWordIndex > 0) {
            // Local has progress but Supabase doesn't — back-fill
            console.log('[Progress] Back-filling Supabase from localStorage...');
            saveProgress();
        }
    }).catch(function(err) {
        console.warn('[Progress] Supabase restore failed:', err);
    });
}

function unlockAllLevels() {
    [elements.levelSelect, elements.mobileLevelSelect].forEach(sel => {
        if (!sel) return;
        Array.from(sel.options).forEach(opt => {
            opt.disabled = false;
            opt.textContent = opt.textContent.replace('🔒', '').trim();
        });
    });
}

let paypalButtonRendered = false;
function renderPayPalButton() {
    if (paypalButtonRendered) return;

    // Check if PayPal SDK is loaded
    if (typeof paypal === 'undefined') {
        console.error("PayPal SDK not loaded");
        const container = document.getElementById('paypal-button-container');
        if (container) container.innerHTML = "<p style='color:red; font-size:0.8em;'>PayPal Error: SDK failing to load locally.</p>";
        return;
    }

    paypal.Buttons({
        style: {
            shape: 'rect',
            color: 'gold',
            layout: 'vertical',
            label: 'pay'
        },
        createOrder: function (data, actions) {
            return actions.order.create({
                purchase_units: [{
                    description: "Mandarin Master — Lifetime Premium Access",
                    amount: {
                        currency_code: 'USD',
                        value: '9.99'
                    }
                }]
            });
        },
        onApprove: function (data, actions) {
            return actions.order.capture().then(function (details) {
                // Save premium status locally and to Supabase user metadata
                state.isPremium = true;
                localStorage.setItem('isPremium', 'true');

                // Persist to Supabase so premium survives across devices
                if (window.supabaseClient && state.user) {
                    window.supabaseClient.auth.updateUser({
                        data: { is_premium: true, premium_since: new Date().toISOString(), paypal_order_id: data.orderID }
                    }).then(function() {
                        console.log('[Premium] Saved to Supabase user metadata');
                    }).catch(function(err) {
                        console.warn('[Premium] Failed to save to Supabase:', err);
                    });
                }

                checkPremiumStatus();
                elements.upgradeModal.classList.add('hidden');
                alert('Welcome to Premium, ' + details.payer.name.given_name + '! All HSK levels are now unlocked.');
            });
        },
        onError: function (err) {
            console.error('PayPal Error:', err);
            alert("Payment failed. Please try again or contact support.");
        }
    }).render('#paypal-button-container');

    paypalButtonRendered = true;
}


// --- QUICK GUIDE ---
const Guide = {
    step: 0,
    active: localStorage.getItem('guide_skipped') !== 'true',
    el: null,
    steps: [
        { target: 'listen-btn', text: 'Step 1: Listen to the word', pos: 'bottom' },
        { target: 'pronounce-btn', text: 'Step 2: Now pronounce it', pos: 'bottom' },
        { target: 'draw-btn', text: 'Step 3: Draw the character', pos: 'bottom' },
        { target: 'next-btn', text: 'Step 4: Move to next word', pos: 'bottom' }
    ],
    init() {
        window.addEventListener('resize', this.updatePos.bind(this));
        window.addEventListener('scroll', this.updatePos.bind(this), true);
    },
    showStep(stepIndex) {
        if (!this.active) return;
        this.step = stepIndex;
        if (this.step >= this.steps.length) {
            this.finish();
            return;
        }
        
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.className = 'quick-guide-overlay';
            document.body.appendChild(this.el);
        }
        
        const current = this.steps[this.step];
        this.el.innerHTML = `${current.text} <button onclick="Guide.skip()" class="quick-guide-skip">Skip</button>`;
        this.el.setAttribute('data-pos', current.pos);
        this.updatePos();
    },
    updatePos() {
        if (!this.active || !this.el || this.step >= this.steps.length) return;
        const current = this.steps[this.step];
        const targetEl = document.getElementById(current.target);
        if (!targetEl || targetEl.disabled || targetEl.style.display === 'none') {
            this.el.style.display = 'none';
            return;
        }
        this.el.style.display = 'block';
        const rect = targetEl.getBoundingClientRect();
        
        if (current.pos === 'top') {
            this.el.style.left = (rect.left + rect.width / 2 - this.el.offsetWidth / 2) + 'px';
            this.el.style.top = (rect.top - this.el.offsetHeight - 15) + 'px';
        } else {
            this.el.style.left = (rect.left + rect.width / 2 - this.el.offsetWidth / 2) + 'px';
            this.el.style.top = (rect.bottom + 15) + 'px';
        }
    },
    skip() {
        this.active = false;
        if (this.el) this.el.remove();
        localStorage.setItem('guide_skipped', 'true');
    },
    finish() {
        this.active = false;
        if (this.el) this.el.remove();
        localStorage.setItem('guide_skipped', 'true');
    }
};
window.Guide = Guide;

// --- INITIALIZATION ---
function init() {
    loadThemePreference();
    Guide.init();
    setupEventListeners();
    setupAuthListeners();
    checkPremiumStatus();
    restoreProgressFromLocal();

    // Daily Mode Check
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'daily') {
        state.isLoggedIn = true;
        startDailyMode();
        return;
    }

    // Restore mic permission state from session
    if (sessionStorage.getItem('mm_mic_granted') === 'true') {
        state.micPermissionGranted = true;
        state.micPermissionAsked = true;
    }

    // Explicit auth gate: if no user, force auth modal + blur content
    document.body.classList.add('auth-required');
    if (window.auth) {
        window.auth.getUser().then(function(user) {
            if (!user) {
                document.body.classList.add('auth-required');
                if (window.AuthModal) {
                    window.AuthModal.isClosable = false;
                    var closeBtn = document.getElementById('am-close-btn');
                    if (closeBtn) closeBtn.style.display = 'none';
                    window.AuthModal.show('signin');
                }
            } else {
                document.body.classList.remove('auth-required');
            }
        });
    }
}

function setupEventListeners() {
    elements.sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.dataset.section;
            if (link.classList.contains('locked')) return;
            switchSection(section);
        });
    });

    elements.levelSelect.addEventListener('change', (e) => {
        const level = parseInt(e.target.value);
        if (level >= 2 && !state.isPremium) {
            e.target.value = state.currentLevel;
            showPaywall();
            return;
        }
        loadLevel(level);
    });

    elements.themeToggle.addEventListener('click', toggleTheme);

    // Mobile level selector
    if (elements.mobileLevelSelect) {
        elements.mobileLevelSelect.addEventListener('change', (e) => {
            const level = parseInt(e.target.value);
            if (level >= 2 && !state.isPremium) {
                e.target.value = state.currentLevel;
                showPaywall();
                return;
            }
            elements.levelSelect.value = level;
            loadLevel(level);
        });
    }

    // --- Learning Flow Buttons ---
    elements.listenBtn.addEventListener('click', handleListen);
    elements.pronounceBtn.addEventListener('click', handlePronounce);
    elements.drawBtn.addEventListener('click', handleDraw);
    elements.nextBtn.addEventListener('click', handleNextWord);

    // Audio button (quick replay, doesn't affect flow)
    elements.audioBtn.addEventListener('click', () => {
        const word = getCurrentWord();
        if (word) speak(word.chinese);
    });

    elements.togglePinyinBtn.addEventListener('click', () => {
        const pinyins = document.querySelectorAll('.story-line .pinyin');
        pinyins.forEach(el => el.style.display = el.style.display === 'none' ? 'block' : 'none');
    });

    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', handleShare);
    }

    // --- Canvas Mode Toggle ---
    if (elements.modeTraceBtn) {
        elements.modeTraceBtn.addEventListener('click', () => setCanvasMode('trace'));
    }
    if (elements.modeFreeBtn) {
        elements.modeFreeBtn.addEventListener('click', () => setCanvasMode('free'));
    }
    if (elements.clearCanvasBtn) {
        elements.clearCanvasBtn.addEventListener('click', clearFreeDrawCanvas);
    }

    // --- Free Draw Canvas Setup ---
    setupFreeDrawCanvas();

    // --- Review Mode ---
    if (elements.reviewBtn) {
        elements.reviewBtn.addEventListener('click', function() {
            if (state.reviewMode) exitReviewMode();
            else enterReviewMode();
        });
    }
    if (elements.reviewSlider) {
        elements.reviewSlider.addEventListener('input', function(e) {
            state.reviewIndex = parseInt(e.target.value);
            loadReviewWord();
        });
    }
    if (elements.reviewPrev) {
        elements.reviewPrev.addEventListener('click', function() {
            if (state.reviewIndex > 0) {
                state.reviewIndex--;
                loadReviewWord();
            }
        });
    }
    if (elements.reviewNext) {
        elements.reviewNext.addEventListener('click', function() {
            if (state.reviewIndex < state.currentWordIndex - 1) {
                state.reviewIndex++;
                loadReviewWord();
            }
        });
    }
    if (elements.reviewExit) {
        elements.reviewExit.addEventListener('click', exitReviewMode);
    }

    // --- Mobile Settings Panel ---
    var settingsBtn = document.getElementById('mobile-settings-btn');
    var settingsPanel = document.getElementById('mobile-settings-panel');
    if (settingsBtn && settingsPanel) {
        // Populate panel with theme + auth controls
        settingsPanel.innerHTML = '<button id="mobile-theme-toggle" class="theme-btn mobile-theme-btn">☀️ Light Mode</button>' +
            '<button class="sidebar-auth-btn mobile-signout-btn" onclick="auth.signOut()">Sign Out</button>';

        var mobileThemeBtn = document.getElementById('mobile-theme-toggle');
        if (mobileThemeBtn) {
            mobileThemeBtn.addEventListener('click', function() {
                elements.themeToggle.click(); // delegate to main toggle
                var isLight = document.body.classList.contains('light-mode');
                mobileThemeBtn.textContent = isLight ? '🌙 Dark Mode' : '☀️ Light Mode';
                settingsPanel.classList.remove('open');
            });
        }

        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsPanel.classList.toggle('open');
        });
        document.addEventListener('click', function() {
            settingsPanel.classList.remove('open');
        });
    }
}

// --- FREE DRAW CANVAS ---
function setupFreeDrawCanvas() {
    const canvas = elements.freeDrawCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 260 * dpr;
    canvas.height = 260 * dpr;
    canvas.style.width = '260px';
    canvas.style.height = '260px';
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#333';

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    canvas.addEventListener('mousedown', (e) => { drawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', () => { drawing = false; });
    canvas.addEventListener('mouseleave', () => { drawing = false; });

    // Touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener('touchend', () => { drawing = false; });
}

function clearFreeDrawCanvas() {
    const canvas = elements.freeDrawCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, 260 * dpr, 260 * dpr);
}

function setCanvasMode(mode) {
    state.canvasMode = mode;
    if (elements.modeTraceBtn) elements.modeTraceBtn.classList.toggle('active', mode === 'trace');
    if (elements.modeFreeBtn) elements.modeFreeBtn.classList.toggle('active', mode === 'free');

    if (mode === 'free') {
        if (elements.freeDrawWrapper) elements.freeDrawWrapper.style.display = '';
        // Update free draw stroke color based on theme
        const canvas = elements.freeDrawCanvas;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = document.body.classList.contains('light-mode') ? '#333' : '#ecf0f1';
        }
    } else {
        if (elements.freeDrawWrapper) elements.freeDrawWrapper.style.display = 'none';
    }
}

// --- MIC PERMISSION (one-time on login) ---
async function requestMicPermission() {
    if (state.micPermissionGranted || state.micPermissionAsked) return;
    state.micPermissionAsked = true;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Got permission — stop the stream immediately, we just needed the grant
        stream.getTracks().forEach(track => track.stop());
        state.micPermissionGranted = true;
        sessionStorage.setItem('mm_mic_granted', 'true');
        console.log('[Mandarin Master] Mic permission granted');
    } catch (err) {
        console.warn('[Mandarin Master] Mic permission denied or unavailable:', err.message);
        state.micPermissionGranted = false;
    }
}

// --- LISTEN STEP ---
function handleListen() {
    const word = getCurrentWord();
    if (!word) return;

    elements.listenBtn.disabled = true;
    elements.listenBtn.textContent = '🔊 Playing...';
    elements.feedback.textContent = 'Listen carefully to the pronunciation...';
    elements.feedback.className = 'feedback';

    // Play TTS
    const utterance = new SpeechSynthesisUtterance(word.chinese);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.8;

    utterance.onend = () => {
        state.listenPassed = true;
        state.currentStep = 2;
        elements.listenBtn.textContent = '✅ Listened';
        elements.feedback.textContent = '✅ Good! Now try to pronounce it yourself.';
        elements.feedback.className = 'feedback success';
        updateControlStates();
        updateStepIndicators();
        if (Guide.step === 0 && Guide.active) setTimeout(() => Guide.showStep(1), 500);
    };

    utterance.onerror = () => {
        // Fallback: mark as passed even if TTS fails
        state.listenPassed = true;
        state.currentStep = 2;
        elements.listenBtn.textContent = '✅ Listened';
        updateControlStates();
        updateStepIndicators();
    };

    speechSynthesis.speak(utterance);
}

function setupAuthListeners() {
    // Close upgrade modal
    if (elements.closeModals) {
        elements.closeModals.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.upgradeModal.classList.add('hidden');
            });
        });
    }

    // Upgrade button
    if (elements.upgradeBtn) {
        elements.upgradeBtn.addEventListener('click', () => {
            elements.upgradeModal.classList.remove('hidden');
            renderPayPalButton();
        });
    }

    // Listen for Supabase auth state changes (from js/auth.js)
    window.addEventListener('auth-state-changed', (e) => {
        const user = e.detail ? e.detail.user : null;
        if (user) {
            state.user = user;
            state.isLoggedIn = true;
            document.body.classList.remove('auth-required');
            if (window.AuthModal && window.AuthModal.isClosable === false) {
                window.AuthModal.isClosable = true;
                const closeBtn = document.getElementById('am-close-btn');
                if (closeBtn) closeBtn.style.display = '';
                window.AuthModal.hide();
            }
            restoreProgressFromLocal();
            loadLevel(state.currentLevel || 1, true);
            restoreProgressFromSupabase();

            // Request mic permission once after login (delayed to avoid overwhelming)
            if (!state.micPermissionAsked) {
                setTimeout(() => requestMicPermission(), 2000);
            }
        } else {
            state.user = null;
            state.isLoggedIn = false;
            document.body.classList.add('auth-required');
            if (window.AuthModal) {
                window.AuthModal.isClosable = false;
                const closeBtn = document.getElementById('am-close-btn');
                if (closeBtn) closeBtn.style.display = 'none';
                window.AuthModal.show('signin');
            }
        }
    });
}

// --- CORE LOGIC ---

function showPaywall() {
    // Update upgrade modal messaging
    if (elements.upgradeTitle) elements.upgradeTitle.textContent = 'Unlock Full Access 👑';
    if (elements.upgradeSubtitle) {
        const data = getCurrentData();
        const total = data ? data.vocab.length : 150;
        elements.upgradeSubtitle.textContent = "You've mastered " + FREE_WORD_LIMIT + " words! Upgrade to unlock all " + total + " HSK" + state.currentLevel + " words plus HSK 2-6.";
    }
    elements.upgradeModal.classList.remove('hidden');
    renderPayPalButton();
}

function loadLevel(level, restoreSaved) {
    if (level > 1 && !state.isPremium) { showPaywall(); return; }
    state.currentLevel = level;

    if (!restoreSaved) {
        state.currentWordIndex = 0;
        state.progress = { vocabCompleted: false, phrasesCompleted: false, storyCompleted: false };
    }

    resetLocks();

    // Unlock sections based on restored progress
    if (state.progress.vocabCompleted) unlockSection('phrases');
    if (state.progress.phrasesCompleted) unlockSection('story');
    if (state.progress.storyCompleted) unlockSection('resources');

    const data = levelData[level];
    if (!data) {
        if (level > 2) { alert("Coming soon!"); return; }
    }
    loadWord(state.currentWordIndex);
    renderPhrases();
    renderStory();
    renderResources();
    renderLeaderboard();
    switchSection('vocab');
}

function resetLocks() {
    elements.sidebarLinks.forEach(link => {
        if (link.dataset.section === 'vocab') link.classList.remove('locked');
        else if (link.dataset.section !== 'leaderboard') link.classList.add('locked');
    });
}

function unlockSection(sectionName) {
    const link = document.querySelector(`.nav-links li[data-section="${sectionName}"]`);
    if (link) link.classList.remove('locked');
}

function switchSection(sectionName) {
    state.currentSection = sectionName;
    elements.sidebarLinks.forEach(link => { link.classList.toggle('active', link.dataset.section === sectionName); });
    elements.sections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(`${sectionName}-section`).classList.add('active');
}

// --- VOCABULARY LOGIC ---

function getCurrentData() { return levelData[state.currentLevel]; }
function getCurrentWord() { const data = getCurrentData(); if (!data || !data.vocab) return null; return data.vocab[state.currentWordIndex]; }

function loadWord(index) {
    const word = getCurrentWord();
    if (!word) return;

    elements.pinyinDisplay.textContent = word.pinyin;
    elements.englishDisplay.textContent = word.english;
    elements.feedback.textContent = "Press Listen to hear the word.";
    elements.feedback.className = 'feedback';

    const visualContainer = document.getElementById('visual-aid-container');
    const visualImg = document.getElementById('visual-aid-img');
    if (word.image && visualContainer && visualImg) {
        visualImg.src = word.image;
        visualContainer.classList.remove('hidden');
    } else if (visualContainer) { visualContainer.classList.add('hidden'); }

    // Reset all step states
    state.listenPassed = false;
    state.pronunciationPassed = false;
    state.writingPassed = false;
    state.currentStep = 1;
    state.failedStrokes = [];

    // Reset button labels
    if (elements.listenBtn) elements.listenBtn.textContent = '🔊 Listen';
    if (elements.pronounceBtn) elements.pronounceBtn.textContent = '🎙️ Speak';

    updateControlStates();
    updateStepIndicators();

    // Reset canvas mode
    setCanvasMode('trace');
    clearFreeDrawCanvas();

    elements.characterTarget.innerHTML = '';

    // Determine stroke/outline colors based on theme
    const isLight = document.body.classList.contains('light-mode');
    const strokeColor = isLight ? '#333' : '#ccc';
    const drawingColor = isLight ? '#333' : '#ecf0f1';

    // Create HanziWriter with guided trace (responsive size)
    var writerSize = window.innerWidth <= 480 ? 150 : (window.innerWidth <= 768 ? 180 : 260);
    state.writer = HanziWriter.create('character-target', word.chinese, {
        width: writerSize, height: writerSize, padding: 5,
        showOutline: true,
        outlineColor: '#ff4444',
        strokeColor: strokeColor,
        drawingColor: drawingColor,
        delayBetweenStrokes: 0,
        radicalsColor: '#337ab7'
    });
    updateProgress();
    updateReviewButtonVisibility();
    if (index === 0 && Guide.active) { setTimeout(() => Guide.showStep(0), 1000); }
}

function updateControlStates() {
    // Sequential: Listen → Speak → Write → Next
    elements.listenBtn.disabled = state.listenPassed;
    elements.pronounceBtn.disabled = !state.listenPassed || state.pronunciationPassed;
    elements.drawBtn.disabled = !state.pronunciationPassed || state.writingPassed;
    elements.nextBtn.disabled = !state.writingPassed;

    // Show canvas mode toggle only when write step is active
    if (elements.canvasModeToggle) {
        elements.canvasModeToggle.style.display = state.pronunciationPassed && !state.writingPassed ? '' : 'none';
    }
}

function updateStepIndicators() {
    const steps = [
        { el: elements.stepListen, done: state.listenPassed, step: 1 },
        { el: elements.stepSpeak, done: state.pronunciationPassed, step: 2 },
        { el: elements.stepWrite, done: state.writingPassed, step: 3 },
        { el: elements.stepNext, done: false, step: 4 }
    ];
    steps.forEach(s => {
        if (!s.el) return;
        s.el.classList.remove('active', 'completed');
        const numEl = s.el.querySelector('.step-number');
        if (s.done) {
            s.el.classList.add('completed');
            if (numEl) numEl.textContent = '✓';
        } else {
            if (numEl) numEl.textContent = s.step;
            if (s.step === state.currentStep) {
                s.el.classList.add('active');
            }
        }
    });
}
function updateProgress() {
    const total = getCurrentData().vocab.length;
    const current = state.currentWordIndex;
    const pct = (current / total) * 100;
    elements.progressSegment.style.width = `${pct}%`;
    elements.progressText.textContent = `${current}/${total} Words`;
}

function handlePronounce() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        // No speech recognition available — auto-pass
        elements.feedback.textContent = "⚠️ Speech recognition not available. Auto-passed.";
        elements.feedback.className = 'feedback warning';
        state.pronunciationPassed = true;
        state.currentStep = 3;
        elements.pronounceBtn.textContent = '✅ Spoken';
        updateControlStates();
        updateStepIndicators();
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    elements.pronounceBtn.textContent = '🎙️ Listening...';
    elements.pronounceBtn.disabled = true;
    elements.feedback.textContent = 'Listening... speak now!';
    elements.feedback.className = 'feedback';

    recognition.start();

    recognition.onresult = (event) => {
        const word = getCurrentWord();
        if (!word) return;
        const target = word.chinese;

        // Check all alternatives for a match
        let matched = false;
        for (let i = 0; i < event.results[0].length; i++) {
            const transcript = event.results[0][i].transcript.trim();
            if (transcript.includes(target) || target.includes(transcript) || transcript === target) {
                matched = true;
                break;
            }
        }

        if (matched) {
            elements.feedback.textContent = "✅ Great pronunciation! Now write the character.";
            elements.feedback.className = 'feedback success';
            state.pronunciationPassed = true;
            state.currentStep = 3;
            elements.pronounceBtn.textContent = '✅ Spoken';
            if (Guide.step === 1 && Guide.active) setTimeout(() => Guide.showStep(2), 500);
        } else {
            const heard = event.results[0][0].transcript;
            elements.feedback.textContent = `❌ Heard "${heard}". Try again!`;
            elements.feedback.className = 'feedback error';
            elements.pronounceBtn.disabled = false;
            elements.pronounceBtn.textContent = '🎙️ Retry';
        }
        updateControlStates();
        updateStepIndicators();
    };

    recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
            elements.feedback.textContent = "⚠️ Mic access denied. Auto-passed.";
            elements.feedback.className = 'feedback warning';
            state.pronunciationPassed = true;
            state.currentStep = 3;
            elements.pronounceBtn.textContent = '✅ Spoken';
        } else {
            elements.feedback.textContent = "⚠️ Could not hear you. Try again.";
            elements.feedback.className = 'feedback warning';
            elements.pronounceBtn.disabled = false;
            elements.pronounceBtn.textContent = '🎙️ Retry';
        }
        updateControlStates();
        updateStepIndicators();
    };

    recognition.onnomatch = () => {
        elements.feedback.textContent = "❌ Didn't catch that. Try again!";
        elements.feedback.className = 'feedback error';
        elements.pronounceBtn.disabled = false;
        elements.pronounceBtn.textContent = '🎙️ Retry';
    };
}

function handleDraw() {
    // Show canvas mode toggle when entering write step
    if (elements.canvasModeToggle) elements.canvasModeToggle.style.display = '';

    state.writer.showOutline();
    state.writer.quiz({
        onMistake: function (strokeData) {
            if (!state.failedStrokes.includes(strokeData.strokeNum)) {
                state.failedStrokes.push(strokeData.strokeNum);
            }
            elements.feedback.textContent = "❌ Retry that stroke.";
            elements.feedback.className = 'feedback error';
        },
        onCorrectStroke: function (strokeData) {
            const isSecondAttempt = state.failedStrokes.includes(strokeData.strokeNum);
            elements.feedback.textContent = isSecondAttempt ? "⚠️ Good correction." : "✅ Perfect stroke!";
            elements.feedback.className = isSecondAttempt ? 'feedback warning' : 'feedback success';
        },
        onComplete: () => {
            state.writingPassed = true;
            state.currentStep = 4;
            if (!state.reviewMode) {
                elements.feedback.textContent = "✅ Character complete! Press Next.";
                elements.feedback.className = 'feedback success';
                state.score += 50;
                saveProgress();
            } else {
                elements.feedback.textContent = "✅ Great review! Try another word.";
                elements.feedback.className = 'feedback success';
            }
            updateControlStates();
            updateStepIndicators();
            renderLeaderboard();
            if (Guide.step === 2 && Guide.active) setTimeout(() => Guide.showStep(3), 500);
        }
    });
}

function handleNextWord() {
    if (Guide.step === 3 && Guide.active) Guide.finish();
    const total = getCurrentData().vocab.length;
    if (state.currentWordIndex < total - 1) {
        state.currentWordIndex++;

        // PAYWALL: After reaching free limit, require premium
        if (state.currentWordIndex >= FREE_WORD_LIMIT && !state.isPremium) {
            showPaywall();
            return;
        }

        loadWord(state.currentWordIndex);
        saveProgress();
    } else {
        elements.feedback.textContent = "🎉 Level Vocabulary Completed! Phrases Unlocked.";
        elements.feedback.className = 'feedback success';
        state.progress.vocabCompleted = true;
        state.score += 500;
        unlockSection('phrases');
        switchSection('phrases');
        renderLeaderboard();
        saveProgress();
    }
}

function handleShare() {
    // Target the wrapper which contains the Pinyin/Char info AND the canvas
    const captureTarget = document.querySelector('.learning-content-wrapper');

    // Temporarily add a watermark for the "User Profile" effect
    const watermark = document.createElement('div');
    watermark.style.cssText = 'position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; z-index: 100; pointer-events: none;';
    watermark.innerText = `Score: ${state.score} | Mandarin Master`;

    // Ensure relative positioning for watermark
    const originalPosition = captureTarget.style.position;
    captureTarget.style.position = 'relative';
    captureTarget.appendChild(watermark);

    html2canvas(captureTarget, {
        backgroundColor: '#2c3e50', // Ensure dark background is captured (matches theme)
        scale: 2 // Higher quality
    }).then(canvas => {
        // Cleanup
        captureTarget.removeChild(watermark);
        captureTarget.style.position = originalPosition;

        // Convert and Download
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `mandarin-mastery-share-${Date.now()}.png`;
        link.href = image;
        link.click();

        alert("📸 Captured! Your learning card is ready to share.");
    }).catch(err => {
        console.error("Capture failed:", err);
        alert("Ops! Could not capture image.");
        if (captureTarget.contains(watermark)) captureTarget.removeChild(watermark);
        captureTarget.style.position = originalPosition;
    });
}

// --- REVIEW MODE ---

function enterReviewMode() {
    if (state.currentWordIndex < 1) return;
    state.reviewMode = true;
    state.reviewIndex = state.currentWordIndex - 1;

    if (elements.reviewBar) elements.reviewBar.style.display = 'flex';
    if (elements.reviewBtn) {
        elements.reviewBtn.textContent = '📖 Reviewing...';
        elements.reviewBtn.classList.add('active');
    }

    if (elements.reviewSlider) {
        elements.reviewSlider.min = 0;
        elements.reviewSlider.max = state.currentWordIndex - 1;
        elements.reviewSlider.value = state.reviewIndex;
    }

    if (elements.nextBtn) elements.nextBtn.style.display = 'none';
    loadReviewWord();
}

function exitReviewMode() {
    state.reviewMode = false;

    if (elements.reviewBar) elements.reviewBar.style.display = 'none';
    if (elements.reviewBtn) {
        elements.reviewBtn.textContent = '🔄 Review';
        elements.reviewBtn.classList.remove('active');
    }
    if (elements.nextBtn) elements.nextBtn.style.display = '';

    loadWord(state.currentWordIndex);
}

function loadReviewWord() {
    var data = getCurrentData();
    if (!data || !data.vocab) return;
    var word = data.vocab[state.reviewIndex];
    if (!word) return;

    elements.pinyinDisplay.textContent = word.pinyin;
    elements.englishDisplay.textContent = word.english;
    elements.feedback.textContent = 'Review mode — practice without affecting progress.';
    elements.feedback.className = 'feedback';

    if (elements.reviewPosition) {
        elements.reviewPosition.textContent = (state.reviewIndex + 1) + '/' + state.currentWordIndex;
    }
    if (elements.reviewSlider) {
        elements.reviewSlider.value = state.reviewIndex;
    }

    // Reset step states for practice
    state.listenPassed = false;
    state.pronunciationPassed = false;
    state.writingPassed = false;
    state.currentStep = 1;
    state.failedStrokes = [];

    if (elements.listenBtn) elements.listenBtn.textContent = '🔊 Listen';
    if (elements.pronounceBtn) elements.pronounceBtn.textContent = '🎙️ Speak';

    updateControlStates();
    updateStepIndicators();
    setCanvasMode('trace');
    clearFreeDrawCanvas();

    elements.characterTarget.innerHTML = '';
    var isLight = document.body.classList.contains('light-mode');
    var strokeColor = isLight ? '#333' : '#ccc';
    var drawingColor = isLight ? '#333' : '#ecf0f1';
    var writerSize = window.innerWidth <= 480 ? 150 : (window.innerWidth <= 768 ? 180 : 260);
    state.writer = HanziWriter.create('character-target', word.chinese, {
        width: writerSize, height: writerSize, padding: 5,
        showOutline: true, outlineColor: '#ff4444',
        strokeColor: strokeColor, drawingColor: drawingColor,
        delayBetweenStrokes: 0, radicalsColor: '#337ab7'
    });
}

function updateReviewButtonVisibility() {
    if (elements.reviewBtn) {
        elements.reviewBtn.style.display = state.currentWordIndex > 0 ? '' : 'none';
    }
}

// --- OTHER ---

function renderPhrases() {
    const data = getCurrentData(); if (!data.phrases) return;
    elements.phrasesList.innerHTML = data.phrases.map(p => `
        <div class="phrase-item">
            <div class="phrase-content"><h3>${p.chinese}</h3><p>${p.pinyin} - ${p.english}</p></div>
            <button class="icon-btn" onclick="speak('${p.chinese}')">🔊</button>
        </div>`).join('');
    setTimeout(() => { unlockSection('story'); }, 1000);
}

function renderStory() {
    const data = getCurrentData(); if (!data.story) return;
    elements.storyTitle.textContent = data.story.title;
    elements.storyContent.innerHTML = data.story.content.map(line => `
        <div class="story-line" onclick="speak('${line.chinese}')"><span class="pinyin">${line.pinyin}</span><span class="chinese">${line.chinese}</span><span class="english">${line.english}</span></div>`).join('');
    setTimeout(() => { unlockSection('resources'); }, 1000);
}

function renderResources() {
    const data = getCurrentData();
    elements.resourcesGrid.innerHTML = '';
    if (data.resources) {
        elements.resourcesGrid.innerHTML += data.resources.map(r => `
            <a href="${r.link}" target="_blank" class="resource-card"><span class="resource-tag">${r.platform}</span><h3>${r.title}</h3><p>${r.description}</p></a>`).join('');
    }
    if (data.memoryPalace) {
        elements.resourcesGrid.innerHTML += `<div class="resource-card" style="border-color: var(--accent-color);"><span class="resource-tag">Memory Palace</span><h3>Level Review</h3><p>${data.memoryPalace.description}</p><img src="${data.memoryPalace.image}" style="width:100%; border-radius:8px; margin-top:10px;"></div>`;
    }
}

function renderLeaderboard() {
    if (!elements.leaderboardList) return;

    // Mock Data randomized slightly
    const users = [
        { name: "You", score: state.score, yours: true },
        { name: "Li Hua", score: 2400, yours: false },
        { name: "Sarah J.", score: 1850, yours: false },
        { name: "Mike Chen", score: 1200, yours: false },
        { name: "Anna K.", score: 950, yours: false }
    ];

    // Sort
    users.sort((a, b) => b.score - a.score);

    elements.leaderboardList.innerHTML = users.map((u, index) => `
        <div class="leaderboard-item ${u.yours ? 'highlight' : ''}">
            <div class="rank">#${index + 1}</div>
            <div class="user-info">
                <h4>${u.name} ${u.yours ? '(Me)' : ''}</h4>
                <span>HSK ${u.yours ? state.currentLevel : Math.floor(Math.random() * 3) + 1} Learner</span>
            </div>
            <div class="score">${u.score} XP</div>
        </div>
    `).join('');
}

function speak(text) { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 0.85; speechSynthesis.speak(u); }

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    document.body.classList.toggle('dark-mode', !isLight);
    localStorage.setItem('mm_theme', isLight ? 'light' : 'dark');
    const btn = elements.themeToggle;
    if (btn) btn.textContent = isLight ? '🌙 Dark Mode' : '☀️ Light Mode';
    if (state.writer) loadWord(state.currentWordIndex);
}

function loadThemePreference() {
    const saved = localStorage.getItem('mm_theme') || 'dark';
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
        if (elements.themeToggle) elements.themeToggle.textContent = '🌙 Dark Mode';
    } else {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        if (elements.themeToggle) elements.themeToggle.textContent = '☀️ Light Mode';
    }
}

window.speak = speak;

// --- DAILY CHALLENGE MODE ---
async function startDailyMode() {
    console.log("🎬 Starting Daily Mode...");
    const data = levelData[1]; // Default to HSK 1
    if (!data) return;

    // Select 3 Words, 3 Phrases, 1 Story Line
    const words = data.vocab.slice(0, 3);
    const phrases = data.phrases ? data.phrases.slice(0, 3) : [];
    const story = data.story ? data.story.content.slice(0, 1) : [];

    elements.vocabSection.classList.add('active');

    // Auto-Play Words
    for (let i = 0; i < words.length; i++) {
        loadWord(i);
        elements.feedback.textContent = `Daily Word ${i + 1}/3`;
        speak(words[i].chinese);
        await new Promise(r => setTimeout(r, 4000));

        if (state.writer) {
            state.writer.animateCharacter();
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // Phrases
    switchSection('phrases');
    elements.phrasesList.innerHTML = phrases.map(p => `
        <div class="phrase-item" style="font-size:1.5em; text-align:center;">
            <div style="width:100%"><h3>${p.chinese}</h3><p>${p.english}</p></div>
        </div>`).join('');

    for (let p of phrases) {
        speak(p.chinese);
        await new Promise(r => setTimeout(r, 3000));
    }

    // Story
    switchSection('story');
    elements.storyContent.innerHTML = story.map(line => `
         <div class="story-line" style="font-size:2em;">${line.chinese}<br><span style="font-size:0.5em">${line.english}</span></div>`).join('');
    speak(story[0].chinese);
    await new Promise(r => setTimeout(r, 5000));

    window.dailySetComplete = true;
    document.body.innerHTML = "<div style='display:flex;justify-content:center;align-items:center;height:100vh;background:#111;color:#00BFA5;font-size:3em;'><h1>See you tomorrow! 👋</h1></div>";
}

init();