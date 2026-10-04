<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '../api';
import { refreshStats, toast } from '../store';
import { FEES, LABEL, SHORT, money, ord, fullName, today } from '../util';

const R10_PRIZE = 'R250 house/car raffle ticket';

/* ---------- state ---------- */
const type = ref('five_rand');        // which raffle we are looking at / drawing
const joining = ref('five_rand');     // which raffle(s) the next person joins: five_rand | ten_rand | both
const date = ref(today());
const day = ref({ five_rand: null, ten_rand: null });
const loadError = ref('');

const search = ref('');
const suggestions = ref([]);
const showNew = ref(false);
const form = reactive({ name: '', surname: '', phone: '', email: '' });
const saving = ref(false);

const wc = reactive({ five_rand: 1, ten_rand: 3 });   // number of winners per raffle
const prizes = reactive({ five_rand: ['', '', ''] });  // R5 only: one prize per winner position. R10 prizes are set by the server.
const drawing = ref(false);
const bowlText = ref('');
const drawError = ref('');   // stays on screen (a toast disappears too fast to read)

/* ---------- derived ---------- */
const other = computed(() => (type.value === 'five_rand' ? 'ten_rand' : 'five_rand'));
const raffle = computed(() => day.value[type.value]);
const entries = computed(() => raffle.value?.entries ?? []);
const locked = computed(() => raffle.value?.status === 'drawn');
const targets = computed(() => (joining.value === 'both' ? ['five_rand', 'ten_rand'] : [joining.value]));
const k = computed(() => wc[type.value]);
const canDraw = computed(() => !drawing.value && !locked.value && entries.value.length >= k.value);

const bothCount = computed(() => {
  const ids = new Set((day.value[other.value]?.entries ?? []).map((e) => e.participant_id));
  return entries.value.filter((e) => ids.has(e.participant_id)).length;
});

const joinMeta = computed(() =>
  joining.value === 'both'
    ? 'One paper goes in the R5 bowl and one in the R10 bowl, R15 in total. Each raffle is still drawn on its own.'
    : `One paper goes in the ${LABEL[joining.value]} bowl (${money(FEES[joining.value])}).`);

const drawLabel = computed(() => {
  if (locked.value) return 'Already drawn';
  if (entries.value.length < k.value) return `Need at least ${k.value} ${k.value === 1 ? 'person' : 'people'}`;
  return 'Shake the bowl and draw';
});

/* ---------- loading the day ---------- */
let loadSeq = 0;
async function loadDay() {
  const seq = ++loadSeq;
  try {
    const d = await api.day(date.value);
    if (seq === loadSeq) { day.value = d; loadError.value = ''; }
  } catch (e) {
    if (seq === loadSeq) loadError.value = e.message;
  }
}
onMounted(loadDay);

watch(date, (v) => {
  if (!v) { date.value = today(); return; }
  if (drawing.value) return;
  bowlText.value = '';
  drawError.value = '';
  loadDay();
});
watch(type, () => { if (!drawing.value) { bowlText.value = ''; drawError.value = ''; } });

function pickRaffle(t) {
  if (drawing.value) return;
  type.value = t;
  joining.value = t;
}

/* ---------- search ---------- */
let searchTimer;
let searchSeq = 0;
watch(search, (q) => {
  clearTimeout(searchTimer);
  if (!q.trim()) { suggestions.value = []; return; }
  showNew.value = false;
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const r = await api.search(q.trim());
      if (seq === searchSeq) suggestions.value = r;
    } catch (e) {
      if (seq === searchSeq) { suggestions.value = []; toast(e.message); }
    }
  }, 200);
});

const inRaffle = (t, pid) => !!day.value[t]?.entries.some((e) => e.participant_id === pid);
const inOther = (pid) => inRaffle(other.value, pid);
const allIn = (p) => targets.value.every((t) => inRaffle(t, p.participant_id));
function tagsFor(p) {
  const t = [];
  if (inRaffle('five_rand', p.participant_id)) t.push('R5');
  if (inRaffle('ten_rand', p.participant_id)) t.push('R10');
  return t.length ? `in ${t.join(' and ')} today` : 'returning';
}
const pretty = (s) => s.replace('five_rand', 'R5').replace('ten_rand', 'R10');

/* ---------- adding people ---------- */
async function submitEntry(extra, label) {
  try {
    const r = await api.addEntry({ date: date.value, types: targets.value, ...extra });
    const added = r.added.map((t) => LABEL[t]);
    let msg = added.length ? `${label} added to the ${added.join(' and ')}.` : `${label}: ${r.skipped.map(pretty).join(', ')}.`;
    if (added.length && r.skipped.length) msg += ` (${r.skipped.map(pretty).join(', ')})`;
    toast(msg);
    search.value = ''; suggestions.value = []; showNew.value = false;
    Object.assign(form, { name: '', surname: '', phone: '', email: '' });
    await loadDay();
    refreshStats();
  } catch (e) {
    toast(e.code === 'DUPLICATE_NAME' ? 'That name is already on the list. Search for them and click their name.' : e.message);
  }
}

async function addExisting(p) {
  if (saving.value) return;
  saving.value = true;
  try { await submitEntry({ participantId: p.participant_id }, fullName(p)); }
  finally { saving.value = false; }
}

function openNew() {
  const parts = search.value.trim().split(/\s+/);
  form.name = parts[0] || '';
  form.surname = parts.slice(1).join(' ');
  form.phone = ''; form.email = '';
  suggestions.value = [];
  showNew.value = true;
  setTimeout(() => document.getElementById(form.name ? 'nSurname' : 'nName')?.focus(), 0);
}

async function saveNew() {
  if (saving.value) return;
  const name = form.name.trim(), surname = form.surname.trim();
  if (!name || !surname) { toast('Name and surname are both needed.'); return; }
  saving.value = true;
  try {
    // Two different people can share a name, so ask rather than silently merging.
    const same = (await api.search(`${name} ${surname}`))
      .filter((p) => p.name.toLowerCase() === name.toLowerCase() && p.surname.toLowerCase() === surname.toLowerCase());
    if (same.length) {
      const hint = same[0].phone ? ` (phone ends ${same[0].phone.slice(-3)})` : '';
      const sameOne = window.confirm(
        `${name} ${surname} is already on the list${hint}.\n\nOK = same person, use the existing record.\nCancel = a different person with the same name, add as new.`);
      if (sameOne) { await submitEntry({ participantId: same[0].participant_id }, `${name} ${surname}`); return; }
    }
    // allowSameName is only true when the organiser just said "different person, same name"
    await submitEntry({ participant: { name, surname, phone: form.phone, email: form.email }, allowSameName: same.length > 0 }, `${name} ${surname}`);
  } catch (e) {
    toast(e.message);
  } finally {
    saving.value = false;
  }
}

async function remove(e) {
  try {
    await api.removeEntry(e.entry_id);
    await loadDay();
    refreshStats();
  } catch (err) {
    toast(err.message);
    loadDay();
  }
}

/* ---------- the draw ---------- */
async function doDraw() {
  if (!canDraw.value) return;
  const t = type.value, d = date.value, count = k.value;
  let list = null;   // R10 sends no prizes: every winner gets the same ticket, decided by the server
  if (t === 'five_rand') {
    list = prizes.five_rand.slice(0, count).map((x) => x.trim());
    for (let i = 0; i < count; i++) {
      if (list[i]) continue;
      toast(`Add the prize for ${ord(i)} place first.`);
      document.getElementById('pz' + i)?.focus();
      return;
    }
  }
  // A draw can never be undone, so make an accidental tap harmless.
  if (!window.confirm(`Draw ${count} winner${count > 1 ? 's' : ''} from ${entries.value.length} papers in the ${LABEL[t]}? This cannot be undone.`)) return;

  const names = entries.value.map(fullName);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const minMs = reduce ? 400 : 2600;
  const started = Date.now();
  drawing.value = true;
  drawError.value = '';
  // The flicker is only theatre. The winners are chosen by the database, not by this animation.
  const flick = setInterval(() => { bowlText.value = names[Math.floor(Math.random() * names.length)]; }, 90);
  try {
    const result = await api.draw({ date: d, type: t, winnerCount: count, ...(list ? { prizes: list } : {}) });
    await new Promise((r) => setTimeout(r, Math.max(0, minMs - (Date.now() - started))));
    day.value = result;
    const w = result[t].winners;
    bowlText.value = `${fullName(w[0])}${w.length > 1 ? ` and ${w.length - 1} more` : ''}`;
    refreshStats();
  } catch (e) {
    bowlText.value = '';
    drawError.value = e.message;
    await loadDay();
  } finally {
    clearInterval(flick);
    drawing.value = false;
  }
}
</script>

<template>
  <section class="grid">
    <div class="panel">
      <h2>1. Pick the date and the raffle to draw</h2>
      <div class="seg" role="group" aria-label="Raffle type">
        <button class="r5" :aria-pressed="type === 'five_rand'" :disabled="drawing" @click="pickRaffle('five_rand')">R5 raffle</button>
        <button class="r10" :aria-pressed="type === 'ten_rand'" :disabled="drawing" @click="pickRaffle('ten_rand')">R10 raffle</button>
      </div>
      <div style="margin-top:12px">
        <label class="f" for="rdate">Date</label>
        <input class="in" type="date" id="rdate" v-model="date" :disabled="drawing">
      </div>
      <p class="muted" style="margin:10px 0 0">{{ LABEL[type] }} costs {{ money(FEES[type]) }} a paper. Winners are drawn from this raffle only.</p>
      <p v-if="loadError" class="err" role="alert">{{ loadError }}</p>

      <h3>2. Add people as they pay</h3>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">They are joining</div>
      <div class="seg" role="group" aria-label="Which raffles they are joining">
        <button class="r5" :aria-pressed="joining === 'five_rand'" @click="joining = 'five_rand'">R5</button>
        <button class="r10" :aria-pressed="joining === 'ten_rand'" @click="joining = 'ten_rand'">R10</button>
        <button class="rb" :aria-pressed="joining === 'both'" @click="joining = 'both'">Both (R15)</button>
      </div>
      <p class="muted" style="margin:8px 0 12px">{{ joinMeta }}</p>

      <label class="f" for="search">Search by name</label>
      <input class="in" id="search" type="search" v-model="search" placeholder="Start typing a name or surname" autocomplete="off">
      <div class="sugg" v-if="search.trim() && !showNew">
        <button v-for="p in suggestions" :key="p.participant_id" :disabled="allIn(p) || saving" @click="addExisting(p)">
          <span>{{ p.name }} {{ p.surname }}</span>
          <span class="muted">{{ tagsFor(p) }}<template v-if="p.phone"> · ends {{ p.phone.slice(-3) }}</template></span>
        </button>
        <button :disabled="saving" @click="openNew"><span class="new">Name not in the list? Add "{{ search.trim() }}" as a new person</span></button>
      </div>

      <div v-if="showNew" class="newform">
        <div><label class="f" for="nName">Name</label><input class="in" id="nName" v-model="form.name"></div>
        <div><label class="f" for="nSurname">Surname</label><input class="in" id="nSurname" v-model="form.surname"></div>
        <div><label class="f" for="nPhone">Phone (optional)</label><input class="in" id="nPhone" type="tel" v-model="form.phone"></div>
        <div><label class="f" for="nEmail">Email (optional)</label><input class="in" id="nEmail" type="email" v-model="form.email"></div>
        <div class="full row">
          <button class="btn" :disabled="saving" @click="saveNew">{{ saving ? 'Saving…' : 'Add to ' + (joining === 'both' ? 'both raffles' : 'this raffle') }}</button>
          <button class="btn ghost" :disabled="saving" @click="showNew = false">Cancel</button>
        </div>
      </div>

      <h3>Papers in the {{ LABEL[type] }} bowl ({{ entries.length }})</h3>
      <div class="slips">
        <span v-for="(e, i) in entries" :key="e.entry_id" class="slip"
              :class="{ won: locked && raffle.winners.some((w) => w.participant_id === e.participant_id) }"
              :style="{ '--r': ((i * 7) % 5) - 2 + 'deg' }">
          {{ e.name }} {{ e.surname }}
          <small v-if="inOther(e.participant_id)">+ {{ SHORT[other] }}</small>
          <button v-if="!locked && !drawing" :aria-label="`Remove ${e.name} ${e.surname} from this raffle`" @click="remove(e)">&times;</button>
        </span>
        <span v-if="!entries.length" class="muted">No papers yet. Search for a name above.</span>
      </div>
    </div>

    <div class="panel">
      <h2>3. Draw</h2>
      <div class="money">
        <div><b>{{ entries.length }}</b><span>people in the {{ LABEL[type] }}</span></div>
        <div><b>{{ money(entries.length * FEES[type]) }}</b><span>raised in this raffle</span></div>
        <div><b>{{ bothCount }}</b><span>also in the {{ LABEL[other] }}</span></div>
      </div>

      <div v-if="locked">
        <p class="muted" style="margin:0 0 10px">This raffle has been drawn and is locked. Pick another date to run a new one.</p>
      </div>
      <div v-else>
        <label class="f" for="wcount">How many winners?</label>
        <select class="in" id="wcount" v-model.number="wc[type]" :disabled="drawing" style="max-width:140px;margin-bottom:10px">
          <option :value="1">1</option><option :value="2">2</option><option :value="3">3</option>
        </select>
        <p v-if="type === 'ten_rand'" class="muted" style="margin:0 0 8px">Every winner gets the {{ R10_PRIZE }}. Nothing to type.</p>
        <template v-else>
          <p class="muted" style="margin:0 0 8px">The distributor decides each prize on the day.</p>
          <template v-for="i in k" :key="i">
            <label class="f" :for="'pz' + (i - 1)">Prize for {{ ord(i - 1) }} place</label>
            <input class="in" :id="'pz' + (i - 1)" v-model="prizes.five_rand[i - 1]" :disabled="drawing"
                   placeholder="e.g. Dishwashing liquid" maxlength="120" style="margin-bottom:8px">
          </template>
        </template>
      </div>

      <div class="bowl" :class="{ shake: drawing }">
        <span v-if="bowlText" class="name">{{ bowlText }}</span>
        <span v-else-if="locked" class="name">Drawn</span>
        <span v-else-if="!entries.length" class="muted">Add at least one person to fill the bowl.</span>
        <span v-else class="muted">{{ entries.length }} paper{{ entries.length === 1 ? '' : 's' }} in the bowl. Ready when you are.</span>
      </div>
      <button class="btn draw" :disabled="!canDraw" @click="doDraw">{{ drawing ? 'Drawing…' : drawLabel }}</button>
      <p v-if="drawError" class="err" role="alert">{{ drawError }}</p>

      <div v-if="locked">
        <h3>Winner{{ raffle.winners.length > 1 ? 's' : '' }}</h3>
        <div class="tickets">
          <div v-for="w in raffle.winners" :key="w.place" class="ticket" :class="{ r10: type === 'ten_rand' }">
            <div class="stub">{{ ord(w.place - 1) }}</div>
            <div class="body"><b>{{ w.name }} {{ w.surname }}</b><span>{{ w.prize }}</span></div>
          </div>
        </div>
        <p class="muted" style="margin-top:10px">Drawn from {{ entries.length }} papers. Saved to history.</p>
      </div>
    </div>
  </section>
</template>