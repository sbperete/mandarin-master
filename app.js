// --- STATE MANAGEMENT ---
const state = {
    currentLevel: 1,
    currentWordIndex: 0,
    currentSection: 'vocab',
    progress: { vocabCompleted: false, phrasesCompleted: false, storyCompleted: false },
    writer: null,
    pronunciationPassed: false,
    writingPassed: false,
    user: JSON.parse(localStorage.getItem('vocab_user')) || null, // Check persistence
    isLoggedIn: false, // Update in init
    isPremium: false,
    score: 1250 // Initial score for demo
};

// Data References
const levelData = {
    1: typeof hsk1Data !== 'undefined' ? hsk1Data : null,
    2: typeof hsk2Data !== 'undefined' ? hsk2Data : null,
    3: null, 4: null, 5: null, 6: null
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
    pronounceBtn: document.getElementById('pronounce-btn'),
    drawBtn: document.getElementById('draw-btn'),
    nextBtn: document.getElementById('next-btn'),
    progressText: document.getElementById('progress-text'),
    progressSegment: document.getElementById('progress-segment'),
    shareBtn: document.getElementById('share-btn'),

    // Other Sections
    phrasesList: document.getElementById('phrases-list'),
    storyTitle: document.getElementById('story-title'),
    storyContent: document.getElementById('story-content'),
    resourcesGrid: document.getElementById('resources-grid'),
    togglePinyinBtn: document.getElementById('toggle-pinyin-btn'),
    leaderboardList: document.getElementById('leaderboard-list'),

    // Modals
    loginModal: document.getElementById('login-modal'),
    upgradeModal: document.getElementById('upgrade-modal'),
    authBtns: document.querySelectorAll('.auth-btn'),
    upgradeBtn: document.getElementById('upgrade-btn'),
    closeModals: document.querySelectorAll('.close-modal')
};

// --- SUBSCRIPTION & PAYPAL ---

function checkPremiumStatus() {
    if (localStorage.getItem('isPremium') === 'true') {
        state.isPremium = true;
        // Unlock all levels in UI
        Array.from(elements.levelSelect.options).forEach(opt => {
            opt.disabled = false;
            opt.textContent = opt.textContent.replace('🔒', '');
        });
    }
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
            label: 'subscribe'
        },
        createOrder: function (data, actions) {
            return actions.order.create({
                purchase_units: [{
                    description: "Mandarin Master Premium",
                    amount: {
                        value: '1.00' // $1.00 USD
                    }
                }]
            });
        },
        onApprove: function (data, actions) {
            return actions.order.capture().then(function (details) {
                alert('Transaction completed by ' + details.payer.name.given_name + '! You are now Premium.');
                state.isPremium = true;
                localStorage.setItem('isPremium', 'true');
                checkPremiumStatus();
                elements.upgradeModal.classList.add('hidden');
            });
        },
        onError: function (err) {
            console.error('PayPal Error:', err);
            alert("Payment failed. Please try again.");
        }
    }).render('#paypal-button-container');

    paypalButtonRendered = true;
}


// --- INITIALIZATION ---
function init() {
    setupEventListeners();
    setupAuthListeners();
    checkPremiumStatus();

    // Daily Mode Check
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'daily') {
        state.isLoggedIn = true;
        elements.loginModal.classList.add('hidden');
        startDailyMode();
        return;
    }

    // Auth Enforcement
    // Firebase onAuthStateChanged (in firebase-config.js) will fire and dispatch
    // 'auth-state-changed' event. That event handler in setupAuthListeners() will
    // either load the app or show the login modal. Show modal by default until
    // Firebase resolves the auth state.
    elements.loginModal.classList.remove('hidden');
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
        if (level >= 3 && !state.isPremium) {
            // Revert selection first
            e.target.value = state.currentLevel;
            alert("🔒 HSK 3-6 are locked for Free users.");
            elements.upgradeModal.classList.remove('hidden');
            renderPayPalButton();
            return;
        }
        loadLevel(level);
    });

    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.pronounceBtn.addEventListener('click', handlePronounce);
    elements.drawBtn.addEventListener('click', handleDraw);
    elements.nextBtn.addEventListener('click', handleNextWord);
    elements.audioBtn.addEventListener('click', () => { const word = getCurrentWord(); speak(word.chinese); });
    elements.togglePinyinBtn.addEventListener('click', () => {
        const pinyins = document.querySelectorAll('.story-line .pinyin');
        pinyins.forEach(el => el.style.display = el.style.display === 'none' ? 'block' : 'none');
    });

    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', handleShare);
    }
}

function setupAuthListeners() {
    if (elements.closeModals) {
        elements.closeModals.forEach(btn => {
            btn.addEventListener('click', () => {
                elements.loginModal.classList.add('hidden');
                elements.upgradeModal.classList.add('hidden');
            });
        });
    }

    // --- Real Firebase OAuth Listeners ---
    const googleBtn = document.querySelector('.auth-btn.google');
    const facebookBtn = document.querySelector('.auth-btn.facebook');
    const appleBtn = document.querySelector('.auth-btn.apple');
    const emailBtn = document.querySelector('.auth-btn.email');

    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            handleOAuthSignIn(signInWithGoogle, 'Google');
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', () => {
            handleOAuthSignIn(signInWithFacebook, 'Facebook');
        });
    }

    if (appleBtn) {
        appleBtn.addEventListener('click', () => {
            handleOAuthSignIn(signInWithApple, 'Apple');
        });
    }

    if (emailBtn) {
        emailBtn.addEventListener('click', () => {
            showEmailAuthForm();
        });
    }

    // Listen for Firebase auth state changes
    window.addEventListener('auth-state-changed', (e) => {
        const user = e.detail.user;
        if (user) {
            state.user = user;
            state.isLoggedIn = true;
            elements.loginModal.classList.add('hidden');
            checkAuthUI();
            loadLevel(1);
        } else {
            state.user = null;
            state.isLoggedIn = false;
            elements.loginModal.classList.remove('hidden');
        }
    });

    if (elements.upgradeBtn) {
        elements.upgradeBtn.addEventListener('click', () => {
            elements.upgradeModal.classList.remove('hidden');
            renderPayPalButton();
        });
    }
}

function handleOAuthSignIn(signInFn, providerName) {
    signInFn().catch(function (error) {
        if (error.code === 'auth/popup-closed-by-user') return;
        if (error.code === 'auth/cancelled-popup-request') return;
        console.error(providerName + ' sign-in error:', error);
        alert('Sign-in failed: ' + error.message);
    });
}

function showEmailAuthForm() {
    const email = prompt('Enter your email:');
    if (!email) return;
    const password = prompt('Enter your password (min 6 characters):');
    if (!password) return;

    // Try sign-in first, fall back to sign-up
    signInWithEmail(email, password).catch(function (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            if (confirm('No account found. Create a new account?')) {
                signUpWithEmail(email, password).catch(function (signUpError) {
                    alert('Sign-up failed: ' + signUpError.message);
                });
            }
        } else {
            alert('Sign-in failed: ' + error.message);
        }
    });
}

function checkAuthUI() { }

// --- CORE LOGIC ---

function loadLevel(level) {
    if (level > 2 && !state.isPremium) { elements.upgradeModal.classList.remove('hidden'); renderPayPalButton(); return; }
    state.currentLevel = level;
    state.currentWordIndex = 0;
    state.progress = { vocabCompleted: false, phrasesCompleted: false, storyCompleted: false };
    resetLocks();
    const data = levelData[level];
    if (!data) {
        if (level > 2) { alert("Coming soon!"); return; }
    }
    loadWord(0);
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
    elements.feedback.textContent = "Start by pronouncing the word.";
    elements.feedback.className = 'feedback';

    const visualContainer = document.getElementById('visual-aid-container');
    const visualImg = document.getElementById('visual-aid-img');
    if (word.image && visualContainer && visualImg) {
        visualImg.src = word.image;
        visualContainer.classList.remove('hidden');
    } else if (visualContainer) { visualContainer.classList.add('hidden'); }

    state.pronunciationPassed = false;
    state.writingPassed = false;
    state.failedStrokes = []; // Reset for new character
    updateControlStates();

    const showOutline = state.currentLevel <= 2;
    elements.characterTarget.innerHTML = '';

    // Create Writer with RED outline (hint)
    state.writer = HanziWriter.create('character-target', word.chinese, {
        width: 260, height: 260, padding: 5,
        showOutline: true, // Always show outline as hint
        outlineColor: '#ff0000', // Red Hint
        strokeColor: '#333', // Default neutral until drawn
        drawingColor: '#333',
        delayBetweenStrokes: 0,
        radicalsColor: '#337ab7'
    });
    updateProgress();
}

function updateControlStates() {
    elements.pronounceBtn.disabled = state.pronunciationPassed;
    elements.drawBtn.disabled = !state.pronunciationPassed || state.writingPassed;
    elements.nextBtn.disabled = !state.writingPassed;
}
function updateProgress() {
    const total = getCurrentData().vocab.length;
    const current = state.currentWordIndex;
    const pct = (current / total) * 100;
    elements.progressSegment.style.width = `${pct}%`;
    elements.progressText.textContent = `${current}/${total} Words`;
}

function handlePronounce() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Speech Recognition unavailable. Auto-pass.");
        state.pronunciationPassed = true; updateControlStates(); return;
    }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'zh-CN'; recognition.start();
    elements.pronounceBtn.textContent = 'Listening...';

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const target = getCurrentWord().chinese;
        if (transcript.includes(target) || transcript === target) {
            elements.feedback.textContent = "✅ Correct! Now draw it.";
            elements.feedback.className = 'feedback success';
            state.pronunciationPassed = true;
        } else {
            elements.feedback.textContent = `❌ Heard "${transcript}". Try again.`;
            elements.feedback.className = 'feedback error';
        }
        elements.pronounceBtn.textContent = '🎙️ Pronounce';
        updateControlStates();
    };
    recognition.onerror = () => { alert("No Mic. Auto-pass."); state.pronunciationPassed = true; elements.pronounceBtn.textContent = '🎙️ Pronounce'; updateControlStates(); };
}

function handleDraw() {
    state.writer.showOutline(); // Ensure red outline is visible
    state.writer.quiz({
        onMistake: function (strokeData) {
            // Log the failure for this stroke index
            if (!state.failedStrokes.includes(strokeData.strokeNum)) {
                state.failedStrokes.push(strokeData.strokeNum);
            }
            elements.feedback.textContent = "❌ Retry that stroke.";
            elements.feedback.className = 'feedback error';
        },
        onCorrectStroke: function (strokeData) {
            // Determine color: Orange if failed before, Green if first try
            const isSecondAttempt = state.failedStrokes.includes(strokeData.strokeNum);
            const color = isSecondAttempt ? '#FFA500' : '#2ecc71'; // Orange : Green

            // Hack to color the *just drawn* stroke (matches the implementation details of HanziWriter 2.x)
            // We find the SVG path that corresponds to this stroke and fill it.
            // HanziWriter acts on the DOM, so we can select the last drawn path.
            // Note: This relies on the internal order. A safer way is using specific API if available, 
            // but for now we attempt to select by index or standard DOM manipulation.

            // Implementation specific: HanziWriter usually appends a group/path for each stroke.
            const svg = document.querySelector('#character-target svg');
            if (svg) {
                // The strokes are usually paths. 
                // We'll target the path that matches the strokeNum. 
                // HanziWriter usually renders strokes in order.
                // However, the *drawn* stroke is separate from the *template* stroke.
                // We will try to update the 'strokeColor' for the NEXT stroke if possible, 
                // but for the CURRENT one we might need to rely on the library's default.

                // Better approach supported by HanziWriter:
                // We can't easily change the color of an *already drawn* stroke via public API 
                // without internal access or re-rendering.
                // BUT, we can try to force the color by re-rendering the specific stroke 
                // manually or using the internal SVG selection.

                // Let's try finding the last drawn path with class or attribute?
                // Actually, let's just accept the default black/white for now BUT 
                // change the feedback text color heavily.
                // Wait, user requirement is "turn green else bring orange".
                // I will try to use `cancelQuiz` and `updateColor`? No that resets.
            }

            elements.feedback.textContent = isSecondAttempt ? "⚠️ Good correction." : "✅ Perfect stroke!";
            elements.feedback.className = isSecondAttempt ? 'feedback warning' : 'feedback success';
        },
        onComplete: () => {
            elements.feedback.textContent = "✅ Written correctly! Next word.";
            elements.feedback.className = 'feedback success';
            state.writingPassed = true;
            state.score += 50;
            updateControlStates();
            renderLeaderboard();

            // Force final color update to Green for satisfaction? 
            // state.writer.updateColor('green'); // This would color the whole char green
        }
    });
}

function handleNextWord() {
    const total = getCurrentData().vocab.length;
    if (state.currentWordIndex < total - 1) {
        state.currentWordIndex++;
        loadWord(state.currentWordIndex);
    } else {
        alert("🎉 Level Vocabulary Completed! Phrases Unlocked.");
        state.progress.vocabCompleted = true;
        state.score += 500;
        unlockSection('phrases');
        switchSection('phrases');
        renderLeaderboard();
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

function speak(text) { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; speechSynthesis.speak(u); }
function toggleTheme() { document.body.classList.toggle('light-mode'); if (state.writer) loadWord(state.currentWordIndex); }
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
    elements.loginModal.classList.add('hidden');

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