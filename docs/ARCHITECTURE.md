# Architecture — 軍師 (Goldfish Advisor) fork

This document explains how the advisor fork differs from upstream [pi](https://github.com/sysid/pi-mono) and how to extend it. Upstream architecture docs remain valid for everything not listed here.

## Module map (changed files only)

```
packages/coding-agent/src/
├── core/
│   ├── system-prompt.ts          ← advisor prompt (~112 tokens), no tools
│   └── agent-session-runtime.ts  ← auto-delete session files on close (current cwd)
└── modes/
    └── print-mode.ts             ← goldfish memory: last-exchange, per-cwd

packages/coding-agent/test/
└── print-mode.test.ts            ← synchronized tests (runPrintMode: 3 passed)
```

## The three mods

### 1. Advisor prompt — `system-prompt.ts`

Upstream builds a large default prompt (tools, guidelines, examples). The fork:

- `selectedTools` defaults to `[]` (no tools — pure advisor)
- `guidelines` replaced with advisor rules (direct, concise, data-driven)
- `prompt` replaced with the 軍師 identity: "You are an elite strategic advisor (軍師)... You do not need tools"

Measured output: **~112 tokens** for the full system prompt (upstream: thousands).

### 2. Goldfish memory — `print-mode.ts`

Print mode (`pi -p`) is the advisor's entry point. The fork adds:

- **Read** `~/.pi/agent/exchanges/<cwd>/last-exchange.json` before the call
- If present, prepend the last exchange to the prompt:
  `【上次你問】<last user>【上次我答】<last assistant>【今次問題】<current>`
- **Save** the current exchange after the call (`writeLastExchange`)
- Per-cwd path (`safeCwd`) isolates concurrent agents — no cross-talk

Helpers: `readLastExchange()` / `writeLastExchange()` at the bottom of the file.

### 3. Auto-delete sessions — `agent-session-runtime.ts`

`dispose()` now calls `autoDeleteSessionFiles()`:

- Deletes the **current cwd** session directory via `getDefaultSessionDir(cwd, agentDir)` — not all sessions, so parallel agents in other directories are untouched
- Wrapped in try/catch — deletion failure must never break shutdown

## How to extend

| Want to | Touch |
|---|---|
| Change advisor personality / guidelines | `system-prompt.ts` — `guidelines` + `prompt` |
| Change memory length (2 sentences → N) | `print-mode.ts` — `lastExchange` handling (add a rolling store) |
| Attach a knowledge base | Add an MCP client to `print-mode.ts` (or a sibling module) and inject retrieved snippets into the prompt |
| Change session cleanup policy | `agent-session-runtime.ts` — `autoDeleteSessionFiles()` |

## Verification

```bash
npm install
npm run build                      # full monorepo build
cd packages/coding-agent
npx vitest --run -t "runPrintMode" # print-mode tests: 3 passed

# Functional check (needs a model + API key configured)
node packages/coding-agent/dist/cli.js -p "Answer with one word: 1+1=?" --model deepseek-chat
# → 2

# Goldfish memory check (two-sentence only)
node packages/coding-agent/dist/cli.js -p "My name is Alice" --model deepseek-chat
node packages/coding-agent/dist/cli.js -p "What is my name?" --model deepseek-chat        # → Alice
node packages/coding-agent/dist/cli.js -p "What was my question before the last one?" --model deepseek-chat  # → does not know (by design)
```

## Known limitations

- Print mode only — the advisor is designed for single-shot Q&A, not interactive sessions
- Memory is exactly 2 sentences (last exchange) — by design, to keep token cost flat
- Session files are deleted on close — no conversation history is retained (again, by design)
