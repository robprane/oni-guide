// Theme management
const themeSelect = document.getElementById('theme-select');
const htmlEl = document.documentElement;

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'system';
themeSelect.value = savedTheme;
applyTheme(savedTheme);

themeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    localStorage.setItem('theme', theme);
    applyTheme(theme);
});

function applyTheme(theme) {
    if (theme === 'system') {
        htmlEl.removeAttribute('data-theme');
    } else {
        htmlEl.setAttribute('data-theme', theme);
    }
}