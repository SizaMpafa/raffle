import { reactive } from 'vue';
import { api } from './api';

export const store = reactive({
  authed: false,
  stats: { raisedFive: 0, raisedTen: 0, raisedTotal: 0, participants: 0, drawn: 0 },
  toast: '',
});

export async function refreshStats() {
  try { store.stats = await api.stats(); } catch { /* the header just keeps its last numbers */ }
}

let timer;
export function toast(message) {
  store.toast = message;
  clearTimeout(timer);
  timer = setTimeout(() => { store.toast = ''; }, 2600);
}
