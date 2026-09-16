// Browser demo entry: installs a mock Tauri IPC bridge so the real UI can be
// exercised (and screenshotted) without the Tauri shell. Production builds
// never import this module — only demo.html references it. All data here is
// fabricated; never put real tokens in this file.
import type { AgentPath, AppState, ApplyResult, SwitchTargets } from "../lib/types";

type InvokeArgs = Record<string, unknown> | undefined;

interface QuotaWindow {
  type: string;
  usageAmount: number;
  totalAmount: number;
  resetTime: string;
}

interface QuotaResponse {
  success: boolean;
  code: number;
  data: { windows: QuotaWindow[] };
}

const state: AppState = {
  tokens: [
    {
      id: "demo-token-1",
      label: "Plan principal",
      token: "zai_7f3a9c2e8b1d4f6a0e5c8b2d7f9a1c4e",
    },
    {
      id: "demo-token-2",
      label: "Backup oficina",
      token: "zai_2b8e4d6f1a9c3e7b5d0f8a2c6e4b9d1f",
    },
    {
      id: "demo-token-3",
      label: "Token de prueba",
      token: "zai_9d1c5f7b3a8e2d6c4f0b8a5e7d3c1f9a",
    },
  ],
  activeId: "demo-token-1",
  targets: { zcode: true, opencode: true },
};

const PATHS: AgentPath[] = [
  { agent: "zcode", path: "/home/demo/.zcode/v2/config.json" },
  { agent: "opencode", path: "/home/demo/.local/share/opencode/auth.json" },
];

const quotaByToken: Record<string, QuotaResponse> = {
  "zai_7f3a9c2e8b1d4f6a0e5c8b2d7f9a1c4e": {
    success: true,
    code: 200,
    data: {
      windows: [
        {
          type: "CREDIT_LIMIT",
          usageAmount: 328000,
          totalAmount: 1200000,
          resetTime: "15/9 20:00",
        },
        {
          type: "PROMPT_LIMIT",
          usageAmount: 1840,
          totalAmount: 6000,
          resetTime: "18/9 00:00",
        },
      ],
    },
  },
  "zai_2b8e4d6f1a9c3e7b5d0f8a2c6e4b9d1f": {
    success: true,
    code: 200,
    data: {
      windows: [
        {
          type: "CREDIT_LIMIT",
          usageAmount: 74000,
          totalAmount: 1200000,
          resetTime: "15/9 21:30",
        },
        {
          type: "PROMPT_LIMIT",
          usageAmount: 512,
          totalAmount: 6000,
          resetTime: "18/9 00:00",
        },
      ],
    },
  },
  "zai_9d1c5f7b3a8e2d6c4f0b8a5e7d3c1f9a": {
    success: true,
    code: 200,
    data: {
      windows: [
        {
          type: "CREDIT_LIMIT",
          usageAmount: 1102000,
          totalAmount: 1200000,
          resetTime: "15/9 19:15",
        },
        {
          type: "PROMPT_LIMIT",
          usageAmount: 4380,
          totalAmount: 6000,
          resetTime: "18/9 00:00",
        },
      ],
    },
  },
};

(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: InvokeArgs): Promise<unknown> => {
    switch (cmd) {
      case "load_state":
        return {
          tokens: state.tokens,
          activeId: state.activeId,
          targets: state.targets,
        };
      case "save_state": {
        const next = args as { state: AppState };
        state.targets = next.state.targets;
        return undefined;
      }
      case "target_paths":
        return PATHS;
      case "apply_token": {
        const { token, targets } = args as { token: string; targets: SwitchTargets };
        const found = state.tokens.find((t) => t.token === token);
        if (found) state.activeId = found.id;
        const applied = PATHS.filter((p) =>
          p.agent === "zcode" ? targets.zcode : targets.opencode,
        ).map((p) => ({ ...p, backupPath: `${p.path}.bak` }));
        const result: ApplyResult = { applied };
        return result;
      }
      case "fetch_quota": {
        const token = String((args as { token: string }).token);
        return quotaByToken[token] ?? quotaByToken["zai_7f3a9c2e8b1d4f6a0e5c8b2d7f9a1c4e"];
      }
      default:
        throw new Error(`demo bridge: unknown command "${cmd}"`);
    }
  },
};

await import("../main");

// Demo-only: ?autoSwitch=1 clicks the real "Cambiar Token" button shortly
// after mount, so tools that can't interact (screenshot CLIs) can capture the
// post-switch state of the real UI.
if (new URLSearchParams(location.search).has("autoSwitch")) {
  setTimeout(() => {
    document.querySelector<HTMLButtonElement>(".big")?.click();
  }, 600);
}
