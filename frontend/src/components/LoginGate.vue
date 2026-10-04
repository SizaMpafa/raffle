<script setup>
import { ref } from 'vue';
import { api, setKey } from '../api';

const emit = defineEmits(['ok']);
const pass = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  if (!pass.value || busy.value) return;
  busy.value = true; error.value = '';
  setKey(pass.value);
  try {
    await api.session();
    emit('ok');
  } catch (e) {
    setKey('');
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="panel">
      <h1>Collective Raffles</h1>
      <p class="muted" style="margin:0 0 14px">Organisers only. Enter the passcode to continue.</p>
      <form @submit.prevent="submit">
        <label class="f" for="pass">Passcode</label>
        <input id="pass" class="in" type="password" v-model="pass" autocomplete="current-password" autofocus>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <button class="btn" style="margin-top:12px;width:100%" :disabled="busy || !pass">
          {{ busy ? 'Connecting…' : 'Continue' }}
        </button>
        <p v-if="busy" class="muted" style="margin:10px 0 0">The server sleeps when it is not used, so the first connection can take up to a minute.</p>
      </form>
    </div>
  </div>
</template>
