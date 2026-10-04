// import 'dotenv/config';
// import crypto from 'node:crypto';
// import express from 'express';
// import cors from 'cors';
// import rateLimit from 'express-rate-limit';
// import { createClient } from '@supabase/supabase-js';

// const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSCODE, FRONTEND_URL, PORT = 3000 } = process.env;
// for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSCODE })) {
//   if (!v) throw new Error(`Missing environment variable: ${k}`);
// }

// // The service role key bypasses RLS, so it must only ever live here on the server.
// const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
//   auth: { persistSession: false, autoRefreshToken: false },
// });

// const app = express();
// app.set('trust proxy', 1); // Render sits behind a proxy; needed for correct rate-limit IPs
// app.use(express.json({ limit: '20kb' }));
// app.use(cors({ origin: FRONTEND_URL ? FRONTEND_URL.split(',').map((s) => s.trim()) : false }));

// /* ---------------- helpers ---------------- */
// class HttpError extends Error {
//   constructor(status, message) { super(message); this.status = status; }
// }
// const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// // Turn a supabase-js { data, error } into data, or throw a sensible HttpError.
// function must({ data, error }) {
//   if (error) {
//     // P0001 = a `raise exception` from our SQL functions: a readable, user-facing message.
//     if (error.code === 'P0001') throw new HttpError(400, error.message);
//     console.error('Supabase error:', error);
//     throw new HttpError(500, 'Database error');
//   }
//   return data;
// }

// const TYPES = ['five_rand', 'ten_rand'];
// const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// function checkDate(d) {
//   if (typeof d !== 'string' || !DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new HttpError(400, 'Invalid date');
//   return d;
// }
// function checkType(t) {
//   if (!TYPES.includes(t)) throw new HttpError(400, 'Invalid raffle type');
//   return t;
// }
// function clean(v, max, label, { required = false } = {}) {
//   const s = typeof v === 'string' ? v.trim() : '';
//   if (required && !s) throw new HttpError(400, `${label} is required`);
//   if (s.length > max) throw new HttpError(400, `${label} is too long`);
//   return s || null;
// }

// const safeEqual = (a, b) => {
//   const A = Buffer.from(a), B = Buffer.from(b);
//   return A.length === B.length && crypto.timingSafeEqual(A, B);
// };
// function requireAdmin(req, res, next) {
//   if (!safeEqual(req.get('x-admin-key') || '', ADMIN_PASSCODE)) return res.status(401).json({ error: 'Wrong passcode' });
//   next();
// }

// /* ---------------- rate limits ---------------- */
// app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
// const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
//   message: { error: 'Too many attempts. Try again in a few minutes.' } });

// /* ---------------- public ---------------- */
// // Also pings the database, so an uptime monitor hitting this keeps BOTH the server and Supabase awake.
// app.get('/api/health', wrap(async (req, res) => {
//   const { error } = await db.from('participants').select('participant_id', { head: true, count: 'exact' });
//   if (error) throw new HttpError(503, 'Database unreachable');
//   res.json({ ok: true });
// }));

// app.get('/api/session', loginLimiter, requireAdmin, (req, res) => res.json({ ok: true }));

// /* ---------------- everything below needs the passcode ---------------- */
// app.use('/api', requireAdmin);

// // Header numbers: money raised, people, raffles drawn
// app.get('/api/stats', wrap(async (req, res) => {
//   const rows = must(await db.from('raffle_summary').select('raffle_type, status, raised'));
//   const people = await db.from('participants').select('participant_id', { head: true, count: 'exact' });
//   if (people.error) throw new HttpError(500, 'Database error');
//   let five = 0, ten = 0, drawn = 0;
//   for (const r of rows) {
//     if (r.raffle_type === 'five_rand') five += Number(r.raised); else ten += Number(r.raised);
//     if (r.status === 'drawn') drawn += 1;
//   }
//   res.json({ raisedFive: five, raisedTen: ten, raisedTotal: five + ten, participants: people.count ?? 0, drawn });
// }));

// // Search by name or surname. Several words must all match ("thabo rad").
// app.get('/api/participants/search', wrap(async (req, res) => {
//   const terms = String(req.query.q || '').replace(/[,()%*\\]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
//   if (!terms.length) return res.json([]);
//   let q = db.from('participants').select('participant_id, name, surname, phone');
//   for (const t of terms) q = q.or(`name.ilike.%${t}%,surname.ilike.%${t}%`);
//   const data = must(await q.order('name').order('surname').limit(8));
//   res.json(data);
// }));

// // Participants tab
// app.get('/api/participants', wrap(async (req, res) => {
//   const data = must(await db.from('participant_overview').select('*').order('name').order('surname'));
//   res.json(data);
// }));

// /* ---- one day's raffles (R5 + R10) with entrants and winners ---- */
// async function dayPayload(date) {
//   const raffles = must(await db.from('raffles').select('raffle_id, raffle_type, raffle_date, status, winner_count').eq('raffle_date', date));
//   const out = { five_rand: null, ten_rand: null };
//   if (!raffles.length) return out;
//   const ids = raffles.map((r) => r.raffle_id);
//   const entries = must(await db.from('raffle_entries')
//     .select('entry_id, raffle_id, participant_id, participants(name, surname)')
//     .in('raffle_id', ids).order('created_at'));
//   const winners = must(await db.from('raffle_winners')
//     .select('raffle_id, place, prize, participant_id, participants(name, surname)')
//     .in('raffle_id', ids).order('place'));
//   for (const r of raffles) {
//     out[r.raffle_type] = {
//       raffle_id: r.raffle_id, type: r.raffle_type, date: r.raffle_date, status: r.status, winner_count: r.winner_count,
//       entries: entries.filter((e) => e.raffle_id === r.raffle_id)
//         .map((e) => ({ entry_id: e.entry_id, participant_id: e.participant_id, name: e.participants.name, surname: e.participants.surname })),
//       winners: winners.filter((w) => w.raffle_id === r.raffle_id)
//         .map((w) => ({ place: w.place, prize: w.prize, participant_id: w.participant_id, name: w.participants.name, surname: w.participants.surname })),
//     };
//   }
//   return out;
// }

// app.get('/api/raffles/day', wrap(async (req, res) => {
//   res.json(await dayPayload(checkDate(req.query.date)));
// }));

// // Add a person to one or both raffles. Either a returning person (participantId) or a brand-new one (participant {...}).
// // Runs as ONE database transaction (add_entry), so a new person is never saved without their entry.
// app.post('/api/entries', wrap(async (req, res) => {
//   const { date, types, participantId, participant } = req.body || {};
//   checkDate(date);
//   if (!Array.isArray(types) || !types.length || types.length > 2) throw new HttpError(400, 'Pick R5, R10 or both');
//   const uniqueTypes = [...new Set(types.map(checkType))];

//   let args = { p_date: date, p_types: uniqueTypes };
//   if (participantId) {
//     if (!UUID_RE.test(participantId)) throw new HttpError(400, 'Invalid participant');
//     args.p_participant_id = participantId;
//   } else {
//     if (!participant) throw new HttpError(400, 'Missing participant details');
//     const email = clean(participant.email, 120, 'Email');
//     if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'That email does not look right');
//     args = {
//       ...args,
//       p_name: clean(participant.name, 80, 'Name', { required: true }),
//       p_surname: clean(participant.surname, 80, 'Surname', { required: true }),
//       p_phone: clean(participant.phone, 30, 'Phone'),
//       p_email: email,
//     };
//   }
//   const result = must(await db.rpc('add_entry', args));
//   res.status(201).json(result); // { participant_id, added: [...], skipped: [...] }
// }));

// // Remove someone from a raffle that hasn't been drawn yet (mistyped name, changed their mind)
// app.delete('/api/entries/:id', wrap(async (req, res) => {
//   if (!UUID_RE.test(req.params.id)) throw new HttpError(400, 'Invalid entry');
//   const entry = must(await db.from('raffle_entries').select('entry_id, raffles(status)').eq('entry_id', req.params.id).maybeSingle());
//   if (!entry) throw new HttpError(404, 'Entry not found');
//   if (entry.raffles.status === 'drawn') throw new HttpError(409, 'This raffle has already been drawn');
//   must(await db.from('raffle_entries').delete().eq('entry_id', req.params.id));
//   res.json({ ok: true });
// }));

// // Draw: one prize per winner (1 to 3). The database picks the winners; this can only happen once per raffle.
// app.post('/api/raffles/draw', wrap(async (req, res) => {
//   const { date, type, prizes } = req.body || {};
//   checkDate(date); checkType(type);
//   if (!Array.isArray(prizes) || prizes.length < 1 || prizes.length > 3) throw new HttpError(400, 'Winners must be between 1 and 3');
//   const list = prizes.map((p, i) => clean(p, 120, `Prize for place ${i + 1}`, { required: true }));

//   const raffle = must(await db.from('raffles').select('raffle_id').eq('raffle_type', type).eq('raffle_date', date).maybeSingle());
//   if (!raffle) throw new HttpError(400, 'Nobody has entered this raffle yet');

//   must(await db.rpc('draw_raffle', { p_raffle_id: raffle.raffle_id, p_prizes: list }));
//   res.json(await dayPayload(date));
// }));

// // Past raffles tab
// app.get('/api/raffles/history', wrap(async (req, res) => {
//   const raffles = must(await db.from('raffle_summary').select('*').order('raffle_date', { ascending: false }).limit(300));
//   const ids = raffles.map((r) => r.raffle_id);
//   const winners = ids.length
//     ? must(await db.from('raffle_winners').select('raffle_id, place, prize, participants(name, surname)').in('raffle_id', ids).order('place'))
//     : [];
//   res.json(raffles.map((r) => ({
//     raffle_id: r.raffle_id, type: r.raffle_type, date: r.raffle_date, status: r.status,
//     entrants: r.entrants, raised: Number(r.raised),
//     winners: winners.filter((w) => w.raffle_id === r.raffle_id)
//       .map((w) => ({ place: w.place, prize: w.prize, name: w.participants.name, surname: w.participants.surname })),
//   })));
// }));

// /* ---------------- errors ---------------- */
// app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
// app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
//   if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
//   const status = err.status || 500;
//   if (status === 500) console.error(err);
//   res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
// });

// app.listen(PORT, () => console.log(`API listening on :${PORT}`));

import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSCODE, FRONTEND_URL, PORT = 3000 } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSCODE })) {
  if (!v) throw new Error(`Missing environment variable: ${k}`);
}

// The service role key bypasses RLS, so it must only ever live here on the server.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for correct rate-limit IPs
app.use(express.json({ limit: '20kb' }));
app.use(cors({ origin: FRONTEND_URL ? FRONTEND_URL.split(',').map((s) => s.trim()) : false }));

/* ---------------- helpers ---------------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Turn a supabase-js { data, error } into data, or throw a sensible HttpError.
function must({ data, error }) {
  if (error) {
    // P0001 = a `raise exception` from our SQL functions: a readable, user-facing message.
    if (error.code === 'P0001') throw new HttpError(400, error.message);
    console.error('Supabase error:', error);
    throw new HttpError(500, 'Database error');
  }
  return data;
}

const TYPES = ['five_rand', 'ten_rand'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkDate(d) {
  if (typeof d !== 'string' || !DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new HttpError(400, 'Invalid date');
  return d;
}
function checkType(t) {
  if (!TYPES.includes(t)) throw new HttpError(400, 'Invalid raffle type');
  return t;
}
function clean(v, max, label, { required = false } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `${label} is required`);
  if (s.length > max) throw new HttpError(400, `${label} is too long`);
  return s || null;
}

const safeEqual = (a, b) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
function requireAdmin(req, res, next) {
  if (!safeEqual(req.get('x-admin-key') || '', ADMIN_PASSCODE)) return res.status(401).json({ error: 'Wrong passcode' });
  next();
}

/* ---------------- rate limits ---------------- */
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' } });

/* ---------------- public ---------------- */
// Also pings the database, so an uptime monitor hitting this keeps BOTH the server and Supabase awake.
app.get('/api/health', wrap(async (req, res) => {
  const { error } = await db.from('participants').select('participant_id', { head: true, count: 'exact' });
  if (error) throw new HttpError(503, 'Database unreachable');
  res.json({ ok: true });
}));

app.get('/api/session', loginLimiter, requireAdmin, (req, res) => res.json({ ok: true }));

/* ---------------- everything below needs the passcode ---------------- */
app.use('/api', requireAdmin);

// Header numbers: money raised, people, raffles drawn
app.get('/api/stats', wrap(async (req, res) => {
  const rows = must(await db.from('raffle_summary').select('raffle_type, status, raised'));
  const people = await db.from('participants').select('participant_id', { head: true, count: 'exact' });
  if (people.error) throw new HttpError(500, 'Database error');
  let five = 0, ten = 0, drawn = 0;
  for (const r of rows) {
    if (r.raffle_type === 'five_rand') five += Number(r.raised); else ten += Number(r.raised);
    if (r.status === 'drawn') drawn += 1;
  }
  res.json({ raisedFive: five, raisedTen: ten, raisedTotal: five + ten, participants: people.count ?? 0, drawn });
}));

// Search by name or surname. Several words must all match ("thabo rad").
app.get('/api/participants/search', wrap(async (req, res) => {
  const terms = String(req.query.q || '').replace(/[,()%*\\]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  if (!terms.length) return res.json([]);
  let q = db.from('participants').select('participant_id, name, surname, phone');
  for (const t of terms) q = q.or(`name.ilike.%${t}%,surname.ilike.%${t}%`);
  const data = must(await q.order('name').order('surname').limit(8));
  res.json(data);
}));

// Participants tab
app.get('/api/participants', wrap(async (req, res) => {
  const data = must(await db.from('participant_overview').select('*').order('name').order('surname'));
  res.json(data);
}));

/* ---- one day's raffles (R5 + R10) with entrants and winners ---- */
async function dayPayload(date) {
  const raffles = must(await db.from('raffles').select('raffle_id, raffle_type, raffle_date, status, winner_count').eq('raffle_date', date));
  const out = { five_rand: null, ten_rand: null };
  if (!raffles.length) return out;
  const ids = raffles.map((r) => r.raffle_id);
  const entries = must(await db.from('raffle_entries')
    .select('entry_id, raffle_id, participant_id, participants(name, surname)')
    .in('raffle_id', ids).order('created_at'));
  const winners = must(await db.from('raffle_winners')
    .select('raffle_id, place, prize, participant_id, participants(name, surname)')
    .in('raffle_id', ids).order('place'));
  for (const r of raffles) {
    out[r.raffle_type] = {
      raffle_id: r.raffle_id, type: r.raffle_type, date: r.raffle_date, status: r.status, winner_count: r.winner_count,
      entries: entries.filter((e) => e.raffle_id === r.raffle_id)
        .map((e) => ({ entry_id: e.entry_id, participant_id: e.participant_id, name: e.participants.name, surname: e.participants.surname })),
      winners: winners.filter((w) => w.raffle_id === r.raffle_id)
        .map((w) => ({ place: w.place, prize: w.prize, participant_id: w.participant_id, name: w.participants.name, surname: w.participants.surname })),
    };
  }
  return out;
}

app.get('/api/raffles/day', wrap(async (req, res) => {
  res.json(await dayPayload(checkDate(req.query.date)));
}));

// Add a person to one or both raffles. Either a returning person (participantId) or a brand-new one (participant {...}).
// Runs as ONE database transaction (add_entry), so a new person is never saved without their entry.
app.post('/api/entries', wrap(async (req, res) => {
  const { date, types, participantId, participant, allowSameName } = req.body || {};
  checkDate(date);
  if (!Array.isArray(types) || !types.length || types.length > 2) throw new HttpError(400, 'Pick R5, R10 or both');
  const uniqueTypes = [...new Set(types.map(checkType))];

  let args = { p_date: date, p_types: uniqueTypes };
  if (participantId) {
    if (!UUID_RE.test(participantId)) throw new HttpError(400, 'Invalid participant');
    args.p_participant_id = participantId;
  } else {
    if (!participant) throw new HttpError(400, 'Missing participant details');
    const email = clean(participant.email, 120, 'Email');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'That email does not look right');
    args = {
      ...args,
      p_name: clean(participant.name, 80, 'Name', { required: true }),
      p_surname: clean(participant.surname, 80, 'Surname', { required: true }),
      p_phone: clean(participant.phone, 30, 'Phone'),
      p_email: email,
      // Only true when the organiser confirmed "different person, same name"
      p_allow_same_name: allowSameName === true,
    };
  }
  const result = must(await db.rpc('add_entry', args));
  if (result.duplicate) {
    // Same name and surname is already on the list: nothing was saved.
    return res.status(409).json({
      error: `${args.p_name} ${args.p_surname} is already on the list. Use their participantId, or send allowSameName: true if this is a different person.`,
      code: 'DUPLICATE_NAME',
      matches: result.matches,
    });
  }
  res.status(201).json(result); // { participant_id, added: [...], skipped: [...] }
}));

// Remove someone from a raffle that hasn't been drawn yet (mistyped name, changed their mind)
app.delete('/api/entries/:id', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(400, 'Invalid entry');
  const entry = must(await db.from('raffle_entries').select('entry_id, raffles(status)').eq('entry_id', req.params.id).maybeSingle());
  if (!entry) throw new HttpError(404, 'Entry not found');
  if (entry.raffles.status === 'drawn') throw new HttpError(409, 'This raffle has already been drawn');
  must(await db.from('raffle_entries').delete().eq('entry_id', req.params.id));
  res.json({ ok: true });
}));

// Draw: the client says HOW MANY winners; the server decides the prizes where it can.
//  - ten_rand: every winner gets the same ticket, so no prizes are sent (any that are sent are ignored)
//  - five_rand: send exactly one prize per winner, because the distributor decides them on the day
// The database picks the winners, and this can only happen once per raffle.
const TEN_RAND_PRIZE = 'R250 house/car raffle ticket';

app.post('/api/raffles/draw', wrap(async (req, res) => {
  const { date, type, winnerCount, prizes } = req.body || {};
  checkDate(date); checkType(type);
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 3) {
    throw new HttpError(400, 'winnerCount must be a whole number from 1 to 3');
  }

  let list;
  if (type === 'ten_rand') {
    list = Array(winnerCount).fill(TEN_RAND_PRIZE);
  } else {
    const got = Array.isArray(prizes) ? prizes.length : 0;
    if (got !== winnerCount) {
      throw new HttpError(400, `${winnerCount} winner${winnerCount > 1 ? 's' : ''} needs exactly ${winnerCount} prize${winnerCount > 1 ? 's' : ''}, but ${got} ${got === 1 ? 'was' : 'were'} sent`);
    }
    list = prizes.map((p, i) => clean(p, 120, `Prize for place ${i + 1}`, { required: true }));
  }

  // Check this raffle's headcount against the winner count now, so the error is clear
  // (the database re-checks all of this inside the draw, which is the real guard).
  const raffle = must(await db.from('raffle_summary').select('raffle_id, entrants, status')
    .eq('raffle_type', type).eq('raffle_date', date).maybeSingle());
  if (!raffle || raffle.entrants === 0) throw new HttpError(400, 'Nobody has entered this raffle yet');
  if (raffle.status === 'drawn') throw new HttpError(409, 'This raffle has already been drawn');
  if (raffle.entrants < winnerCount) {
    throw new HttpError(400, `Only ${raffle.entrants} ${raffle.entrants === 1 ? 'person has' : 'people have'} entered, so you cannot draw ${winnerCount} winners`);
  }

  must(await db.rpc('draw_raffle', { p_raffle_id: raffle.raffle_id, p_prizes: list }));
  res.json(await dayPayload(date));
}));

// Past raffles tab
app.get('/api/raffles/history', wrap(async (req, res) => {
  const raffles = must(await db.from('raffle_summary').select('*').order('raffle_date', { ascending: false }).limit(300));
  const ids = raffles.map((r) => r.raffle_id);
  const winners = ids.length
    ? must(await db.from('raffle_winners').select('raffle_id, place, prize, participants(name, surname)').in('raffle_id', ids).order('place'))
    : [];
  res.json(raffles.map((r) => ({
    raffle_id: r.raffle_id, type: r.raffle_type, date: r.raffle_date, status: r.status,
    entrants: r.entrants, raised: Number(r.raised),
    winners: winners.filter((w) => w.raffle_id === r.raffle_id)
      .map((w) => ({ place: w.place, prize: w.prize, name: w.participants.name, surname: w.participants.surname })),
  })));
}));

/* ---------------- errors ---------------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));