// The statistics' sources (scripts/sources/stat-*.json, bundled with the editor) and the credit a map made with one
// carries in its exports. The logic lives in stats.js (pure, unit tested); this module only reads the source list.
import WB from '../../scripts/sources/stat-worldbank.json';
import EV from '../../scripts/sources/stat-us-electoral.json';
import { wbCredit, wbDetails, ELECTORAL_TITLE } from './stats.js';

export { WB, EV };
export const indicatorOf = (code) => WB.indicators.find((i) => i.code === code) || null;

/** {short, detail} credit for the map's statistic (app.stat), or null: short for the source note, detail for SVG metadata. */
export function statCredit(rec) {
  if (!rec) return null;
  if (rec.k === 'ev')
    return {
      short: 'U.S. Census Bureau 2020 apportionment (public domain)',
      detail: ELECTORAL_TITLE + '. ' + EV.credit + ' ' + EV.note + ' (' + EV.url + ')',
    };
  const ind = indicatorOf(rec.c);
  if (!ind) return null;
  return { short: wbCredit(WB, ind, rec), detail: wbDetails(WB, ind, rec) };
}
