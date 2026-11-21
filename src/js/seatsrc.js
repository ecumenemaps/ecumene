// The seat counter's bundled data and credits: registers each Senate election from its table in
// scripts/sources/stat-us-senate-<year>.json (seats.js keeps the logic, pure and unit tested) and says what an export
// showing the counter must credit. A past election's table stays, so maps saved with it keep their counter; a new one
// is written by `node scripts/fetch_senate.js <year>` and added to SENATES here (a unit test checks every table is).
import SENATE_2026 from '../../scripts/sources/stat-us-senate-2026.json';
import { EV } from './statsrc.js';
import { addElection, senateElection } from './seats.js';

export const SENATES = [SENATE_2026];
for (const S of SENATES) addElection(senateElection(S));

/** {short, detail} credit for the data behind an election's seats, or null when the seats need no source. */
export function seatCredit(el) {
  if (!el) return null;
  if (el.id === 'us-ec')
    return {
      short: 'electoral votes: U.S. Census Bureau 2020 apportionment (public domain)',
      detail: 'Seat counter, electoral votes: ' + EV.credit + ' ' + EV.note + ' (' + EV.url + ')',
    };
  const S = el.held && SENATES.find((x) => 'us-senate-' + x.election.year === el.id);
  if (S) {
    const d = S.verified.date;
    return {
      short: 'Senate seats: congress-legislators (CC0), ' + d,
      detail: 'Seat counter, ' + S.title + ': ' + S.credit.replace('{date}', d) + ' ' + S.note + ' (' + S.url + ')',
    };
  }
  return null;
}
