/**
 * Print mode (single-shot): Send prompts, output result, exit.
 *
 * Used for:
 * - `pi -p "prompt"` - text output
 * - `pi --mode json "prompt"` - JSON event stream
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AssistantMessage, ImageContent } from "@mariozechner/pi-ai";
import type { AgentSessionRuntime } from "../core/agent-session-runtime.js";
import { flushRawStdout, writeRawStdout } from "../core/output-guard.js";

/**
 * Options for print mode.
 */
export interface PrintModeOptions {
	/** Output mode: "text" for final response only, "json" for all events */
	mode: "text" | "json";
	/** Array of additional prompts to send after initialMessage */
	messages?: string[];
	/** First message to send (may contain @file content) */
	initialMessage?: string;
	/** Images to attach to the initial message */
	initialImages?: ImageContent[];
}

/**
 * Run in print (single-shot) mode.
 * Sends prompts to the agent and outputs the result.
 */
export async function runPrintMode(runtimeHost: AgentSessionRuntime, options: PrintModeOptions): Promise<number> {
	const { mode, messages = [], initialMessage, initialImages } = options;
	let exitCode = 0;
	let session = runtimeHost.session;
	let unsubscribe: (() => void) | undefined;

	const rebindSession = async (): Promise<void> => {
		session = runtimeHost.session;
		await session.bindExtensions({
			commandContextActions: {
				waitForIdle: () => session.agent.waitForIdle(),
				newSession: async (newSessionOptions) => {
					const result = await runtimeHost.newSession(newSessionOptions);
					if (!result.cancelled) {
						await rebindSession();
					}
					return result;
				},
				fork: async (entryId) => {
					const result = await runtimeHost.fork(entryId);
					if (!result.cancelled) {
						await rebindSession();
					}
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, navigateOptions) => {
					const result = await session.navigateTree(targetId, {
						summarize: navigateOptions?.summarize,
						customInstructions: navigateOptions?.customInstructions,
						replaceInstructions: navigateOptions?.replaceInstructions,
						label: navigateOptions?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath) => {
					const result = await runtimeHost.switchSession(sessionPath);
					if (!result.cancelled) {
						await rebindSession();
					}
					return result;
				},
				reload: async () => {
					await session.reload();
				},
			},
			onError: (err) => {
				console.error(`Extension error (${err.extensionPath}): ${err.error}`);
			},
		});

		unsubscribe?.();
		unsubscribe = session.subscribe((event) => {
			if (mode === "json") {
				writeRawStdout(`${JSON.stringify(event)}\n`);
			}
		});
	};

	try {
		if (mode === "json") {
			const header = session.sessionManager.getHeader();
			if (header) {
				writeRawStdout(`${JSON.stringify(header)}\n`);
			}
		}

		await rebindSession();

		// 魔改（軍師版）：2 句金魚腦記憶——按 cwd 分開（多 Agent 並行唔會串）
		// A 方案（2026-09-04）：金魚記憶由「包住 prompt 前面」改為「放問題之後」——
		// 令穩定 fileText（@資料包）成為 prefix 嘅一部分，DeepSeek server 自動 cache 命中（實測 0%→97%）
		const agentDir = runtimeHost.services?.agentDir ?? "";
		const safeCwd = `--${(runtimeHost.services?.cwd ?? "").replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
		const exchangePath = join(agentDir, "exchanges", safeCwd, "last-exchange.json");
		const lastExchange = readLastExchange(exchangePath);
		let promptText = initialMessage;
		if (lastExchange && promptText) {
			promptText = `${promptText}\n\n【上次你問】${lastExchange.user}\n【上次我答】${lastExchange.assistant}`;
		}
		if (promptText) {
			await session.prompt(promptText, { images: initialImages });
		}

		for (const message of messages) {
			await session.prompt(message);
		}

		if (mode === "text") {
			const state = session.state;
			const lastMessage = state.messages[state.messages.length - 1];

			if (lastMessage?.role === "assistant") {
				const assistantMsg = lastMessage as AssistantMessage;
				if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
					console.error(assistantMsg.errorMessage || `Request ${assistantMsg.stopReason}`);
					exitCode = 1;
				} else {
					let assistantText = "";
					for (const content of assistantMsg.content) {
						if (content.type === "text") {
							writeRawStdout(`${content.text}\n`);
							assistantText += content.text;
						}
					}
					// 保存今次 exchange（2 句記憶——下次 call 用）
					if (initialMessage) {
						writeLastExchange(exchangePath, initialMessage, assistantText);
					}
				}
			}
		}

		return exitCode;
	} catch (error: unknown) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	} finally {
		unsubscribe?.();
		await runtimeHost.dispose();
		await flushRawStdout();
	}
}

/** 魔改：讀上次 exchange（2 句記憶）——冇就 null */
function readLastExchange(path: string): { user: string; assistant: string } | null {
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		return typeof parsed.user === "string" && typeof parsed.assistant === "string" ? parsed : null;
	} catch {
		return null;
	}
}

/** 魔改：保存今次 exchange（2 句記憶） */
function writeLastExchange(path: string, user: string, assistant: string): void {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify({ user, assistant }));
	} catch {
		// 寫失敗唔影響正常輸出
	}
}
