<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AddTokenForm from "./components/AddTokenForm.vue";
import QuotaCard from "./components/QuotaCard.vue";
import TokenList from "./components/TokenList.vue";
import { applyToken, fetchQuota, loadState, saveState, zcodePath } from "./lib/api";
import { parseQuota } from "./lib/quota";
import type { TokenEntry } from "./lib/types";
import { withViewTransition } from "./lib/viewTransition";

const state = ref<{ tokens: TokenEntry[]; activeId: string | null }>({
  tokens: [],
  activeId: null,
});
const zPath = ref("");
const quotaLoading = ref(false);
const quotaError = ref<string | null>(null);
const quotaRaw = ref<unknown>(null);
const busy = ref(false);
const busyId = ref<string | null>(null);
const status = ref<{ kind: "ok" | "err"; text: string } | null>(null);

let statusTimer: ReturnType<typeof setTimeout> | undefined;

const activeToken = computed(
  () => state.value.tokens.find((t) => t.id === state.value.activeId) ?? null,
);
const activeLabel = computed(() => activeToken.value?.label ?? null);
const parsedQuota = computed(() =>
  quotaRaw.value === null ? null : parseQuota(quotaRaw.value),
);
const activeHint = computed(() => {
  if (state.value.tokens.length === 0) return "Agrega al menos un token para empezar.";
  if (!activeToken.value) return "Elige un token de la lista para activarlo.";
  return `Activo: ${activeToken.value.label} — "Cambiar Token" rota al siguiente de la lista.`;
});

function showStatus(kind: "ok" | "err", text: string): void {
  status.value = { kind, text };
  if (statusTimer !== undefined) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.value = null;
  }, 6000);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function persist(): Promise<void> {
  await saveState({ tokens: state.value.tokens, activeId: state.value.activeId });
}

async function refreshQuota(): Promise<void> {
  const active = activeToken.value;
  if (!active) {
    quotaError.value = "Agrega y activa un token para consultar el consumo.";
    quotaRaw.value = null;
    return;
  }
  quotaLoading.value = true;
  quotaError.value = null;
  try {
    const data = await fetchQuota(active.token); // network first, page stays interactive
    await withViewTransition(() => {
      quotaRaw.value = data;
      quotaError.value = null;
    });
  } catch (e) {
    await withViewTransition(() => {
      quotaRaw.value = null;
      quotaError.value = String(e);
    });
  } finally {
    quotaLoading.value = false;
  }
}

async function activate(entry: TokenEntry): Promise<void> {
  busyId.value = entry.id;
  try {
    const result = await applyToken(entry.token); // IPC first, no DOM inside
    await withViewTransition(() => {
      state.value.activeId = entry.id;
    });
    await persist();
    showStatus("ok", `Token aplicado en ${result.path}`);
    await refreshQuota();
  } catch (e) {
    showStatus("err", `No se pudo aplicar el token: ${String(e)}`);
  } finally {
    busyId.value = null;
  }
}

async function changeToken(): Promise<void> {
  const tokens = state.value.tokens;
  if (tokens.length === 0 || busy.value) return;
  busy.value = true;
  try {
    const currentIndex = tokens.findIndex((t) => t.id === state.value.activeId);
    const next = tokens[(currentIndex + 1) % tokens.length];
    await activate(next);
  } finally {
    busy.value = false;
  }
}

async function useToken(id: string): Promise<void> {
  const entry = state.value.tokens.find((t) => t.id === id);
  if (!entry || busyId.value !== null) return;
  busy.value = true;
  try {
    await activate(entry);
  } finally {
    busy.value = false;
  }
}

async function addToken(label: string, token: string): Promise<void> {
  const entry: TokenEntry = {
    id: newId(),
    label: label !== "" ? label : `Token ${state.value.tokens.length + 1}`,
    token,
  };
  await withViewTransition(() => {
    state.value.tokens.push(entry); // new row rises in
  });
  await persist();
  if (!state.value.activeId) {
    busy.value = true;
    try {
      await activate(entry);
    } finally {
      busy.value = false;
    }
  }
}

async function removeToken(id: string): Promise<void> {
  const wasActive = state.value.activeId === id;
  await withViewTransition(() => {
    state.value.tokens = state.value.tokens.filter((t) => t.id !== id); // old row fades out
    if (wasActive) state.value.activeId = null;
  });
  await persist();
  showStatus("ok", "Token eliminado.");
  if (wasActive) await refreshQuota();
}

onMounted(async () => {
  try {
    const [loaded, path] = await Promise.all([loadState(), zcodePath()]);
    state.value = { tokens: loaded.tokens, activeId: loaded.activeId };
    zPath.value = path;
    if (activeToken.value) await refreshQuota();
  } catch (e) {
    showStatus("err", `No se pudo cargar el estado: ${String(e)}`);
  }
});
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <span class="pill-badge"><span class="dot ok" /> zcode switcher</span>
      <span v-if="zPath" class="path-hint" :title="zPath">{{ zPath }}</span>
    </header>

    <QuotaCard
      :loading="quotaLoading"
      :error="quotaError"
      :parsed="parsedQuota"
      :raw="quotaRaw"
      :active-label="activeLabel"
      @refresh="refreshQuota"
    />

    <section class="tokens glass">
      <div class="section-head">
        <h2>Tokens configurados</h2>
        <span class="count">{{ state.tokens.length }}</span>
      </div>
      <p v-if="state.tokens.length === 0" class="empty">
        Sin tokens todavía. Agrega el primero abajo y se activará automáticamente.
      </p>
      <TokenList
        v-else
        :tokens="state.tokens"
        :active-id="state.activeId"
        :busy-id="busyId"
        @use="useToken"
        @remove="removeToken"
      />
      <AddTokenForm @add="addToken" />
    </section>

    <footer class="actions">
      <button
        class="btn-primary big"
        :disabled="state.tokens.length === 0 || busy"
        @click="changeToken"
      >
        <span v-if="busy" class="spinner" />
        <span>{{ busy ? "Cambiando…" : "Cambiar Token" }}</span>
      </button>
      <p class="hint">{{ activeHint }}</p>
      <transition name="fade">
        <p v-if="status" :class="['status', status.kind]">{{ status.text }}</p>
      </transition>
    </footer>
  </main>
</template>

<style scoped>
.shell {
  max-width: 860px;
  margin: 0 auto;
  padding: 22px 26px 30px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.path-hint {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tokens {
  padding: 20px 24px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.section-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.count {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(167, 139, 250, 0.4);
  background: rgba(124, 58, 237, 0.12);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--violet);
}

.empty {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-3);
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-bottom: 6px;
}

.big {
  min-width: 280px;
  padding: 14px 40px;
  font-size: 16px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

.status {
  margin: 0;
  font-size: 12.5px;
  text-align: center;
  max-width: 720px;
  word-break: break-all;
}

.status.ok {
  color: var(--ok);
}

.status.err {
  color: var(--danger);
}
</style>
