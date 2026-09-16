<script setup lang="ts">
import type { SwitchTargets } from "../lib/types";

defineProps<{ targets: SwitchTargets }>();

const emit = defineEmits<{ toggle: [agent: "zcode" | "opencode"] }>();
</script>

<template>
  <div class="targets">
    <span class="targets-label">Aplicar en:</span>
    <button
      type="button"
      class="target-pill"
      :class="{ on: targets.zcode }"
      :aria-pressed="targets.zcode"
      @click="emit('toggle', 'zcode')"
    >
      <span class="t-dot" aria-hidden="true" /> ZCode
    </button>
    <button
      type="button"
      class="target-pill"
      :class="{ on: targets.opencode }"
      :aria-pressed="targets.opencode"
      @click="emit('toggle', 'opencode')"
    >
      <span class="t-dot" aria-hidden="true" /> OpenCode
    </button>
  </div>
</template>

<style scoped>
.targets {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.targets-label {
  font-size: 12.5px;
  color: var(--text-3);
}

.target-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-3);
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.t-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line-strong);
  transition: all 0.2s ease;
}

.target-pill.on {
  border-color: rgba(167, 139, 250, 0.55);
  background: rgba(124, 58, 237, 0.12);
  color: var(--text-1);
  box-shadow: 0 0 14px rgba(124, 58, 237, 0.25);
}

.target-pill.on .t-dot {
  background: var(--violet);
  box-shadow: 0 0 8px var(--violet), 0 0 16px rgba(124, 58, 237, 0.6);
}

.target-pill:hover:not(.on) {
  border-color: var(--line-strong);
  color: var(--text-2);
}
</style>
