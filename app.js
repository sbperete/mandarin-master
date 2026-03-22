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
    reviewIndex: 0,
    // Streak & stats
    streak: parseInt(localStorage.getItem('mm_streak')) || 0,
    lastStudyDate: localStorage.getItem('mm_lastStudyDate') || null,
    sessionStartTime: Date.now(),
    xpToday: parseInt(localStorage.getItem('mm_xpToday')) || 0,
    wordsStudiedThisSession: 0
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
    reviewExit: document.getElementById('review-exit'),
    // Below-card content
    streakPill: document.getElementById('streak-pill'),
    statStreak: document.getElementById('stat-streak'),
    statXp: document.getElementById('stat-xp'),
    statTime: document.getElementById('stat-time'),
    wodChar: document.getElementById('wod-char'),
    wodPinyin: document.getElementById('wod-pinyin'),
    wodMeaning: document.getElementById('wod-meaning'),
    wodShareBtn: document.getElementById('wod-share-btn'),
    upsellCard: document.getElementById('upsell-card'),
    upsellCtaBtn: document.getElementById('upsell-cta-btn'),
    quickDrillBtn: document.getElementById('quick-drill-btn'),
    quickStoryBtn: document.getElementById('quick-story-btn'),
    quickRankBtn: document.getElementById('quick-rank-btn'),
    quickRankSub: document.getElementById('quick-rank-sub')
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

// --- SUPABASE DATA SYNC ---
var SupabaseSync = {
    _sb: null,
    _userId: null,

    init: function(supabaseClient, userId) {
        this._sb = supabaseClient;
        this._userId = userId;
    },

    saveProgress: function(s) {
        if (!this._sb || !this._userId) return;
        this._sb.from('user_progress').upsert({
            user_id: this._userId,
            level: s.currentLevel,
            word_index: s.currentWordIndex,
            score: s.score,
            streak: s.streak,
            xp_today: s.xpToday,
            last_study_date: s.lastStudyDate,
            vocab_completed: s.progress.vocabCompleted,
            phrases_completed: s.progress.phrasesCompleted,
            story_completed: s.progress.storyCompleted,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' }).then(function(res) {
            if (res.error) console.warn('[Sync] Progress save error:', res.error.message);
            else console.log('[Sync] Progress saved to table');
        }).catch(function(err) { console.warn('[Sync] Progress save failed:', err); });
    },

    fetchProgress: function() {
        if (!this._sb || !this._userId) return Promise.resolve(null);
        return this._sb.from('user_progress').select('*').eq('user_id', this._userId).single()
            .then(function(res) {
                if (res.error && res.error.code !== 'PGRST116') { console.warn('[Sync] Fetch error:', res.error.message); return null; }
                return res.data || null;
            }).catch(function(err) { console.warn('[Sync] Fetch failed:', err); return null; });
    },

    saveWordScore: function(level, wordIndex, chinese, scoreData) {
        if (!this._sb || !this._userId) return;
        this._sb.from('word_scores').upsert({
            user_id: this._userId,
            level: level,
            word_index: wordIndex,
            chinese: chinese,
            listen_passed: !!scoreData.listenPassed,
            speak_passed: !!scoreData.speakPassed,
            write_passed: !!scoreData.writePassed,
            attempts: scoreData.attempts || 0,
            failed_strokes: scoreData.failedStrokes || 0,
            mastered: !!scoreData.mastered,
            last_practiced: new Date().toISOString()
        }, { onConflict: 'user_id,level,word_index' }).then(function(res) {
            if (res.error) console.warn('[Sync] Word score error:', res.error.message);
        }).catch(function(err) { console.warn('[Sync] Word score failed:', err); });
    },

    fetchWordScores: function(level) {
        if (!this._sb || !this._userId) return Promise.resolve([]);
        return this._sb.from('word_scores').select('*').eq('user_id', this._userId).eq('level', level)
            .order('word_index', { ascending: true })
            .then(function(res) { return (res.data || []); })
            .catch(function(err) { console.warn('[Sync] Fetch word scores failed:', err); return []; });
    },

    logSession: function(sessionData) {
        if (!this._sb || !this._userId) return;
        this._sb.from('study_sessions').insert({
            user_id: this._userId,
            started_at: sessionData.startedAt,
            ended_at: sessionData.endedAt,
            duration_seconds: sessionData.durationSeconds,
            words_studied: sessionData.wordsStudied,
            level: sessionData.level,
            xp_earned: sessionData.xpEarned
        }).then(function(res) {
            if (res.error) console.warn('[Sync] Session log error:', res.error.message);
        }).catch(function(err) { console.warn('[Sync] Session log failed:', err); });
    }
};

// --- SPACED REPETITION SYSTEM (SRS) ---
var SRS = {
    // SM-2 intervals in hours: 4h, 1d, 3d, 7d, 14d, 30d, 60d
    intervals: [4, 24, 72, 168, 336, 720, 1440],

    getKey: function(level) { return 'mm_srs_' + level; },

    getData: function(level) {
        try { return JSON.parse(localStorage.getItem(this.getKey(level))) || {}; } catch(e) { return {}; }
    },

    saveData: function(level, data) {
        localStorage.setItem(this.getKey(level), JSON.stringify(data));
    },

    // Record a word into SRS after it's been learned (all 3 steps passed)
    recordWord: function(level, wordIndex) {
        var data = this.getData(level);
        var key = String(wordIndex);
        if (!data[key]) {
            data[key] = {
                box: 0,           // SRS box (0-6), higher = longer interval
                ease: 2.5,        // ease factor
                nextReview: Date.now() + this.intervals[0] * 3600000, // first review in 4 hours
                lastReview: Date.now(),
                reviewCount: 0
            };
            this.saveData(level, data);
        }
    },

    // Get words due for review
    getDueWords: function(level) {
        var data = this.getData(level);
        var vocabData = levelData[level];
        if (!vocabData || !vocabData.vocab) return [];
        var now = Date.now();
        var due = [];
        for (var key in data) {
            if (data[key].nextReview <= now) {
                var idx = parseInt(key);
                var word = vocabData.vocab[idx];
                if (word) {
                    due.push({ index: idx, word: word, srs: data[key] });
                }
            }
        }
        // Sort by most overdue first
        due.sort(function(a, b) { return a.srs.nextReview - b.srs.nextReview; });
        return due;
    },

    // Count due words
    getDueCount: function(level) {
        var data = this.getData(level);
        var now = Date.now();
        var count = 0;
        for (var key in data) {
            if (data[key].nextReview <= now) count++;
        }
        return count;
    },

    // Grade a review: 0=Again, 1=Hard, 2=Good, 3=Easy
    gradeReview: function(level, wordIndex, grade) {
        var data = this.getData(level);
        var key = String(wordIndex);
        if (!data[key]) return;

        var card = data[key];
        card.reviewCount++;
        card.lastReview = Date.now();

        if (grade === 0) {
            // Again — reset to box 0
            card.box = 0;
            card.ease = Math.max(1.3, card.ease - 0.2);
        } else if (grade === 1) {
            // Hard — same box, shorter interval
            card.ease = Math.max(1.3, card.ease - 0.15);
        } else if (grade === 2) {
            // Good — advance one box
            card.box = Math.min(card.box + 1, this.intervals.length - 1);
        } else if (grade === 3) {
            // Easy — advance two boxes
            card.box = Math.min(card.box + 2, this.intervals.length - 1);
            card.ease = Math.min(3.0, card.ease + 0.15);
        }

        var interval = this.intervals[card.box] * card.ease;
        card.nextReview = Date.now() + interval * 3600000;
        data[key] = card;
        this.saveData(level, data);
    }
};

// Start SRS Review Session
function startSRSReview() {
    var dueWords = SRS.getDueWords(state.currentLevel);
    if (dueWords.length === 0) {
        elements.feedback.textContent = "No words due for review right now!";
        elements.feedback.className = 'feedback success';
        return;
    }

    var reviewQueue = dueWords.slice(0, 20); // Max 20 per session
    var reviewIndex = 0;
    var data = getCurrentData();

    function showReviewCard() {
        if (reviewIndex >= reviewQueue.length) {
            // Review complete
            var html = '<div style="text-align:center;padding:30px 20px;">' +
                '<h2 style="font-size:24px;color:var(--teal);margin-bottom:10px;">Review Complete!</h2>' +
                '<p style="font-size:48px;margin:15px 0;">🧠</p>' +
                '<p style="font-size:20px;color:var(--text);margin-bottom:5px;">' + reviewQueue.length + ' words reviewed</p>' +
                '<p style="font-size:14px;color:var(--text-2);margin-bottom:8px;">' + SRS.getDueCount(state.currentLevel) + ' still due</p>' +
                '<button onclick="switchSection(\'vocab\')" style="background:var(--teal);color:#0f1520;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;">Back to Vocabulary</button>' +
                '</div>';
            var container = document.getElementById('srs-review-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'srs-review-container';
                document.getElementById('vocab-section').appendChild(container);
            }
            container.innerHTML = html;
            state.score += reviewQueue.length * 10;
            state.xpToday += reviewQueue.length * 10;
            saveProgress();
            updateBelowCardContent();
            return;
        }

        var item = reviewQueue[reviewIndex];
        var word = item.word;
        var showAnswer = false;

        var cardHTML = '<div style="text-align:center;padding:20px;">' +
            '<p style="font-size:12px;color:var(--text-3);margin-bottom:8px;">Review ' + (reviewIndex + 1) + ' of ' + reviewQueue.length + '</p>' +
            '<p style="font-family:\'Noto Serif SC\',serif;font-size:56px;font-weight:700;color:var(--text);margin:20px 0;">' + word.chinese + '</p>' +
            '<p style="font-size:18px;color:var(--teal);margin-bottom:15px;">' + word.pinyin + '</p>' +
            '<div id="srs-answer" style="min-height:60px;margin-bottom:20px;">' +
                '<button id="srs-show-btn" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 24px;font-size:14px;color:var(--text);cursor:pointer;">Show Answer</button>' +
            '</div>' +
            '</div>';

        var section = document.getElementById('vocab-section');
        var container = document.getElementById('srs-review-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'srs-review-container';
            section.appendChild(container);
        }
        container.innerHTML = cardHTML;

        // Hide learning card
        var learningCard = section.querySelector('.learning-card');
        var belowCard = section.querySelector('.below-card-content');
        var sectionHeader = section.querySelector('.section-header');
        if (learningCard) learningCard.style.display = 'none';
        if (belowCard) belowCard.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';

        document.getElementById('srs-show-btn').addEventListener('click', function() {
            var answerDiv = document.getElementById('srs-answer');
            answerDiv.innerHTML = '<p style="font-size:20px;color:var(--text);font-weight:600;margin-bottom:20px;">' + word.english + '</p>' +
                '<p style="font-size:12px;color:var(--text-3);margin-bottom:12px;">How well did you remember?</p>' +
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:400px;margin:0 auto;">' +
                    '<button class="srs-grade-btn" data-grade="0" style="background:rgba(251,113,133,0.15);border:1px solid var(--rose);border-radius:10px;padding:10px 6px;font-size:12px;color:var(--rose);cursor:pointer;"><div style="font-size:16px;">😣</div>Again</button>' +
                    '<button class="srs-grade-btn" data-grade="1" style="background:rgba(251,191,36,0.15);border:1px solid #fbbf24;border-radius:10px;padding:10px 6px;font-size:12px;color:#fbbf24;cursor:pointer;"><div style="font-size:16px;">😐</div>Hard</button>' +
                    '<button class="srs-grade-btn" data-grade="2" style="background:rgba(0,212,170,0.15);border:1px solid var(--teal);border-radius:10px;padding:10px 6px;font-size:12px;color:var(--teal);cursor:pointer;"><div style="font-size:16px;">😊</div>Good</button>' +
                    '<button class="srs-grade-btn" data-grade="3" style="background:rgba(96,165,250,0.15);border:1px solid #60a5fa;border-radius:10px;padding:10px 6px;font-size:12px;color:#60a5fa;cursor:pointer;"><div style="font-size:16px;">😎</div>Easy</button>' +
                '</div>';

            answerDiv.querySelectorAll('.srs-grade-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var grade = parseInt(btn.getAttribute('data-grade'));
                    SRS.gradeReview(state.currentLevel, item.index, grade);
                    reviewIndex++;
                    setTimeout(showReviewCard, 300);
                });
            });
        });
    }

    switchSection('vocab');
    document.querySelector('.main-content').scrollTop = 0;
    showReviewCard();
}

function endSRSReview() {
    var section = document.getElementById('vocab-section');
    var container = document.getElementById('srs-review-container');
    if (container) container.remove();
    var learningCard = section.querySelector('.learning-card');
    var belowCard = section.querySelector('.below-card-content');
    var sectionHeader = section.querySelector('.section-header');
    if (learningCard) learningCard.style.display = '';
    if (belowCard) belowCard.style.display = '';
    if (sectionHeader) sectionHeader.style.display = '';
}

// --- PER-WORD SCORE TRACKING ---
function recordWordScore() {
    var word = getCurrentWord();
    if (!word) return;
    var key = 'mm_wordScores_' + state.currentLevel;
    var scores = {};
    try { scores = JSON.parse(localStorage.getItem(key)) || {}; } catch(e) {}
    var idx = String(state.currentWordIndex);
    if (!scores[idx]) {
        scores[idx] = { attempts: 0, failedStrokes: 0, listenPassed: false, speakPassed: false, writePassed: false, mastered: false };
    }
    scores[idx].listenPassed = state.listenPassed;
    scores[idx].speakPassed = state.pronunciationPassed;
    scores[idx].writePassed = state.writingPassed;
    scores[idx].attempts = (scores[idx].attempts || 0) + 1;
    scores[idx].failedStrokes = state.failedStrokes.length;
    scores[idx].mastered = state.writingPassed;
    localStorage.setItem(key, JSON.stringify(scores));

    if (state.isLoggedIn) {
        SupabaseSync.saveWordScore(state.currentLevel, state.currentWordIndex, word.chinese, scores[idx]);
    }
}

// --- PROGRESS PERSISTENCE ---

function saveProgress() {
    // Save to localStorage (instant, offline-friendly)
    localStorage.setItem('mm_currentLevel', state.currentLevel);
    localStorage.setItem('mm_currentWordIndex', state.currentWordIndex);
    localStorage.setItem('mm_progress', JSON.stringify(state.progress));
    localStorage.setItem('mm_score', state.score);
    localStorage.setItem('mm_streak', state.streak);
    localStorage.setItem('mm_xpToday', state.xpToday);
    localStorage.setItem('mm_lastStudyDate', state.lastStudyDate);

    // Async sync to Supabase user_metadata (backward compat)
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
            console.log('[Progress] Synced to Supabase metadata');
        }).catch(function(err) {
            console.warn('[Progress] Supabase metadata sync failed:', err);
        });

        // Also save to user_progress table
        SupabaseSync.saveProgress(state);
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

    // Try user_progress table first, then fall back to user_metadata
    SupabaseSync.fetchProgress().then(function(tableData) {
        if (tableData) {
            var isTableAhead = tableData.word_index > state.currentWordIndex || tableData.level > state.currentLevel;
            if (isTableAhead) {
                state.currentLevel = tableData.level;
                state.currentWordIndex = tableData.word_index;
                state.score = Math.max(state.score, tableData.score);
                state.streak = Math.max(state.streak, tableData.streak);
                state.xpToday = Math.max(state.xpToday, tableData.xp_today || 0);
                state.lastStudyDate = tableData.last_study_date || state.lastStudyDate;
                state.progress = {
                    vocabCompleted: !!tableData.vocab_completed,
                    phrasesCompleted: !!tableData.phrases_completed,
                    storyCompleted: !!tableData.story_completed
                };
                _applyRestoredProgress();
                console.log('[Progress] Restored from user_progress table');
                return;
            } else if (state.currentWordIndex > tableData.word_index) {
                // Local is ahead — back-fill to table
                SupabaseSync.saveProgress(state);
            }
            return;
        }

        // Fallback: try user_metadata (legacy)
        return window.supabaseClient.auth.getUser().then(function(result) {
            if (!result.data || !result.data.user || !result.data.user.user_metadata) return;
            var meta = result.data.user.user_metadata;
            if (typeof meta.currentWordIndex === 'number') {
                var supabaseIndex = meta.currentWordIndex || 0;
                var supabaseLevel = meta.currentLevel || 1;
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
                    if (typeof meta.score === 'number' && meta.score > state.score) state.score = meta.score;
                    _applyRestoredProgress();
                    // Back-fill to table
                    SupabaseSync.saveProgress(state);
                    console.log('[Progress] Restored from user_metadata (legacy), back-filled to table');
                }
            } else if (state.currentWordIndex > 0) {
                saveProgress();
            }
        });
    }).catch(function(err) {
        console.warn('[Progress] Supabase restore failed:', err);
    });
}

function _applyRestoredProgress() {
    localStorage.setItem('mm_currentLevel', state.currentLevel);
    localStorage.setItem('mm_currentWordIndex', state.currentWordIndex);
    localStorage.setItem('mm_progress', JSON.stringify(state.progress));
    localStorage.setItem('mm_score', state.score);
    localStorage.setItem('mm_streak', state.streak);
    localStorage.setItem('mm_xpToday', state.xpToday);
    localStorage.setItem('mm_lastStudyDate', state.lastStudyDate);
    if (elements.levelSelect) elements.levelSelect.value = state.currentLevel;
    if (elements.mobileLevelSelect) elements.mobileLevelSelect.value = state.currentLevel;
    if (state.progress.vocabCompleted) unlockSection('phrases');
    if (state.progress.phrasesCompleted) unlockSection('story');
    if (state.progress.storyCompleted) unlockSection('resources');
    loadWord(state.currentWordIndex);
    updateProgress();
    updateBelowCardContent();
}

// --- STREAK & BELOW-CARD CONTENT ---

function updateStreak() {
    var today = new Date().toISOString().split('T')[0];
    var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (state.lastStudyDate === today) {
        // Already counted today, no change
    } else if (state.lastStudyDate === yesterday) {
        state.streak++;
    } else {
        state.streak = 1; // Reset if gap > 1 day
    }
    state.lastStudyDate = today;
    localStorage.setItem('mm_streak', state.streak);
    localStorage.setItem('mm_lastStudyDate', today);
}

function updateBelowCardContent() {
    // Streak
    if (elements.streakPill) elements.streakPill.textContent = '🔥 ' + state.streak;
    if (elements.statStreak) elements.statStreak.textContent = '🔥 ' + state.streak;

    // XP
    if (elements.statXp) elements.statXp.textContent = state.score;

    // Study time
    var mins = Math.round((Date.now() - state.sessionStartTime) / 60000);
    if (elements.statTime) elements.statTime.textContent = mins + 'm';

    // Hide upsell if premium
    if (elements.upsellCard && state.isPremium) {
        elements.upsellCard.style.display = 'none';
    }

    // SRS due count on Quick Drill button
    var dueCount = SRS.getDueCount(state.currentLevel);
    var drillSub = document.querySelector('#quick-drill-btn .quick-sub');
    if (drillSub) {
        drillSub.textContent = dueCount > 0 ? dueCount + ' words due' : '5-min flash review';
        if (dueCount > 0) drillSub.style.color = 'var(--teal)';
        else drillSub.style.color = '';
    }
}

function loadWordOfDay() {
    var data = getCurrentData();
    if (!data || !data.vocab || data.vocab.length === 0) return;
    // Deterministic "random" based on full date — changes daily, cycles through all words
    var today = new Date();
    var dateStr = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();
    var hash = 0;
    for (var i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit int
    }
    var dayIndex = Math.abs(hash) % data.vocab.length;
    var word = data.vocab[dayIndex];
    if (elements.wodChar) elements.wodChar.textContent = word.chinese;
    if (elements.wodPinyin) elements.wodPinyin.textContent = word.pinyin;
    if (elements.wodMeaning) elements.wodMeaning.textContent = word.english;
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
// Move nav-links to app-wrapper on mobile so it becomes a flex child at the bottom
// (avoids position:fixed containing-block issues with sidebar backdrop-filter/transform)
function setupMobileNav() {
    var navLinks = document.querySelector('.nav-links');
    var sidebar = document.querySelector('.sidebar');
    var appWrapper = document.querySelector('.app-wrapper');
    if (!navLinks || !sidebar || !appWrapper) return;

    function positionNav() {
        if (window.innerWidth <= 768) {
            if (navLinks.parentElement !== appWrapper) {
                appWrapper.appendChild(navLinks);
            }
        } else {
            if (navLinks.parentElement !== sidebar) {
                var levelSelector = sidebar.querySelector('.level-selector');
                if (levelSelector) {
                    levelSelector.after(navLinks);
                } else {
                    sidebar.appendChild(navLinks);
                }
            }
        }
    }
    positionNav();
    window.addEventListener('resize', positionNav);
}

// --- BACKGROUND AMBIENT AUDIO (Web Audio API) ---
var BackgroundAudio = {
    ctx: null,
    isPlaying: false,
    masterGain: null,
    nodes: [],
    volume: 0.15,

    init: function() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
    },

    start: function() {
        this.init();
        if (this.isPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.isPlaying = true;

        // Layer 1: Warm pad chord (A major — calming, open)
        this._createPad(220, 'sine', 0.06);       // A3
        this._createPad(277.18, 'sine', 0.04);    // C#4
        this._createPad(329.63, 'sine', 0.03);    // E4

        // Layer 2: Slow modulated pad for gentle movement
        this._createModulatedPad(174.61, 0.025, 0.04); // F3

        // Layer 3: Filtered noise (soft rain/air texture)
        this._createFilteredNoise(0.015);

        // Layer 4: Gentle rhythmic pulse (~65 BPM)
        this._scheduleRhythm(65);

        this._updateButtons();
    },

    stop: function() {
        this.isPlaying = false;
        for (var i = 0; i < this.nodes.length; i++) {
            try { this.nodes[i].stop(); } catch(e) {}
            try { this.nodes[i].disconnect(); } catch(e) {}
        }
        this.nodes = [];
        this._updateButtons();
    },

    toggle: function() {
        if (this.isPlaying) {
            this.stop();
            localStorage.setItem('mm_bgAudio', 'off');
        } else {
            this.start();
            localStorage.setItem('mm_bgAudio', 'on');
        }
    },

    _createPad: function(freq, type, gain) {
        var osc = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        g.gain.value = gain;
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        this.nodes.push(osc);
    },

    _createModulatedPad: function(freq, gain, lfoRate) {
        var osc = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        var lfo = this.ctx.createOscillator();
        var lfoGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.value = gain;
        lfo.type = 'sine';
        lfo.frequency.value = lfoRate;
        lfoGain.gain.value = freq * 0.02;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        lfo.start();
        this.nodes.push(osc, lfo);
    },

    _createFilteredNoise: function(gain) {
        var bufferSize = this.ctx.sampleRate * 2;
        var buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        var source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        var filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 0.5;
        var g = this.ctx.createGain();
        g.gain.value = gain;
        source.connect(filter);
        filter.connect(g);
        g.connect(this.masterGain);
        source.start();
        this.nodes.push(source);
    },

    _scheduleRhythm: function(bpm) {
        var interval = 60 / bpm;
        var now = this.ctx.currentTime;
        var count = bpm * 5; // 5 minutes of gentle ticks
        for (var i = 0; i < count; i++) {
            var t = now + i * interval;
            var osc = this.ctx.createOscillator();
            var g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 440;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.012, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.35);
        }
    },

    _updateButtons: function() {
        var desktopBtn = document.getElementById('bg-audio-btn');
        var mobileBtn = document.getElementById('mobile-audio-btn');
        var label = this.isPlaying ? '🔊 Sound On' : '🔇 Sound Off';
        var icon = this.isPlaying ? '🔊' : '🔇';
        if (desktopBtn) {
            desktopBtn.textContent = label;
            desktopBtn.classList.toggle('audio-active', this.isPlaying);
        }
        if (mobileBtn) {
            mobileBtn.textContent = icon;
            mobileBtn.classList.toggle('audio-active', this.isPlaying);
        }
    }
};

function init() {
    loadThemePreference();
    Guide.init();
    setupMobileNav();
    setupEventListeners();
    setupAuthListeners();
    checkPremiumStatus();
    restoreProgressFromLocal();
    updateStreak();
    loadWordOfDay();
    updateBelowCardContent();

    // Update study time every 60 seconds
    setInterval(function() { updateBelowCardContent(); }, 60000);

    // Log study session on page close
    window.addEventListener('beforeunload', function() {
        if (state.isLoggedIn && state.wordsStudiedThisSession > 0) {
            var now = Date.now();
            SupabaseSync.logSession({
                startedAt: new Date(state.sessionStartTime).toISOString(),
                endedAt: new Date(now).toISOString(),
                durationSeconds: Math.round((now - state.sessionStartTime) / 1000),
                wordsStudied: state.wordsStudiedThisSession,
                level: state.currentLevel,
                xpEarned: state.xpToday
            });
        }
    });

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
                // Show onboarding for first-time users
                var hasVisited = localStorage.getItem('mm_hasVisited');
                var onboarding = document.getElementById('onboarding-overlay');
                if (!hasVisited && onboarding) {
                    onboarding.style.display = 'block';
                    var startBtn = document.getElementById('onboarding-start-btn');
                    var signinBtn = document.getElementById('onboarding-signin-btn');
                    if (startBtn) startBtn.addEventListener('click', function() {
                        onboarding.style.display = 'none';
                        localStorage.setItem('mm_hasVisited', 'true');
                        if (window.AuthModal) {
                            window.AuthModal.isClosable = false;
                            var closeBtn = document.getElementById('am-close-btn');
                            if (closeBtn) closeBtn.style.display = 'none';
                            window.AuthModal.show('signup');
                        }
                    });
                    if (signinBtn) signinBtn.addEventListener('click', function() {
                        onboarding.style.display = 'none';
                        localStorage.setItem('mm_hasVisited', 'true');
                        if (window.AuthModal) {
                            window.AuthModal.isClosable = false;
                            var closeBtn = document.getElementById('am-close-btn');
                            if (closeBtn) closeBtn.style.display = 'none';
                            window.AuthModal.show('signin');
                        }
                    });
                } else {
                    // Returning user — go straight to auth modal
                    if (window.AuthModal) {
                        window.AuthModal.isClosable = false;
                        var closeBtn = document.getElementById('am-close-btn');
                        if (closeBtn) closeBtn.style.display = 'none';
                        window.AuthModal.show('signin');
                    }
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

    // --- Mobile Header Theme Toggle ---
    var headerThemeBtn = document.getElementById('mobile-theme-toggle-header');
    if (headerThemeBtn) {
        function updateHeaderThemeIcon() {
            var isLight = document.body.classList.contains('light-mode');
            headerThemeBtn.textContent = isLight ? '🌙' : '☀️';
        }
        updateHeaderThemeIcon();
        headerThemeBtn.addEventListener('click', function() {
            elements.themeToggle.click(); // delegate to main toggle
            updateHeaderThemeIcon();
        });
    }

    // --- Mobile Settings Panel ---
    var settingsBtn = document.getElementById('mobile-settings-btn');
    var settingsPanel = document.getElementById('mobile-settings-panel');
    if (settingsBtn && settingsPanel) {
        // Populate panel with auth controls only (theme moved to header)
        settingsPanel.innerHTML = '<button class="sidebar-auth-btn mobile-signout-btn" onclick="auth.signOut()">Sign Out</button>';

        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsPanel.classList.toggle('open');
        });
        document.addEventListener('click', function() {
            settingsPanel.classList.remove('open');
        });
    }

    // --- BELOW-CARD QUICK ACTIONS ---
    if (elements.quickDrillBtn) {
        elements.quickDrillBtn.addEventListener('click', function() {
            var dueCount = SRS.getDueCount(state.currentLevel);
            if (dueCount > 0) {
                startSRSReview();
            } else if (state.currentWordIndex > 0) {
                enterReviewMode();
            } else {
                elements.feedback.textContent = "💡 Study at least 1 word first to unlock Quick Drill!";
                elements.feedback.className = 'feedback warning';
            }
        });
    }
    var quickTestBtn = document.getElementById('quick-test-btn');
    if (quickTestBtn) {
        quickTestBtn.addEventListener('click', function() {
            if (state.currentWordIndex >= 5) {
                startMockHSK();
            } else {
                elements.feedback.textContent = "💡 Study at least 5 words to unlock Mock HSK!";
                elements.feedback.className = 'feedback warning';
                document.querySelector('.main-content').scrollTop = 0;
            }
        });
    }
    if (elements.quickStoryBtn) {
        elements.quickStoryBtn.addEventListener('click', function() {
            var storyLink = document.querySelector('.nav-links li[data-section="story"]');
            if (storyLink && storyLink.classList.contains('locked')) {
                elements.feedback.textContent = "💡 Complete Vocabulary & Phrases to unlock Story Mode!";
                elements.feedback.className = 'feedback warning';
                document.querySelector('.main-content').scrollTop = 0;
            } else {
                switchSection('story');
                renderStory();
            }
        });
    }
    if (elements.quickRankBtn) {
        elements.quickRankBtn.addEventListener('click', function() {
            switchSection('leaderboard');
        });
    }
    if (elements.upsellCtaBtn) {
        elements.upsellCtaBtn.addEventListener('click', function() {
            showPaywall();
        });
    }

    // --- ANALYTICS ---
    // Make stats row clickable to open analytics
    var statsRow = document.querySelector('.stats-row');
    if (statsRow) {
        statsRow.style.cursor = 'pointer';
        statsRow.addEventListener('click', function() {
            renderAnalytics();
            switchSection('analytics');
        });
    }
    // Make "Analytics" perk chip clickable
    var perkChips = document.querySelectorAll('.perk-chip');
    perkChips.forEach(function(chip) {
        if (chip.textContent.trim() === 'Analytics') {
            chip.style.cursor = 'pointer';
            chip.addEventListener('click', function(e) {
                e.stopPropagation();
                renderAnalytics();
                switchSection('analytics');
            });
        }
    });

    // --- BACKGROUND AUDIO ---
    var bgAudioBtn = document.getElementById('bg-audio-btn');
    var mobileBgAudioBtn = document.getElementById('mobile-audio-btn');
    if (bgAudioBtn) bgAudioBtn.addEventListener('click', function() { BackgroundAudio.toggle(); });
    if (mobileBgAudioBtn) mobileBgAudioBtn.addEventListener('click', function() { BackgroundAudio.toggle(); });

    // Auto-resume audio on first click if user had it on previously
    var savedAudio = localStorage.getItem('mm_bgAudio');
    if (savedAudio === 'on') {
        var resumeAudio = function() {
            BackgroundAudio.start();
            document.removeEventListener('click', resumeAudio);
        };
        document.addEventListener('click', resumeAudio, { once: true });
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
        recordWordScore();
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
            SupabaseSync.init(window.supabaseClient, user.id);
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
        alert("Level data not available. Please try again.");
        return;
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
    // Clean up mock HSK quiz and SRS review if active
    endMockHSK();
    endSRSReview();
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
    elements.characterTarget.classList.remove('write-active');

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
    var writerSize = window.innerWidth <= 480 ? 100 : (window.innerWidth <= 768 ? 110 : 260);
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
            recordWordScore();
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
    // Expand the writing area with animation
    elements.characterTarget.classList.add('write-active');

    // Recreate HanziWriter at expanded size
    var expandedSize = window.innerWidth <= 480 ? 140 : (window.innerWidth <= 768 ? 160 : 320);
    elements.characterTarget.innerHTML = '';
    var word = getCurrentWord();
    if (!word) return;
    var isLight = document.body.classList.contains('light-mode');
    state.writer = HanziWriter.create('character-target', word.chinese, {
        width: expandedSize, height: expandedSize, padding: 5,
        showOutline: true,
        outlineColor: '#ff4444',
        strokeColor: isLight ? '#333' : '#ccc',
        drawingColor: isLight ? '#333' : '#ecf0f1',
        delayBetweenStrokes: 0,
        radicalsColor: '#337ab7'
    });

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
            // Retract the writing area
            elements.characterTarget.classList.remove('write-active');
            recordWordScore();
            SRS.recordWord(state.currentLevel, state.currentWordIndex);
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
    state.wordsStudiedThisSession++;
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
        updateBelowCardContent();
    } else {
        elements.feedback.textContent = "🎉 Level Vocabulary Completed! Phrases Unlocked.";
        elements.feedback.className = 'feedback success';
        state.progress.vocabCompleted = true;
        state.score += 500;
        unlockSection('phrases');
        switchSection('phrases');
        renderLeaderboard();
        saveProgress();
        updateBelowCardContent();
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

// --- MOCK HSK QUIZ ---

function startMockHSK() {
    var data = getCurrentData();
    if (!data || !data.vocab || state.currentWordIndex < 5) return;

    // Pick 10 random words from learned words (or fewer if not enough)
    var pool = [];
    for (var i = 0; i < state.currentWordIndex; i++) {
        if (data.vocab[i]) pool.push(data.vocab[i]);
    }
    // Shuffle
    for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var quizWords = pool.slice(0, Math.min(10, pool.length));

    var quizIndex = 0;
    var correct = 0;
    var total = quizWords.length;

    function showQuestion() {
        if (quizIndex >= total) {
            // Quiz complete — show results
            var pct = Math.round((correct / total) * 100);
            var grade = pct >= 80 ? '🎉 Excellent!' : (pct >= 60 ? '👍 Good effort!' : '💪 Keep practicing!');
            var resultHTML = '<div style="text-align:center;padding:30px 20px;">' +
                '<h2 style="font-size:24px;color:var(--teal);margin-bottom:10px;">Mock HSK Results</h2>' +
                '<p style="font-size:48px;margin:15px 0;">' + grade + '</p>' +
                '<p style="font-size:20px;color:var(--text);margin-bottom:5px;">' + correct + ' / ' + total + ' correct</p>' +
                '<p style="font-size:16px;color:var(--text-2);margin-bottom:20px;">' + pct + '% accuracy</p>' +
                '<button onclick="switchSection(\'vocab\')" style="background:var(--teal);color:#0f1520;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;">Back to Vocabulary</button>' +
                '</div>';
            var section = document.getElementById('vocab-section');
            var quizContainer = document.getElementById('mock-hsk-container');
            if (quizContainer) quizContainer.innerHTML = resultHTML;
            else {
                var div = document.createElement('div');
                div.id = 'mock-hsk-container';
                div.innerHTML = resultHTML;
                section.appendChild(div);
            }
            state.score += correct * 25;
            state.xpToday += correct * 25;
            saveProgress();
            updateBelowCardContent();
            return;
        }

        var word = quizWords[quizIndex];
        // Generate 3 wrong answers from the pool
        var wrongAnswers = [];
        var allVocab = data.vocab.slice();
        for (var i = allVocab.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = allVocab[i]; allVocab[i] = allVocab[j]; allVocab[j] = tmp;
        }
        for (var i = 0; i < allVocab.length && wrongAnswers.length < 3; i++) {
            if (allVocab[i].english !== word.english) wrongAnswers.push(allVocab[i].english);
        }

        // Build options array and shuffle
        var options = [word.english].concat(wrongAnswers);
        for (var i = options.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
        }

        var qHTML = '<div style="text-align:center;padding:20px;">' +
            '<p style="font-size:12px;color:var(--text-3);margin-bottom:8px;">Question ' + (quizIndex + 1) + ' of ' + total + '</p>' +
            '<p style="font-family:\'Noto Serif SC\',serif;font-size:48px;font-weight:700;color:var(--text);margin:15px 0;">' + word.chinese + '</p>' +
            '<p style="font-size:16px;color:var(--teal);margin-bottom:20px;">' + word.pinyin + '</p>' +
            '<div id="quiz-options" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:400px;margin:0 auto;">';

        for (var i = 0; i < options.length; i++) {
            qHTML += '<button class="quiz-option-btn" data-answer="' + options[i].replace(/"/g, '&quot;') + '" ' +
                'style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;color:var(--text);cursor:pointer;transition:all 0.2s;">' +
                options[i] + '</button>';
        }
        qHTML += '</div></div>';

        var section = document.getElementById('vocab-section');
        var quizContainer = document.getElementById('mock-hsk-container');
        if (!quizContainer) {
            quizContainer = document.createElement('div');
            quizContainer.id = 'mock-hsk-container';
            section.appendChild(quizContainer);
        }
        quizContainer.innerHTML = qHTML;

        // Hide learning card and below-card content during quiz
        var learningCard = section.querySelector('.learning-card');
        var belowCard = section.querySelector('.below-card-content');
        var sectionHeader = section.querySelector('.section-header');
        if (learningCard) learningCard.style.display = 'none';
        if (belowCard) belowCard.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';

        // Wire up option buttons
        var btns = quizContainer.querySelectorAll('.quiz-option-btn');
        btns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var answer = btn.getAttribute('data-answer');
                var isCorrect = answer === word.english;
                if (isCorrect) {
                    btn.style.background = 'rgba(0,212,170,0.2)';
                    btn.style.borderColor = 'var(--teal)';
                    btn.style.color = 'var(--teal)';
                    correct++;
                } else {
                    btn.style.background = 'rgba(251,113,133,0.2)';
                    btn.style.borderColor = 'var(--rose)';
                    btn.style.color = 'var(--rose)';
                    // Highlight correct answer
                    btns.forEach(function(b) {
                        if (b.getAttribute('data-answer') === word.english) {
                            b.style.background = 'rgba(0,212,170,0.2)';
                            b.style.borderColor = 'var(--teal)';
                            b.style.color = 'var(--teal)';
                        }
                    });
                }
                // Disable all buttons
                btns.forEach(function(b) { b.style.pointerEvents = 'none'; });
                // Next question after delay
                quizIndex++;
                setTimeout(showQuestion, 1000);
            });
        });
    }

    // Switch to vocab section and scroll to top
    switchSection('vocab');
    document.querySelector('.main-content').scrollTop = 0;
    showQuestion();
}

function endMockHSK() {
    var section = document.getElementById('vocab-section');
    var quizContainer = document.getElementById('mock-hsk-container');
    if (quizContainer) quizContainer.remove();
    var learningCard = section.querySelector('.learning-card');
    var belowCard = section.querySelector('.below-card-content');
    var sectionHeader = section.querySelector('.section-header');
    if (learningCard) learningCard.style.display = '';
    if (belowCard) belowCard.style.display = '';
    if (sectionHeader) sectionHeader.style.display = '';
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
    var writerSize = window.innerWidth <= 480 ? 100 : (window.innerWidth <= 768 ? 110 : 260);
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

// --- LEARNED WORD HIGHLIGHTING ---
function getLearnedWords() {
    var data = getCurrentData();
    if (!data || !data.vocab) return new Set();
    var learned = new Set();
    for (var i = 0; i < state.currentWordIndex; i++) {
        if (data.vocab[i]) learned.add(data.vocab[i].chinese);
    }
    return learned;
}

function getUnlearnedWords() {
    var data = getCurrentData();
    if (!data || !data.vocab) return new Set();
    var unlearned = new Set();
    for (var i = state.currentWordIndex; i < data.vocab.length; i++) {
        if (data.vocab[i]) unlearned.add(data.vocab[i].chinese);
    }
    return unlearned;
}

function highlightSentence(sentence, learnedSet, unlearnedSet) {
    var chars = Array.from(sentence);
    var result = '';
    var i = 0;
    while (i < chars.length) {
        var matched = false;
        for (var len = Math.min(4, chars.length - i); len >= 1; len--) {
            var substr = chars.slice(i, i + len).join('');
            if (learnedSet.has(substr)) {
                result += '<span class="word-known">' + substr + '</span>';
                i += len;
                matched = true;
                break;
            }
            if (unlearnedSet.has(substr)) {
                result += '<span class="word-unknown" title="Not yet learned">' + substr + '</span>';
                i += len;
                matched = true;
                break;
            }
        }
        if (!matched) {
            result += chars[i];
            i++;
        }
    }
    return result;
}

function renderPhrases() {
    const data = getCurrentData(); if (!data || !data.phrases) return;
    var learned = getLearnedWords();
    var unlearned = getUnlearnedWords();

    // Score phrases by how many learned words they contain
    var scored = data.phrases.map(function(p) {
        var matchCount = 0;
        learned.forEach(function(w) { if (p.chinese.includes(w)) matchCount++; });
        return { phrase: p, matchCount: matchCount };
    });
    scored.sort(function(a, b) { return b.matchCount - a.matchCount; });

    elements.phrasesList.innerHTML = scored.map(function(item) {
        var p = item.phrase;
        var highlighted = highlightSentence(p.chinese, learned, unlearned);
        var relevanceClass = item.matchCount > 0 ? 'phrase-relevant' : '';
        return '<div class="phrase-item ' + relevanceClass + '">' +
            '<div class="phrase-content"><h3>' + highlighted + '</h3><p>' + p.pinyin + ' - ' + p.english + '</p></div>' +
            '<button class="icon-btn" onclick="speak(\'' + p.chinese.replace(/'/g, "\\'") + '\')">🔊</button></div>';
    }).join('');
    setTimeout(() => { unlockSection('story'); }, 1000);
}

function renderStory() {
    const data = getCurrentData(); if (!data || !data.story) return;
    var learned = getLearnedWords();
    var unlearned = getUnlearnedWords();

    elements.storyTitle.textContent = data.story.title;
    elements.storyContent.innerHTML = data.story.content.map(function(line) {
        var highlighted = highlightSentence(line.chinese, learned, unlearned);
        return '<div class="story-line" onclick="speak(\'' + line.chinese.replace(/'/g, "\\'") + '\')">' +
            '<span class="pinyin">' + line.pinyin + '</span>' +
            '<span class="chinese">' + highlighted + '</span>' +
            '<span class="english">' + line.english + '</span></div>';
    }).join('');
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

    // Try to fetch real leaderboard from Supabase
    if (window.supabaseClient) {
        window.supabaseClient.from('user_progress')
            .select('user_id, score, level, streak')
            .order('score', { ascending: false })
            .limit(20)
            .then(function(res) {
                if (res.error || !res.data || res.data.length === 0) {
                    renderLeaderboardFallback();
                    return;
                }
                // Fetch display names from auth
                var entries = res.data;
                var currentUserId = state.user ? state.user.id : null;
                var userFound = false;

                var users = entries.map(function(e, i) {
                    var isYou = e.user_id === currentUserId;
                    if (isYou) userFound = true;
                    return {
                        name: isYou ? 'You' : ('Learner ' + (i + 1)),
                        score: e.score || 0,
                        level: e.level || 1,
                        streak: e.streak || 0,
                        yours: isYou
                    };
                });

                // Add current user if not in top 20
                if (!userFound && currentUserId) {
                    users.push({ name: 'You', score: state.score, level: state.currentLevel, streak: state.streak, yours: true });
                    users.sort(function(a, b) { return b.score - a.score; });
                }

                renderLeaderboardHTML(users);

                // Update rank display
                var rank = users.findIndex(function(u) { return u.yours; });
                var rankSub = document.getElementById('quick-rank-sub');
                if (rankSub && rank >= 0) rankSub.textContent = 'Rank #' + (rank + 1);
            }).catch(function() { renderLeaderboardFallback(); });
    } else {
        renderLeaderboardFallback();
    }
}

function renderLeaderboardFallback() {
    var users = [
        { name: "You", score: state.score, level: state.currentLevel, streak: state.streak, yours: true },
        { name: "Li Hua", score: 2400, level: 3, streak: 12, yours: false },
        { name: "Sarah J.", score: 1850, level: 2, streak: 7, yours: false },
        { name: "Mike Chen", score: 1200, level: 2, streak: 4, yours: false },
        { name: "Anna K.", score: 950, level: 1, streak: 3, yours: false }
    ];
    users.sort(function(a, b) { return b.score - a.score; });
    renderLeaderboardHTML(users);
}

function renderLeaderboardHTML(users) {
    var medals = ['🥇', '🥈', '🥉'];
    elements.leaderboardList.innerHTML = users.map(function(u, index) {
        var rankDisplay = index < 3 ? medals[index] : '#' + (index + 1);
        return '<div class="leaderboard-item ' + (u.yours ? 'highlight' : '') + '">' +
            '<div class="rank">' + rankDisplay + '</div>' +
            '<div class="user-info">' +
                '<h4>' + u.name + (u.yours ? ' (Me)' : '') + '</h4>' +
                '<span>HSK ' + u.level + ' · 🔥 ' + u.streak + '</span>' +
            '</div>' +
            '<div class="score">' + u.score + ' XP</div>' +
        '</div>';
    }).join('');
}

// --- ANALYTICS DASHBOARD ---
function renderAnalytics() {
    var container = document.getElementById('analytics-content');
    if (!container) return;

    var data = getCurrentData();
    var totalWords = data ? data.vocab.length : 0;
    var wordsLearned = state.currentWordIndex;
    var pctComplete = totalWords > 0 ? Math.round((wordsLearned / totalWords) * 100) : 0;

    // SRS stats
    var srsData = SRS.getData(state.currentLevel);
    var totalSRS = Object.keys(srsData).length;
    var dueNow = SRS.getDueCount(state.currentLevel);
    var masteredCount = 0;
    for (var key in srsData) {
        if (srsData[key].box >= 4) masteredCount++;
    }

    // Word score stats
    var scoreKey = 'mm_wordScores_' + state.currentLevel;
    var wordScores = {};
    try { wordScores = JSON.parse(localStorage.getItem(scoreKey)) || {}; } catch(e) {}
    var totalAttempts = 0;
    var perfectWords = 0;
    for (var k in wordScores) {
        totalAttempts += wordScores[k].attempts || 0;
        if (wordScores[k].mastered && (wordScores[k].failedStrokes || 0) === 0) perfectWords++;
    }

    // Study time
    var sessionMins = Math.round((Date.now() - state.sessionStartTime) / 60000);

    // Build mastery bar segments
    var masteredPct = totalSRS > 0 ? Math.round((masteredCount / totalSRS) * 100) : 0;
    var learningPct = totalSRS > 0 ? Math.round(((totalSRS - masteredCount) / totalSRS) * 100) : 0;

    var html = '<div class="card" style="margin-bottom:12px;">' +
        '<h3 style="font-size:16px;color:var(--text);margin-bottom:16px;">HSK ' + state.currentLevel + ' Progress</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;">' +
                '<div style="font-size:28px;font-weight:700;color:var(--teal);">' + wordsLearned + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);margin-top:2px;">Words Learned</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;">' +
                '<div style="font-size:28px;font-weight:700;color:var(--teal);">' + pctComplete + '%</div>' +
                '<div style="font-size:11px;color:var(--text-2);margin-top:2px;">Level Complete</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;">' +
                '<div style="font-size:28px;font-weight:700;color:var(--teal);">' + state.streak + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);margin-top:2px;">Day Streak</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;">' +
                '<div style="font-size:28px;font-weight:700;color:var(--teal);">' + state.score + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);margin-top:2px;">Total XP</div>' +
            '</div>' +
        '</div>' +

        // Progress bar
        '<div style="margin-bottom:4px;display:flex;justify-content:space-between;font-size:11px;color:var(--text-2);">' +
            '<span>' + wordsLearned + ' / ' + totalWords + ' words</span>' +
            '<span>' + pctComplete + '%</span>' +
        '</div>' +
        '<div style="background:var(--surface);border-radius:8px;height:8px;overflow:hidden;margin-bottom:16px;">' +
            '<div style="background:linear-gradient(90deg,#00d4aa,#00bfa5);height:100%;width:' + pctComplete + '%;border-radius:8px;transition:width 0.5s;"></div>' +
        '</div>' +
    '</div>' +

    // SRS stats card
    '<div class="card" style="margin-bottom:12px;">' +
        '<h3 style="font-size:16px;color:var(--text);margin-bottom:16px;">Spaced Repetition</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:' + (dueNow > 0 ? 'var(--rose)' : 'var(--teal)') + ';">' + dueNow + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);">Due Now</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:var(--teal);">' + totalSRS + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);">In Review</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:var(--teal);">' + masteredCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);">Mastered</div>' +
            '</div>' +
        '</div>' +
        (dueNow > 0 ? '<button onclick="startSRSReview()" style="width:100%;padding:12px;background:var(--teal);color:#0f1520;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">Review ' + dueNow + ' Due Words</button>' : '') +
    '</div>' +

    // Session stats card
    '<div class="card">' +
        '<h3 style="font-size:16px;color:var(--text);margin-bottom:16px;">This Session</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:var(--teal);">' + state.wordsStudiedThisSession + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);">Words Studied</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:var(--teal);">' + sessionMins + 'm</div>' +
                '<div style="font-size:11px;color:var(--text-2);">Study Time</div>' +
            '</div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">' +
                '<div style="font-size:24px;font-weight:700;color:var(--teal);">' + state.xpToday + '</div>' +
                '<div style="font-size:11px;color:var(--text-2);">XP Today</div>' +
            '</div>' +
        '</div>' +
    '</div>';

    container.innerHTML = html;
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