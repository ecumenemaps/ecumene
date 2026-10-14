// The seat counter's bundled data and credits: registers the Senate election from scripts/sources/stat-us-senate.json
// (seats.js keeps the logic, pure and unit tested) and says what an export showing the counter must credit.
import SENATE from '../../scripts/sources/stat-us-senate.json';
import { EV } from './statsrc.js';
import { addElection, senateElection } from './seats.js';

addElection(senateElection(SENATE));
export { SENATE };

/** {short, detail} credit for the data behind an election's seats, or null when the seats need no source. */
export function seatCredit(el) {
  if (!el) return null;
  if (el.id === 'us-ec')
    return {
      short: 'electoral votes: U.S. Census Bureau 2020 apportionment (public domain)',
      detail: 'Seat counter, electoral votes: ' + EV.credit + ' ' + EV.note + ' (' + EV.url + ')',
    };
  if (el.held) {
    const d = SENATE.verified.date;
    return {
      short: 'Senate seats: congress-legislators (CC0), ' + d,
      detail: 'Seat counter, ' + SENATE.title + ': ' + SENATE.credit.replace('{date}', d) + ' ' + SENATE.note + ' (' + SENATE.url + ')',
    };
  }
  return null;
}
