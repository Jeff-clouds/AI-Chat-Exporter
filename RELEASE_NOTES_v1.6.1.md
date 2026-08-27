# v1.6.1 Release Notes

> **AI documentation notice:** This document was written by AI and may be incorrect. Verify against current code, effective project rules, live behavior, and authoritative sources before acting on it.

## Fixed

- Updated Grok outline selectors to use `[data-testid="user-message"]` and `[data-testid="assistant-message"]`.
- Kept `selectors.js` fallback and `selectors.json` runtime configuration in sync.

## Validation

- `node --check src/config/selectors.js`
- `selectors.json` JSON parse check
- Local browser `querySelectorAll` parse check for the Grok `data-testid` selectors

## Scope

This release only updates selector configuration. Extension end-to-end behavior was not tested.
