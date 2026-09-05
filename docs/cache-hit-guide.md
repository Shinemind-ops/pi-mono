# Cache-Hit Guide for 軍師 (pi-goldfish-advisor) — Agent Edition

> **極簡軍師 緩存命中手冊（Agent 閱讀版）**
> Version: 2026-09-04 (cache-hit edition) ｜ Audience: any agent that calls 軍師 (executor agents, subordinate agents, subagents)
> Background: DeepSeek (and most modern LLM APIs) do automatic context caching on the server (prefix match, no code change needed) — but whether you hit the cache is decided by **how you call**. This guide tells you how to ask and save ~96%.

---

## TL;DR (一句話)

**要慳錢：連續問同一任務時，每次都帶同一份 `@資料包` 檔案，問題放後面——server 自動命中，慳 96% input token。**
**唔帶資料包：單發短問題本身冇得慳（prefix 太短唔會建立 cache）——呢個係正常，唔好誤會軍師壞咗。**

---

## 基本召喚（任何情況都用得）

```bash
node /path/to/pi/packages/coding-agent/dist/cli.js -p "問題" --model deepseek-chat
```

- 單發問題、唔使帶 context → 用呢個
- 軍師會先思考（默認 high）後答
- 金魚記憶（上次問答）自動 append 喺問題後面——唔使自己管

## 慳錢召喚（連續問同一任務——命中 cache）

**適用**：要對同一份任務資料問多個問題（例如逐個 milestone 問風險、逐個決策點問意見）。

```bash
# 第一次問（會 miss，建立 cache——正常）
node .../cli.js -p "@task-plan.md" "呢個計劃最大風險係咩？" --model deepseek-chat

# 第二次問（同一檔案、唔同問題——96% 命中）
node .../cli.js -p "@task-plan.md" "第二階段最關鍵要做咩？" --model deepseek-chat

# 第三次問（仍然命中——金魚記憶每次唔同都唔擋）
node .../cli.js -p "@task-plan.md" "預算夠唔夠？" --model deepseek-chat
```

⚠️ **@file 格式注意**：`@檔案` 同問題係**兩個獨立參數**（分開），唔好寫成 `"@檔案 問題"` 一個 string——軍師會將成個 string 當檔案路徑 → File not found。

**規則（重要！）：**

| 規則 | 原因 |
|------|------|
| ① 每次 call 都帶**同一份** `@檔案`（路徑不變、內容不變） | cache 係 prefix 完全匹配——檔案唔同就 miss |
| ② `@檔案` 一定要喺問題**前面** | 檔案先係穩定 prefix；問題喺後（每次都變）唔影響檔案命中 |
| ③ 檔案要夠長（起碼幾百 tokens，即 >1KB 中文） | 太短 prefix 唔會建立 cache unit（實測 59 tokens 全 miss） |
| ④ 唔好將「上次答覆」手動塞喺問題前面 | 每次唔同嘅嘢喺前 = 擋住穩定 prefix（金魚記憶已經自動放後面，唔使理） |

**命中幾多？實測數據（2026-09-04）：**

| 場景 | 命中率 |
|------|--------|
| 第一次 call（建立 cache） | 0% |
| 第二次 call 起（同檔案、唔同問題） | **96%** |
| 金魚記憶喺前面（cache-hit edition 前——已修正） | 0%（每次被金魚擋住） |

**慳幾多？** 假設資料包 1300 tokens、問題 50 tokens：
- 唔命中：每次畀 1350 tokens 全價
- 命中：每次 1300 tokens 收 cache 價（~1/10）＋ 50 tokens 全價 → **慳約 90-96% input 成本**

---

## 點解會命中？（機制底細——想知先睇）

DeepSeek「Context Caching on Disk」：server 自動將每個 request 嘅開頭（prefix）存落 disk。之後嘅 request 如果開頭同之前完全一樣，嗰段唔使重新計算，收 cache hit 價（平一個數量級）。

關鍵係「**開頭連續一樣**」：
```
✅ 命中： [系統提示詞][穩定資料包 1300t][問題A 50t]     ← 前兩段同上一次一樣
          [系統提示詞][穩定資料包 1300t][問題B 50t]
                    ↑ 呢兩段一樣 → 命中 96%

❌ 唔中：  [系統提示詞][金魚記憶(每次都唔同)][資料包][問題]  ← 第二段已經唔同，後面全 miss
```

**完全命中責任交回用戶手上 (cache-hit responsibility is delegated to the caller).**
The cache-hit edition (2026-09-04) moved goldfish memory from *wrapping the prompt* to *appending after the question* — so a stable data pack becomes the request prefix and nothing in 軍師 blocks the cache anymore. Whether you hit the cache is now entirely up to how you call.

---

## 驗證有冇命中（自己測）

軍師 CLI 冇直接顯示 cache 數字。想驗證可以：

1. 準備一份長資料包（>1KB）
2. 連續問兩次（同一檔案、唔同問題）
3. 比較兩次嘅「時間」或「成本」——第二次應該明顯平（如果 backend 有報價）

或者用 API 直接測（睇 `prompt_cache_hit_tokens`）：

```python
# response usage 入面睇呢兩個數字
usage.prompt_cache_hit_tokens   # >0 = 有命中
usage.prompt_cache_miss_tokens  # 其餘部分
```

---

## 陷阱

- ❌ **將任務資料直接貼喺問題文字入面**（每次重新打）——miss，同帶 @file 唔同
- ❌ **每次 call 用唔同嘅檔案副本**（例如改咗一個字）——miss，prefix 要完全一樣
- ❌ **短問題單發仲諗住有命中**——prefix 太短唔建立 cache，呢個係正常
- ❌ **叫下屬問軍師時，叫佢手動將上次答覆放最前**——會擋 cache，金魚記憶已經自動處理

---

## 相關

- README「The cache-hit edition (緩存命中篇)」section——版本說明
- `packages/coding-agent/src/modes/print-mode.ts`——金魚記憶注入位（A 方案改動所在）
