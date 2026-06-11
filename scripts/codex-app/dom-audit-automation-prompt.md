# Codex App Automation Prompt

Create a standalone project automation for this project:

`/Volumes/SanDisk/Users/Jeff/Obsidian Vault/Projects/Jeff-clouds`

Schedule:

```cron
30 9 * * *
```

Run mode:

- Use the local project, not a worktree.
- Use default model and reasoning unless the app requires explicit choices.
- Use sandbox settings that allow shell commands and Chrome Apple Events for this project.

Prompt:

```text
$dom-selector-audit-scheduled

Run the AI chat DOM selector audit for AI-Chat-Exporter and AI-Chat-Outline.

Use the repository root:
/Volumes/SanDisk/Users/Jeff/Obsidian Vault/Projects/Jeff-clouds

Run:
node AI-Chat-Exporter/scripts/run-dom-audit-scheduled.mjs

Then read:
AI-Chat-Exporter/scripts/reports/dom-audit-summary-latest.json

Report in Triage only if there are actionable failures:
- wrapper exits non-zero
- summary status is FAIL
- any platform has SKIP_LOGIN, ERROR, or NAVIGATION_MISMATCH
- any core selector field is MISS or ERROR: title, conversation, turn, question, answer, thinking, markdownBlock

Do not treat these as actionable by themselves:
- DeepSeek search/codeBlock/codeLanguage MISS
- YuanBao codeBlock/codeLanguage MISS
- Grok security challenge

Do not open historical conversations.
Do not send messages to any AI platform.
If status is PASS and only known warnings remain, archive the run / report nothing.
```
