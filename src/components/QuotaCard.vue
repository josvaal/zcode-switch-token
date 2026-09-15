<script setup lang="ts">
import type { ParsedQuota } from "../lib/quota";

defineProps<{
  loading: boolean;
  error: string | null;
  parsed: ParsedQuota | null;
  raw: unknown;
  activeLabel: string | null;
}>();

const emit = defineEmits<{ refresh: [] }>();

function percentText(percent: number | null): string {
  return percent === null ? "—" : `${Math.round(percent)}%`;
}
</script>

<template>
  <section class="quota glass">
    <header class="quota-head">
      <div>
        <h2>Consumo del plan</h2>
        <p class="quota-sub">
          <template v-if="activeLabel">token activo: <strong>{{ activeLabel }}</strong></template>
          <template v-else>sin token activo</template>
        </p>
      </div>
      <button class="btn-ghost" :disabled="loading || !activeLabel" @click="emit('refresh')">
        <span v-if="loading" class="spinner" />
        <span v-else>↻</span>
        Actualizar
      </button>
    </header>

    <p v-if="error" class="quota-error">{{ error }}</p>

    <div v-else-if="parsed && parsed.windows.length > 0" class="windows">
      <div v-for="w in parsed.windows" :key="w.label" class="window">
        <div class="window-row">
          <span class="window-label">{{ w.label }}</span>
          <span class="window-percent">{{ percentText(w.percent) }}</span>
        </div>
        <div class="bar">
          <div
            class="bar-fill"
            :class="{ warn: w.percent !== null && w.percent >= 85 }"
            :style="{ width: `${w.percent ?? 0}%` }"
          />
        </div>
        <div class="window-meta">
          <span v-if="w.detail">{{ w.detail }}</span>
          <span v-if="w.resetAt">reinicia: {{ w.resetAt }}</span>
        </div>
      </div>
    </div>

    <p v-else-if="parsed && parsed.errorMessage" class="quota-error">{{ parsed.errorMessage }}</p>

    <p v-else-if="!loading" class="quota-empty">
      Sin datos de consumo todavía. Agrega un token y actívalo para consultar el endpoint.
    </p>

    <details v-if="raw !== null" class="raw">
      <summary>Respuesta cruda</summary>
      <pre>{{ JSON.stringify(raw, null, 2) }}</pre>
    </details>
  </section>
</template>

<style scoped>
.quota {
  padding: 22px 24px;
  /* real-element name: fine in scoped styles; ::view-transition-* pseudo
     styles for this name live in the GLOBAL style.css */
  view-transition-name: quota-card;
}

.quota-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.quota-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.quota-sub strong {
  color: var(--violet);
  font-weight: 600;
}

.quota-error,
.quota-empty {
  margin: 8px 0 0;
  font-size: 13px;
}

.quota-error {
  color: var(--danger);
}

.quota-empty {
  color: var(--text-3);
}

.windows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.window-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.window-label {
  font-size: 12.5px;
  color: var(--text-2);
  font-weight: 500;
}

.window-percent {
  font-size: 13px;
  font-weight: 700;
  background: var(--grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--grad);
  box-shadow: 0 0 12px rgba(124, 58, 237, 0.65);
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.bar-fill.warn {
  background: linear-gradient(120deg, #fb923c, var(--danger));
  box-shadow: 0 0 12px rgba(251, 113, 133, 0.65);
}

.window-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-3);
}

.raw {
  margin-top: 16px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.raw summary {
  cursor: pointer;
  font-size: 11.5px;
  color: var(--text-3);
  letter-spacing: 0.04em;
}

.raw summary:hover {
  color: var(--text-2);
}

.raw pre {
  margin: 10px 0 0;
  max-height: 180px;
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-2);
}
</style>
