<script setup>
import { ref, onMounted } from 'vue';
import { api, hasKey, setKey, setUnauthorizedHandler } from './api';
import { store, refreshStats } from './store';
import { money } from './util';
import LoginGate from './components/LoginGate.vue';
import DrawTab from './components/DrawTab.vue';
import ParticipantsTab from './components/ParticipantsTab.vue';
import HistoryTab from './components/HistoryTab.vue';

const tab = ref('draw');
const checking = ref(hasKey());

const tabs = [
  { id: 'draw', label: 'Run a raffle' },
  { id: 'people', label: 'Participants' },
  { id: 'history', label: 'Past raffles' },
];

function logout() {
  setKey('');
  store.authed = false;
}
setUnauthorizedHandler(logout);

async function onAuthed() {
  store.authed = true;
  refreshStats();
}

onMounted(async () => {
  if (!hasKey()) return;
  try { await api.session(); await onAuthed(); } catch { setKey(''); }
  checking.value = false;
});
</script>

<template>
  <div v-if="checking" class="login"><p class="muted">Connecting to the server… the first connection can take up to a minute.</p></div>
  <LoginGate v-else-if="!store.authed" @ok="onAuthed" />

  <div v-else class="wrap">
    <header class="top">
      <div>
        <h1>Collective Raffles</h1>
        <p>Log who entered, draw winners fairly, and see how much the collective has raised.</p>
      </div>
      <div class="stats">
        <div class="stat total"><b>{{ money(store.stats.raisedTotal) }}</b><span>raised so far</span></div>
        <div class="stat"><b>{{ money(store.stats.raisedFive) }}</b><span>from R5 raffles</span></div>
        <div class="stat"><b>{{ money(store.stats.raisedTen) }}</b><span>from R10 raffles</span></div>
        <div class="stat"><b>{{ store.stats.participants }}</b><span>people</span></div>
        <div class="stat"><b>{{ store.stats.drawn }}</b><span>raffles drawn</span></div>
      </div>
    </header>

    <nav class="tabs" role="tablist" aria-label="Sections">
      <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
      <span style="flex:1"></span>
      <button @click="logout">Log out</button>
    </nav>

    <!-- The draw tab stays mounted so half-entered prizes and the chosen raffle survive tab switches -->
    <DrawTab v-show="tab === 'draw'" />
    <ParticipantsTab v-if="tab === 'people'" />
    <HistoryTab v-if="tab === 'history'" />
  </div>

  <div class="toast" :class="{ on: store.toast }" role="status" aria-live="polite">{{ store.toast }}</div>
</template>
