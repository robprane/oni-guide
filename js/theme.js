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
        updateSystemThemeIcon();
    } else {
        htmlEl.setAttribute('data-theme', theme);
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