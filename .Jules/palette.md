## 2026-05-13 - Focus Styles and Empty States
**Learning:** Native `dialog` element combined with keyboard focus often exposes lack of explicit focus rings. A global `:focus-visible` style improves accessibility app-wide with very few lines of code.
**Action:** Always verify keyboard accessibility of interactive elements and ensure empty states provide actionable guidance rather than dead ends.
## 2024-05-14 - Settings Modal and Theme Toggle Icons
**Learning:** Using `rotate(180deg)` combined with `scaleX(-1)` on a vertically symmetrical icon results in zero visual change, breaking visual indicator logic for dark/light themes. `html:not([data-theme])` effectively targets the 'system' default theme fallback gracefully compared to explicit `[data-theme="system"]`.
**Action:** Applied `transform: scaleX(-1)` to flip the icon state, and utilized `html:not([data-theme])` for system theme icon styling without polluting the DOM. Moved settings to a `<dialog>` modal to declutter the navbar and support mobile devices better.
