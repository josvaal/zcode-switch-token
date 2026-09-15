<script setup lang="ts">
import type { CSSProperties } from "vue";
import type { TokenEntry } from "../lib/types";

defineProps<{
  tokens: TokenEntry[];
  activeId: string | null;
  busyId: string | null;
}>();

const emit = defineEmits<{ use: [id: string]; remove: [id: string] }>();

// view-transition-name must be unique among rendered elements: ids are unique,
// so per-row inline names never collide (duplicates silently skip transitions).
function vtName(entry: TokenEntry): CSSProperties {
  return { viewTransitionName: `token-${entry.id}` } as CSSProperties;
}

function mask(token: string): string {
  if (token.length <= 10) return "•".repeat(token.length);
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}
</script>

<template>
  <ul class="list">
    <li
      v-for="entry in tokens"
      :key="entry.id"
      class="row"
      :class="{ active: entry.id === activeId }"
      :style="vtName(entry)"
    >
      <span class="status-dot" aria-hidden="true" />
      <div class="row-main">
        <span class="row-label">
          {{ entry.label }}
          <em v-if="entry.id === activeId" class="active-tag">activo</em>
        </span>
        <code class="row-token">{{ mask(entry.token) }}</code>
      </div>
      <div class="row-actions">
        <button
          class="btn-ghost"
          :disabled="entry.id === activeId || busyId !== null"
          @click="emit('use', entry.id)"
        >
          <span v-if="busyId === entry.id" class="spinner" />
          Usar
        </button>
        <button
          class="btn-ghost btn-danger icon"
          :disabled="busyId !== null"
          title="Eliminar"
          @click="emit('remove', entry.id)"
        >
          ✕
        </button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.row.active {
  border-color: rgba(167, 139, 250, 0.45);
  box-shadow: 0 0 18px rgba(124, 58, 237, 0.22), inset 0 0 24px rgba(124, 58, 237, 0.06);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--line-strong);
}

.row.active .status-dot {
  background: var(--violet);
  box-shadow: 0 0 8px var(--violet), 0 0 18px rgba(124, 58, 237, 0.7);
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.active-tag {
  margin-left: 6px;
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--violet);
}

.row-token {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-3);
}

.row-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.btn-danger.icon {
  padding: 6px 10px;
}
</style>
