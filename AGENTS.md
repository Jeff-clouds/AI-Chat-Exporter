# Repository agent instructions

Before changing platform behavior in manifest.json, src/core, src/config, src/export/config, tests, or side-panel lifecycle code:

1. Read PLATFORM_ARCHITECTURE_GUIDE.md first.
2. Identify whether the change belongs to shared lifecycle/UI, the ChatGPT runtime bridge/index, the Doubao passive index, or generic DOM extraction.
3. Treat the host page and a current logged-in long-conversation tab as the source of truth. Fixtures and short chats are not enough for platform claims.
4. Preserve route isolation with tab ID, URL, conversation ID, route generation/epoch, and request token.
5. Never add an unbounded full-page ChatGPT scan.
6. Never auto-scroll Doubao to manufacture completeness.
7. Define every cache's key, authority, lifetime, and cleanup path.
8. Verify cold first-open, A-to-B-to-A switching, streaming updates, long-chat scrolling, and side-panel cleanup.
9. Update the drift ledger and evidence date in PLATFORM_ARCHITECTURE_GUIDE.md when platform reality changes.
10. Create a checkpoint commit or branch before high-risk architecture experiments.

The public repository does not include local scripts/ audit links or reports. When available in the maintainer checkout, use scripts/test-urls.json and scripts/SKILL-dom-selector-audit.md as private live-audit inputs.
