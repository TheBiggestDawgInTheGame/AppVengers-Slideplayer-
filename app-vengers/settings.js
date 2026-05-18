function applyTheme(theme) {
    const body = document.body;
    const btn = document.getElementById('theme-toggle');

    body.classList.remove('dark-mode', 'light-mode');
    body.classList.add(theme);

    if (theme === 'light-mode') {
        btn.innerText = 'DARK MODE';
    } else {
        btn.innerText = 'LIGHT MODE';
    }
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.classList.contains('light-mode') ? 'light-mode' : 'dark-mode';
    const nextTheme = currentTheme === 'light-mode' ? 'dark-mode' : 'light-mode';

    applyTheme(nextTheme);
    localStorage.setItem('slideplayTheme', nextTheme);
}

// ── Generic persist helpers ──────────────────────────────────────
const SETTINGS_KEY = 'sp_settings';

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (_e) {
        return {};
    }
}

function saveSettings(patch) {
    const current = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(current, patch)));
}

function wireToggle(id, key, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = loadSettings();
    el.checked = key in saved ? saved[key] : defaultVal;
    el.addEventListener('change', () => saveSettings({ [key]: el.checked }));
}

function wireRange(id, key, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = loadSettings();
    el.value = key in saved ? saved[key] : defaultVal;
    el.addEventListener('input', () => saveSettings({ [key]: Number(el.value) }));
}

function wireSelect(id, key, defaultVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = loadSettings();
    const val = key in saved ? saved[key] : defaultVal;
    const opt = Array.from(el.options).find(o => o.value === val || o.text === val);
    if (opt) el.value = opt.value;
    el.addEventListener('change', () => saveSettings({ [key]: el.options[el.selectedIndex].text }));
}

window.addEventListener('DOMContentLoaded', () => {
    // Theme
    const savedTheme = localStorage.getItem('slideplayTheme');
    if (savedTheme === 'light-mode' || savedTheme === 'dark-mode') {
        applyTheme(savedTheme);
    } else {
        applyTheme('dark-mode');
    }

    // All other settings
    wireRange('sfxVolume',    'sfxVolume',    75);
    wireToggle('questAlerts', 'questAlerts',  true);
    wireToggle('ghostMode',   'ghostMode',    false);
    wireSelect('uiMotion',    'uiMotion',     'Full Bloom');
    wireSelect('inputLanguage','inputLanguage','English (US)');
    wireSelect('challengeTier','challengeTier','Hacker');
    wireToggle('publicProfile','publicProfile',true);
    wireToggle('cloudBackup', 'cloudBackup',  true);
});