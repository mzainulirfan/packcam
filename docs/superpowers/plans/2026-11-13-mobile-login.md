# Mobile Login Redesign

Implemented 2026-11-13 at user request.

Review: previous login used two bordered panels with redundant system/status rows, monospace form typography, truncated tagline and a 36px password toggle.

Design: one 12px-radius form panel, separate app identity/theme header, Geist UI text, 46px credential inputs, 44px visibility toggle, compact personal-device remember control, inline error, access-help text, and brand tagline below. Existing submit handler, credentials autocomplete, rememberMe payload, token handling and theme state preserved. Inputs lock while a request is pending. Scoped Login.css avoids changing signed-in screens.

Validation: mobile build PASS. Chromium mocked API checks at 320x568 / 390x844: no horizontal overflow; empty submission disabled; reveal/hide password; invalid-credential alert; clear alert on edit; rememberMe request; Enter submission; pending disabled inputs; successful sign-in. Light/dark screenshots inspected. App lint diagnostics identical to baseline (preexisting hook error and warning); whitespace diff check PASS. graphify update attempted but CLI unavailable.
