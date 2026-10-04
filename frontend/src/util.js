export const FEES = { five_rand: 5, ten_rand: 10 };
export const LABEL = { five_rand: 'R5 raffle', ten_rand: 'R10 raffle' };
export const SHORT = { five_rand: 'R5', ten_rand: 'R10' };

export const money = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA');
export const ord = (i) => ['1st', '2nd', '3rd'][i];
export const fullName = (p) => `${p.name} ${p.surname}`;

// Local date as YYYY-MM-DD (the raffle day is the organiser's local day, not UTC)
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
