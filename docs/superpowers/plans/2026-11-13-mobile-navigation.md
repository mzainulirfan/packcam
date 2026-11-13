# Mobile Navigation Redesign

Implemented 2026-11-13 at user request.

Review: duplicate brand wording, monospace chrome inconsistent with current pages, 40px top actions, subtle tab-active border, and fixed 56px spacer unrelated to nav/safe-area height.

Changes: compact brand mark/name/mobile header; 44px theme/logout actions; Geist UI typography; three labeled navigation buttons with aria-current and contrasting active icon surface; 58px nav targets; 820px inner alignment; safe-area bottom padding and matching content spacer. Nav remains beneath sheets/dialogs. Login header unaffected. Existing tab callbacks and logout confirmation preserved. Shared CSS imported by App for both bars.

Validation: build mobile PASS; BottomNav eslint PASS; existing history tests 3/3 PASS; diff whitespace PASS. Chromium with mocked APIs at widths 320/390/820 verifies tab changes, one current tab, keyboard activation, touch targets, overflow, logout/cancel, dark theme, modal overlay layering and Escape. Original dev server briefly cached an unresolved CSS import during file creation; moving shared import to App resolved it and browser checks passed on original port 4173. Temporary verification dev server stopped. graphify update attempted but CLI unavailable.
