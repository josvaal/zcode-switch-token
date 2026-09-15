<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ add: [label: string, token: string] }>();

const label = ref("");
const token = ref("");
const show = ref(false);
const error = ref<string | null>(null);

function submit(): void {
  const trimmed = token.value.trim();
  if (trimmed.length < 8) {
    error.value = "Pega el token completo.";
    return;
  }
  error.value = null;
  emit("add", label.value.trim(), trimmed);
  label.value = "";
  token.value = "";
  show.value = false;
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <input
      v-model="label"
      class="field label-field"
      placeholder="Nombre (opcional)"
      autocomplete="off"
    />
    <div class="token-wrap">
      <input
        v-model="token"
        class="field token-field"
        :type="show ? 'text' : 'password'"
        placeholder="Pega tu token de z.ai coding plan"
        autocomplete="off"
        spellcheck="false"
      />
      <button
        type="button"
        class="btn-ghost toggle"
        :title="show ? 'Ocultar' : 'Mostrar'"
        @click="show = !show"
      >
        {{ show ? "ocultar" : "ver" }}
      </button>
    </div>
    <button type="submit" class="btn-primary add-btn">+ Agregar</button>
    <p v-if="error" class="error">{{ error }}</p>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  grid-template-columns: 170px 1fr auto;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}

.label-field {
  font-size: 13px;
}

.token-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.token-field {
  padding-right: 68px;
  font-family: var(--mono);
  font-size: 12.5px;
}

.toggle {
  position: absolute;
  right: 8px;
  padding: 3px 10px;
  font-size: 11px;
}

.add-btn {
  padding: 10px 22px;
  font-size: 13.5px;
}

.error {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

@media (max-width: 720px) {
  .form {
    grid-template-columns: 1fr;
  }
}
</style>
