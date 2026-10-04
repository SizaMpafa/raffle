<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const people = ref([]);
const filter = ref('');
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try { people.value = await api.participants(); }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
});

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return q ? people.value.filter((p) => `${p.name} ${p.surname}`.toLowerCase().includes(q)) : people.value;
});
</script>

<template>
  <section>
    <div class="panel">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <h2 style="margin:0">Everyone who has taken part</h2>
        <input class="in" v-model="filter" type="search" placeholder="Filter by name" style="max-width:260px">
      </div>
      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <div v-else class="scroll">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Entries</th><th>Wins</th></tr></thead>
          <tbody>
            <tr v-for="p in shown" :key="p.participant_id">
              <td>{{ p.name }} {{ p.surname }}</td>
              <td>{{ p.phone }}<span v-if="!p.phone" class="muted">none</span></td>
              <td>{{ p.email }}<span v-if="!p.email" class="muted">none</span></td>
              <td>{{ p.entries }}</td>
              <td>{{ p.wins }}</td>
            </tr>
            <tr v-if="!shown.length"><td colspan="5" class="muted">{{ people.length ? 'No one matches that name.' : 'No one has entered a raffle yet.' }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
