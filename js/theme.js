// Theme management
const htmlEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeSystemBtn = document.getElementById('theme-system-btn');
const systemMediaMatch = window.matchMedia('(prefers-color-scheme: dark)');

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'system';
applyTheme(savedTheme);

function applyTheme(theme) {
    if (theme === 'system') {
        htmlEl.removeAttribute('data-theme');
        themeSystemBtn.classList.add('active');
        themeToggleBtn.classList.remove('active');
        updateSystemThemeIcon();
    } else {
        htmlEl.setAttribute('data-theme', theme);
        themeToggleBtn.classList.add('active');
        themeSystemBtn.classList.remove('active');
    }
}

function updateSystemThemeIcon() {
    if (localStorage.getItem('theme') === 'system' || !localStorage.getItem('theme')) {
        const circleHalfIcon = themeToggleBtn.querySelector('.icon-circle-half');
        if (circleHalfIcon) {
            if (systemMediaMatch.matches) {
                circleHalfIcon.classList.add('is-dark');
            } else {
                circleHalfIcon.classList.remove('is-dark');
            }
        }
    }
}

themeToggleBtn.addEventListener('click', () => {
    let newTheme;
    const currentStoredTheme = localStorage.getItem('theme') || 'system';

    if (currentStoredTheme === 'system') {
        newTheme = systemMediaMatch.matches ? 'light' : 'dark';
    } else {
        newTheme = currentStoredTheme === 'dark' ? 'light' : 'dark';
    }

    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
});

themeSystemBtn.addEventListener('click', () => {
    localStorage.setItem('theme', 'system');
    applyTheme('system');
});

systemMediaMatch.addEventListener('change', updateSystemThemeIcon);

// Settings Modal Logic
const settingsBtn = document.getElementById('settings-btn');
const settingsDialog = document.getElementById('settings-dialog');
const closeSettingsBtn = document.getElementById('close-settings-btn');

settingsBtn.addEventListener('click', () => {
    settingsDialog.showModal();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsDialog.close();
});

// Close when clicking outside of the modal
settingsDialog.addEventListener('click', (e) => {
    const dialogDimensions = settingsDialog.getBoundingClientRect();
    if (
        e.clientX < dialogDimensions.left ||
        e.clientX > dialogDimensions.right ||
        e.clientY < dialogDimensions.top ||
        e.clientY > dialogDimensions.bottom
    ) {
        settingsDialog.close();
    }
});
// Unit Settings Management
window.unitSettings = {
    temp: localStorage.getItem('unit_temp') || 'C',
    time: localStorage.getItem('unit_time') || 's',
    mass: localStorage.getItem('unit_mass') || 'g',
    food: localStorage.getItem('unit_food') || 'mass'
};

function initUnitSettings() {
    const categories = ['temp', 'time', 'mass', 'food'];

    categories.forEach(category => {
        updateUnitButtons(category, window.unitSettings[category]);
    });

    // Setup event listeners
    document.getElementById('unit-temp-c-btn').addEventListener('click', () => setUnit('temp', 'C'));
    document.getElementById('unit-temp-f-btn').addEventListener('click', () => setUnit('temp', 'F'));

    document.getElementById('unit-time-s-btn').addEventListener('click', () => setUnit('time', 's'));
    document.getElementById('unit-time-cycle-btn').addEventListener('click', () => setUnit('time', 'cycle'));

    document.getElementById('unit-mass-g-btn').addEventListener('click', () => setUnit('mass', 'g'));
    document.getElementById('unit-mass-kg-btn').addEventListener('click', () => setUnit('mass', 'kg'));

    document.getElementById('unit-food-mass-btn').addEventListener('click', () => setUnit('food', 'mass'));
    document.getElementById('unit-food-kcal-btn').addEventListener('click', () => setUnit('food', 'kcal'));
}

function setUnit(category, value) {
    window.unitSettings[category] = value;
    localStorage.setItem(`unit_${category}`, value);
    updateUnitButtons(category, value);
    window.dispatchEvent(new Event('settingsupdated'));
}

function updateUnitButtons(category, value) {
    const container = document.getElementById(`unit-${category}-container`);
    if (!container) return;

    const buttons = container.querySelectorAll('.theme-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    let activeBtnId = '';
    if (category === 'temp') activeBtnId = value === 'C' ? 'unit-temp-c-btn' : 'unit-temp-f-btn';
    else if (category === 'time') activeBtnId = value === 's' ? 'unit-time-s-btn' : 'unit-time-cycle-btn';
    else if (category === 'mass') activeBtnId = value === 'g' ? 'unit-mass-g-btn' : 'unit-mass-kg-btn';
    else if (category === 'food') activeBtnId = value === 'mass' ? 'unit-food-mass-btn' : 'unit-food-kcal-btn';

    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) activeBtn.classList.add('active');
}

initUnitSettings();
