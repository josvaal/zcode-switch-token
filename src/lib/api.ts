import { invoke } from "@tauri-apps/api/core";
import type { ApplyResult, AppState } from "./types";

export function loadState(): Promise<AppState> {
  return invoke("load_state");
}

export function saveState(state: AppState): Promise<void> {
  return invoke("save_state", { state });
}

export function zcodePath(): Promise<string> {
  return invoke("zcode_path");
}

export function applyToken(token: string): Promise<ApplyResult> {
  return invoke("apply_token", { token });
}

export function fetchQuota(token: string): Promise<unknown> {
  return invoke("fetch_quota", { token });
}
