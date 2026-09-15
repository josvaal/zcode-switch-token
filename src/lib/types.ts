export interface TokenEntry {
  id: string;
  label: string;
  token: string;
}

export interface AppState {
  tokens: TokenEntry[];
  activeId: string | null;
}

export interface ApplyResult {
  path: string;
  backupPath: string | null;
}
