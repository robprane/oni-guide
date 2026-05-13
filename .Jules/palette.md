## 2026-05-12 - Added Keyboard Navigation to Recipe Cards
**Learning:** The recipe cards were clickable `div` elements without proper keyboard accessibility, which violates a11y standards. When implementing interactive `div` elements, they must be given `role="button"` and `tabindex="0"` along with keyboard event listeners to match native `<button>` behavior.
**Action:** Always ensure interactive elements are accessible via keyboard navigation by implementing appropriate ARIA roles, tabindex, and keydown handlers.
