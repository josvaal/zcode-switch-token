export interface TokenEntry {
  id: string;
  label: string;
  token: string;
}

export interface SwitchTargets {
  zcode: boolean;
  opencode: boolean;
}

export interface AppState {
  tokens: TokenEntry[];
  activeId: string | null;
  targets: SwitchTargets;
}

export interface AgentPath {
  agent: string;
  path: string;
}

export interface AppliedTarget extends AgentPath {
  backupPath: string | null;
}

export interface ApplyResult {
  applied: AppliedTarget[];
}
