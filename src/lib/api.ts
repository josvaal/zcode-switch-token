import { invoke } from "@tauri-apps/api/core";
import type { AgentPath, ApplyResult, AppState, SwitchTargets } from "./types";

export function loadState(): Promise<AppState> {
  return invoke("load_state");
}

export function saveState(state: AppState): Promise<void> {
  return invoke("save_state", { state });
}

export function targetPaths(): Promise<AgentPath[]> {
  return invoke("target_paths");
}

export function applyToken(token: string, targets: SwitchTargets): Promise<ApplyResult> {
  return invoke("apply_token", { token, targets });
}

export function fetchQuota(token: string): Promise<unknown> {
  return invoke("fetch_quota", { token });
}
