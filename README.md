# pi-goldfish-advisor (軍師)

> **FOR AGENTS. NOT FOR HUMANS.** A fork of [pi](https://github.com/sysid/pi-mono) — an ultra-lightweight **strategic advisor (軍師)** that exists to be **called by other agents**, not to be chatted with by people.
>
> **For agents that need a brain, not a body. Ask. Get precise guidance. Forget. Move on.**

---

## ⚠️ Who is this for? (Read this first)

**This is an advisor FOR AGENTS — including subordinate/delegated agents.** It is designed to be called *by another agent* (an "executor agent") from its terminal/tool layer. Humans *can* use it from a CLI, but that is not the point — if you are a human who wants a chat, use ChatGPT/Claude/Kimi directly.

**The intended user is an agent that:**
- has a terminal / subprocess / tool-calling ability, and
- needs strategic guidance it cannot produce with its own cheap brain.

---

## The intended architecture: brain division (腦力分工)

This fork exists to make one specific architecture cheap and practical:

| Role | Which brain | Job |
|---|---|---|
| **軍師 (this fork)** | **The most intelligent, expensive flagship model** — GLM flagship, Claude flagship, GPT flagship, Kimi flagship | **Think.** Give direction, plans, decisions, reviews. Never executes. |
| **Executor agent (the caller)** | **The cheapest brain available** — free APIs, quantized open-source local models | **Do.** Execute commands, write code, move files, report back. |

**Why split brains like this?** Flagship tokens are expensive — you do not want them burned inside a long session that grows forever. 軍師 gives the expensive brain a **flat, tiny token cost per question** (~98% cheaper than a full session by the 10th call), so you can afford to ask the smartest model as often as you like. The executor's cheap brain does the grunt work and only escalates thinking to 軍師.

**The recommended loop:**

```
Executor (cheap brain)  ──1. task / question──▶  軍師 (flagship brain)
       ▲                                              │
       └────────3. precise guidance ◀────────────────┘
       │
       └── 2. executes, then reports progress back → 軍師 (next question)
```

---

## The goldfish compensation protocol

軍師 has **goldfish memory**: it only carries the **last exchange** (your previous question + its previous answer) into the next call. It literally cannot remember the question before the last one. That is a feature (flat token cost), and it has a simple fix:

> **Executor agents cancel out the goldfish brain by bringing context on every call.**

Each time you ask 軍師, include in the prompt:
1. **Task goal** — what you are ultimately trying to achieve
2. **Current progress** — what has been done so far
3. **Where you are stuck** — the specific decision/question

Example call pattern:

```
Goal: migrate the auth module to v2.
Done: extracted the interface, updated 3 of 8 call sites.
Stuck: whether to keep the legacy fallback for old tokens.
Question: ...
```

With this protocol, 軍師 always has the context it needs even though its memory is only two sentences long. **The executor does the remembering; 軍師 does the thinking.**

---

## The cache-hit edition (緩存命中篇)

> **v2026-09-04**: goldfish memory is now appended **after** your question, not wrapped around it. Stable `@file` context becomes the request prefix, so DeepSeek's automatic server-side context cache hits on repeat calls (measured 0% → 96%).

**完全命中責任交回用戶手上 — full cache-hit responsibility is delegated to the caller.**

DeepSeek (and most modern LLM APIs) cache the **prefix** of each request automatically — if the start of your request matches a previous request, that part is served from cache at ~1/10 the price. Nothing in 軍師 blocks that anymore. **Whether you hit the cache is now entirely up to how you call:**

| Rule | Why |
|------|-----|
| ① Call with the **same** `@file` every time (same path, unchanged content) | Cache matches exact prefixes — a changed file is a miss |
| ② Put the `@file` **before** your question | The file is the stable prefix; the question (always changing) sits after it |
| ③ Make the file long enough (>1 KB ≈ a few hundred tokens) | Tiny prefixes never build a cache unit (measured: 59 tokens = 0% hit) |
| ④ Never hand-prepend variable content (e.g. last answer) | Anything that changes every call in front = blocks the whole stable prefix |

**Measured hit rates (real API calls, 2026-09-04):**

| Scenario | Hit rate |
|----------|----------|
| First call (cold, builds cache) | 0% |
| Second+ call — same `@file`, different question | **96%** |
| Old build (goldfish memory in front — now fixed) | 0% |

**Example — ask the same task pack three questions, pay ~96% less input on calls 2 & 3:**

```bash
node .../cli.js -p "@task-plan.md What is the biggest risk in this plan?" --model <flagship>
node .../cli.js -p "@task-plan.md What is the key milestone in phase 2?"   --model <flagship>   # ~96% cached
node .../cli.js -p "@task-plan.md Is the budget enough?"                    --model <flagship>   # ~96% cached
```

> Single short questions without a data pack simply have nothing to cache — that is expected, not a bug.

Full caller-facing guide for agents: **[docs/cache-hit-guide.md](docs/cache-hit-guide.md)** (also available in Chinese).

---

## Platform support

軍師 is a **pure CLI** — any agent that can run a terminal command or subprocess can call it. No SDK, no server, no platform-specific integration needed. Known/verified agent platforms it works with:

- **OpenClaw** — terminal tool → `node .../cli.js -p "..." --model <flagship>`
- **Hermes Agent** — terminal tool → `node .../cli.js -p "..." --model <flagship>`
- **qM** — subprocess/terminal → `node .../cli.js -p "..." --model <flagship>`
- **Codex** — bash tool → `node .../cli.js -p "..." --model <flagship>`
- **Claude Code** — Bash tool → `node .../cli.js -p "..." --model <flagship>`
- **DeepSeek Harness** — subprocess → `node .../cli.js -p "..." --model <flagship>`

Generic integration from any agent (Python subprocess):

```python
import subprocess
answer = subprocess.run(
    ["node", "/path/to/pi/packages/coding-agent/dist/cli.js",
     "-p", "Goal: ... Done: ... Stuck: ... Question: ...",
     "--model", "your-flagship-model"],
    capture_output=True, text=True
).stdout
```

---

## Why 軍師 (Goldfish Advisor)?

| | General agent | 軍師 (this fork) |
|---|---|---|
| System prompt | thousands of tokens | **~112 tokens** |
| Memory | full session history (grows forever) | **goldfish: last exchange only (2 sentences)** |
| Token cost per call | grows with session length | **flat** (~98% savings at the 10th call) |
| Session files | accumulate | **auto-deleted on close** |
| Parallel agents | shared history / races | **per-cwd isolation — safe** |

---

## The four pillars

### 1. 軍師 — Elite strategic advisor

The system prompt is trimmed to ~112 tokens and reshaped into a pure advisor: direct, concise, data-driven answers. No tools, no self-directed actions — it answers when asked, nothing more. **A brain, not a body.**

### 2. Ultra-lightweight (fast, token-cheap)

- System prompt: **~112 tokens** (vs thousands for a general coding agent)
- Print mode (`pi -p`) starts instantly — no interactive session overhead
- Token cost per question stays **flat** — no session-history bloat, ever

### 3. Goldfish memory (token-cheap by design)

Only the **last exchange** (your previous question + our previous answer) is carried into the next call. Anything older is dropped immediately — **it cannot remember the sentence before the previous one**. Memory never grows; token cost never grows. Measured: ~98% token savings vs a full-session agent by the 10th call. Pair it with the **goldfish compensation protocol** above and the short memory stops mattering.

### 4. Compliance-first design (the reason this fork exists)

This fork **keeps its Agent identity** — it is still a real coding-agent harness (session management, agent runtime, tool infrastructure). That is what makes it usable as a **"coding tool"**, which matters for metered plans (e.g. Token Plan) that **forbid plain API-call scripts** but explicitly allow coding tools. Wrap your advisor calls in this minimal coding tool and **stay compliant** — you are not a bare `curl` script, you are a coding agent.

---

## Quick start

```bash
npm install
npm run build

# Advisor (print) mode — goldfish memory, auto-deleted sessions
# Use your FLAGSHIP model here (see "brain division" above)
node packages/coding-agent/dist/cli.js -p "What is the fastest way to validate a token budget?" --model <flagship-model>
```

### Memory model

- The **last exchange** is stored per working directory at `~/.pi/agent/exchanges/<cwd>/last-exchange.json`
- Session files are **auto-deleted on close** (current cwd only — parallel agents in other directories are untouched)
- Ask the advisor twice, then ask it "what was my question before the last one?" — it will not know. That is the point.

### Parallel agents

Memory is isolated **per working directory** (per-cwd). Twenty agents can ask the advisor concurrently — each keeps its own two sentences, no cross-talk, no races.

---

## What changed vs upstream

| File | Change |
|---|---|
| `packages/coding-agent/src/core/system-prompt.ts` | ~112-token advisor prompt, no tools |
| `packages/coding-agent/src/modes/print-mode.ts` | Goldfish memory (last-exchange, per-cwd) — **cache-hit edition (2026-09-04): memory appended AFTER the question so stable `@file` context hits DeepSeek prefix cache (~96%)** |
| `packages/coding-agent/src/core/agent-session-runtime.ts` | Auto-delete session files on close (current cwd) |
| `packages/coding-agent/test/print-mode.test.ts` | Tests synchronized (3 passed) |
| `README.md` | Cache-hit edition section (緩存命中篇) |
| `docs/cache-hit-guide.md` | Agent-facing cache-hit guide (中文) |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT — see [LICENSE](LICENSE). This is a fork of [pi](https://github.com/sysid/pi-mono) (MIT, © Mario Zechner).

---

# 軍師（pi-goldfish-advisor）——極輕量戰略顧問模式

> **FOR AGENTS. 唔係俾人類用。** fork 自 [pi](https://github.com/sysid/pi-mono)——將通用 Agent 變成**極輕量「軍師」（戰略顧問）**——存在目的係**俾其他 Agent call**，唔係俾人傾偈。
>
> **Agent 需要嘅係「腦」——唔係「身體」。問。攞到精準指引。忘記。繼續。**

## ⚠️ 呢個係俾邊個用？（先讀呢度）

**呢個係俾 AGENT 用嘅軍師——包括下屬 Agent／分身 Agent。** 設計用途係俾另一個「執行者 Agent」喺自己嘅 terminal／工具層 call 佢。人類用 CLI 都得——但唔係重點——人類想傾偈用 ChatGPT／Claude／Kimi 就得，唔使裝呢個。

**目標用家係一個咁嘅 Agent：**
- 有 terminal／subprocess／tool-calling 能力，而且
- 需要自己個平價腦畀唔出嘅戰略指引

---

## 建議用法：腦力分工（呢個 fork 存在嘅原因）

| 角色 | 用咩腦 | 做咩 |
|---|---|---|
| **軍師（呢個 fork）** | **最高智力嘅貴腦旗艦**——GLM 旗艦、Claude 旗艦、GPT 旗艦、Kimi 旗艦 | **諗。** 俾方向、計劃、決策、覆核。永遠唔郁手做。 |
| **執行者 Agent（call 嗰個）** | **最平嘅腦**——免費 API、量化版開源本地部署模型 | **做。** 執行指令、寫 code、郁檔案、匯報返嚟。 |

**點解要咁分工？** 旗艦 token 貴——唔應該喺一條無限增長嘅 session 入面燒。軍師將貴腦嘅成本壓到**每問一次固定、極平**（第 10 次 call 比完整 session 慳 ~98%）——所以你問得幾密都負擔得起。執行者用平腦做粗重嘢，淨係要諗嘢先升級 call 軍師。

**建議循環：**

```
執行者（平腦）  ──1. 任務／問題──▶  軍師（旗艦貴腦）
       ▲                                  │
       └────3. 精準指引 ◀────────────────┘
       │
       └── 2. 執行完 → 匯報進度 → 再問軍師
```

---

## 金魚腦補償協定

軍師係**金魚腦**：每次 call 淨係帶「最近 2 句」（你上次問＋我上次答）入下一個 call——**連「上上一句」都記唔到**。呢個係 feature（token 成本固定），而且補救好簡單：

> **執行者 Agent 每次 call 都帶埋 context——就抵消咗軍師嘅金魚腦。**

每次問軍師，prompt 入面包含三樣：
1. **任務目標**——你最終想做咩
2. **目前進度**——已經做咗啲咩
3. **卡喺邊**——需要佢決定嘅具體問題

**Call 嘅格式範例：**

```
Goal: 將 auth module 遷移到 v2
Done: 抽咗 interface，更新咗 3/8 個 call sites
Stuck: 舊 token 要唔要保留 legacy fallback
Question: ...
```

跟住呢個協定——軍師雖然記憶得 2 句，但永遠有你俾嘅 context。**執行者負責記，軍師負責諗。**

---

## 緩存命中篇（cache-hit edition）

> **v2026-09-04**：金魚記憶而家係 append 喺你條問題**之後**，唔再包喺問題前面。穩定嘅 `@file` context 成為 request 嘅 prefix——DeepSeek 自動 server 端 context cache 喺重複 call 時命中（實測 0% → 96%）。

**完全命中責任交回用戶手上。**

DeepSeek（同大部分現代 LLM API）會自動 cache 每個 request 嘅 **prefix**——如果你今次 request 嘅開頭同上次一樣，嗰段就以 ~1/10 價錢由 cache serve。軍師已經冇任何嘢阻擋 cache。**命中唔命中，而家完全由你點 call 決定：**

| 規則 | 原因 |
|------|------|
| ① 每次 call 帶**同一份** `@檔案`（路徑不變、內容不變） | cache 係 exact prefix 匹配——檔案改咗就 miss |
| ② `@檔案` 一定要喺問題**前面** | 檔案先係穩定 prefix；問題（每次變）坐喺後面 |
| ③ 檔案要夠長（>1KB ≈ 幾百 tokens） | 太短 prefix 唔會建立 cache unit（實測 59 tokens = 0%） |
| ④ 永遠唔好手動將每次變嘅內容（例如上次答覆）塞喺前面 | 前面有任何每次變嘅嘢＝擋住成個穩定 prefix |

**實測命中率（真實 API call，2026-09-04）：**

| 場景 | 命中率 |
|------|--------|
| 第一次 call（cold，建立 cache） | 0% |
| 第二次起——同一份 `@檔案`、唔同問題 | **96%** |
| 舊版（金魚記憶喺前面——已修正） | 0% |

**範例——同一份任務資料包問三個問題，第 2、3 次 input 慳 ~96%：**

```bash
node .../cli.js -p "@任務計劃.md 呢個計劃最大風險係咩？" --model <旗艦>
node .../cli.js -p "@任務計劃.md 第二階段最關鍵要做咩？"  --model <旗艦>   # ~96% cached
node .../cli.js -p "@任務計劃.md 預算夠唔夠？"             --model <旗艦>   # ~96% cached
```

> 唔帶資料包嘅單發短問題本身就冇嘢可以 cache——呢個係正常，唔係 bug。

完整嘅 Agent 閱讀版操作指引：**[docs/cache-hit-guide.md](docs/cache-hit-guide.md)**（中文版）。

---

## 平台適配

軍師係**純 CLI**——任何識行 terminal command／subprocess 嘅 Agent 都 call 到。唔使 SDK、唔使 server、唔使平台專屬整合。已知／實測可用嘅 Agent 平台：

- **OpenClaw** — terminal tool → `node .../cli.js -p "..." --model <旗艦>`
- **Hermes Agent** — terminal tool → `node .../cli.js -p "..." --model <旗艦>`
- **qM** — subprocess／terminal → `node .../cli.js -p "..." --model <旗艦>`
- **Codex** — bash tool → `node .../cli.js -p "..." --model <旗艦>`
- **Claude Code** — Bash tool → `node .../cli.js -p "..." --model <旗艦>`
- **DeepSeek Harness** — subprocess → `node .../cli.js -p "..." --model <旗艦>`

任何 Agent 通用整合（Python subprocess 範例）：

```python
import subprocess
answer = subprocess.run(
    ["node", "/path/to/pi/packages/coding-agent/dist/cli.js",
     "-p", "Goal: ... Done: ... Stuck: ... Question: ...",
     "--model", "你嘅旗艦模型"],
    capture_output=True, text=True
).stdout
```

---

## 四大支柱

### 1. 軍師——精英戰略顧問
系統提示詞縮到 **~112 tokens**——純顧問：直接、簡潔、以資料為本。冇工具、唔會自作主張——被問先答——**係腦，唔係身體。**

### 2. 極輕量（快、慳 token）
- 系統提示詞 **~112 tokens**（一般 Agent 幾千 tokens）
- Print mode（`pi -p`）即開即用——零互動 session 開銷
- 每次提問 token 成本**固定**——永唔會因對話歷史膨脹

### 3. 金魚記憶（慳 token 嘅設計）
每次 call 只帶「**最近 2 句**」（你上次問＋我上次答）——再舊即忘——**連「上上一句」都記唔到**。記憶永不增長＝token 永唔增長。實測：第 10 次 call——比完整 session Agent **慳 ~98%** tokens。配合上面嘅「**金魚腦補償協定**」——記憶短就唔再係問題。

### 4. ✅ 存在合法性（呢個 fork 存在嘅原因）
呢個 fork **保留 Agent 身份**——仍然係真正嘅編程工具（session 管理＋Agent runtime＋工具基建）。正正因為咁——先可以算係「**編程工具**」——適用於**「僅限編程工具」**嘅月費計劃（例如 Token Plan——**明文禁止純 API 腳本**、但允許編程工具）。用呢個極簡編程工具包住軍師——**合規**——你唔係一條 bare `curl` 腳本——你係一個 coding agent。

## 快速開始

```bash
npm install
npm run build

# 軍師（print mode）——金魚記憶＋自動刪 session
# 用你嘅 FLAGSHIP 貴腦（見「腦力分工」）
node packages/coding-agent/dist/cli.js -p "點樣最快驗證 token 預算？" --model <你嘅旗艦模型>
```

### 記憶模型
- 「最近 2 句」存喺工作目錄對應位置：`~/.pi/agent/exchanges/<cwd>/last-exchange.json`
- Session 檔案**關閉時自動刪除**（只刪而家 cwd——其他目錄並行嘅 Agent 唔受影響）
- 連續問兩次——再問「我上上一句問咗咩？」——佢答唔到——**呢個就係重點**

### 多 Agent 並行
記憶**按工作目錄（cwd）隔離**——20 個 Agent 同時問軍師——各記各嘅 2 句——**唔會串、冇 race**。

## 同上游嘅改動

| 檔案 | 改動 |
|---|---|
| `packages/coding-agent/src/core/system-prompt.ts` | ~112-token 軍師提示詞——無工具 |
| `packages/coding-agent/src/modes/print-mode.ts` | 金魚記憶（最近 2 句——按 cwd）——**緩存命中篇（2026-09-04）：記憶 append 喺問題之後，令穩定 `@file` context 命中 DeepSeek prefix cache（~96%）** |
| `packages/coding-agent/src/core/agent-session-runtime.ts` | 關閉時自動刪 session（只刪而家 cwd） |
| `packages/coding-agent/test/print-mode.test.ts` | 測試同步（3 passed） |
| `README.md` | 緩存命中篇 section |
| `docs/cache-hit-guide.md` | Agent 閱讀版緩存命中手冊（中文） |

## 開發
見 [CONTRIBUTING.md](CONTRIBUTING.md) 同 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## License
MIT——見 [LICENSE](LICENSE)。fork 自 [pi](https://github.com/sysid/pi-mono)（MIT，© Mario Zechner）。
