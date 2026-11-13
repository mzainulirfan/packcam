# Mobile Account Implementation Plan

> Execute inline using executing-plans. User approved implementation with “kerjakan”.

Goal: Implement the approved mobile account design.
Architecture: Preserve SessionTab props and API logic; add scoped account CSS and update presentational markup.
Tech Stack: React, TypeScript, existing Tailwind and CSS tokens.
Spec: docs/superpowers/specs/2026-11-13-mobile-account-design.md

## Constraints
Preserve existing local changes, endpoint behavior, role boundaries, and payment/share functionality. Work in the existing checkout because the reviewed baseline includes uncommitted user changes. No dependencies required.

## Review focus
Long identities at 320px; dark theme; admin versus operator; disabled work mode; collapsed report accessibility.

## Tasks
- [x] Update identity, session metadata, mode control, and logout presentation in SessionTab.tsx.
- [x] Add scoped CSS with 44px controls, focus rings, wrapping, and reduced motion.
- [x] Add accordion aria state and relationships, collapse reports initially, preserve reporting functionality.
- [x] Verify mobile build and scoped lint; inspect diff and run graphify update.

## Ledger
Approved design; native execution. No new automated tests for this reversible presentation change; compiler, lint, and available rendering checks cover the implementation.

Validation: npm run build:mobile PASS; npx eslint apps/mobile/src/tabs/SessionTab.tsx PASS; git diff --check PASS. Browser inspection unavailable (no browser tool or automation package installed). graphify update . could not run: command unavailable; python -m graphify confirms module missing. No graph artifacts changed.
Review: fixed clipped accordion focus ring by removing overflow clipping on report wrappers. Role boundaries and existing report actions preserved.
Follow-up: aligned Account with compact History heading (28px), 14px card insets, 44px segmented admin work mode, compact role/code identity, report accordion styling and logout dialog typography. Browser checks PASS at 320/390 for long names, mode update, accordions, logout confirmation/cancel, operator/admin visibility and dark theme. Mobile build and scoped SessionTab lint PASS. Graphify CLI remains unavailable.
