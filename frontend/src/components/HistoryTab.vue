<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';
import { LABEL, money, ord } from '../util';

const raffles = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try { raffles.value = await api.history(); }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
});
</script>

<template>
  <section>
    <div class="panel">
      <h2>Every raffle held</h2>
      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <div v-else class="scroll">
        <table>
          <thead><tr><th>Date</th><th>Raffle</th><th>Entrants</th><th>Raised</th><th>Winners and prizes</th></tr></thead>
          <tbody>
            <tr v-for="r in raffles" :key="r.raffle_id">
              <td>{{ r.date }}</td>
              <td><span class="chip" :class="r.type === 'five_rand' ? 'r5' : 'r10'">{{ LABEL[r.type] }}</span></td>
              <td>{{ r.entrants }}</td>
              <td>{{ money(r.raised) }}</td>
              <td>
                <div v-for="w in r.winners" :key="w.place">
                  {{ ord(w.place - 1) }}: {{ w.name }} {{ w.surname }} <span class="muted">won {{ w.prize }}</span>
                </div>
                <span v-if="r.status !== 'drawn'" class="muted">Not drawn yet</span>
              </td>
            </tr>
            <tr v-if="!raffles.length"><td colspan="5" class="muted">No raffles yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
