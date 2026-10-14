// Checks the country groups in src/groups.js against their sources and prints one line per check:
//   official = a membership list on an organisation's or a government's own page, read by this script
//   wikidata = Wikidata's current "member of" statements (CC0), a second opinion where it is reliable
// A group is only called verified when a line for it says OK; see GROUP_SOURCES in src/groups.js for what each
// group was checked against, and the README sources table for the terms of each source.
// Usage: node scripts/check_groups.js     (needs the network; not part of CI; exits 1 on any difference)
// Node 18+: run as `node --max-http-header-size=1000000 scripts/check_groups.js` if a government site answers with a
// "headers overflow" error.
const { feature } = require('topojson-client');
const Ecu = require('../src/groups.js');
const world = require('../src/overseas.js').splitOverseas(require('world-atlas/countries-10m.json'), feature);
const mapNames = [
  ...new Set(world.objects.countries.geometries.filter((g) => g.properties && g.properties.name).map((g) => g.properties.name)),
];
const resolve = Ecu.matcher(mapNames);

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36 ecumene-check', 'accept-language': 'en' };
const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&uuml;/g, 'ü')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
const get = async (url) => {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(url + ' answered HTTP ' + r.status);
  return text(await r.text());
};

// What the sources call a country, where the map names differ in more than spelling.
const SOURCE_NAMES = {
  'Republic of China': 'China', // UN Charter, Article 23: China's seat is held by the People's Republic
  "People's Republic of China": 'China',
  'Union of Soviet Socialist Republics': 'Russia', // its seat is held by the Russian Federation
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  'Kingdom of Denmark': 'Denmark',
};
const toMap = (n) => resolve(SOURCE_NAMES[n] || n.replace(/^(the|and) /i, ''));
const setOf = (names, unknown) => {
  const s = new Set();
  for (const n of names) {
    const m = toMap(n.trim());
    if (m) s.add(m);
    else unknown.push(n);
  }
  return s;
};

/** EU countries page (two pages of results): the 27 member states, and which of them use the euro. */
async function euOfficial() {
  const eu = new Set(),
    euro = new Set(),
    unknown = [];
  for (const p of [0, 1]) {
    const t = await get('https://european-union.europa.eu/principles-countries-history/eu-countries_en?page=' + p);
    for (const m of t.matchAll(/([A-Z][A-Za-z]+(?: [A-Za-z]+)*?) EU Member State since (\d{4})((?:, | and )[^.]*?)? and more about/g)) {
      const n = toMap(m[1].trim());
      if (!n) unknown.push(m[1]);
      else {
        eu.add(n);
        if (/Euro area( and Schengen area)? member since/.test(m[3] || '')) euro.add(n);
      }
    }
  }
  return { eu, euro, unknown };
}
/** The ECB's page on the euro: the euro area countries listed under "Exchanging national cash". */
async function ecbOfficial() {
  const t = await get('https://www.ecb.europa.eu/euro/intro/html/index.en.html');
  const a = t.indexOf('Exchanging national cash'),
    b = t.indexOf('Visually impaired people', a);
  if (a < 0 || b < 0) throw new Error('ECB page: the list of euro area countries was not found');
  // one-word names, except "The Netherlands"; the count is checked against the page's own "21 of the 27"
  const unknown = [],
    names = t
      .slice(a + 'Exchanging national cash'.length, b)
      .trim()
      .replace('The Netherlands', 'Netherlands')
      .split(' ');
  return { set: setOf(names, unknown), unknown, stated: /legal tender in (\d+) of the 27/.exec(t) };
}
/** NATO's member countries page: the table of countries and the year each joined. */
async function natoOfficial() {
  const t = await get('https://www.nato.int/en/about-us/organization/nato-member-countries');
  const a = t.indexOf('Albania 2009'),
    b = t.indexOf('United States 1949', a);
  if (a < 0 || b < 0) throw new Error('NATO page: the member table was not found');
  const unknown = [],
    names = [...t.slice(a, b + 18).matchAll(/([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ ]*?) (?:19|20)\d{2}/g)].map((m) => m[1]);
  const stated = /NATO has (\d+) member countries/.exec(t);
  return { set: setOf(names, unknown), unknown, stated: stated && +stated[1] };
}
/** UN Charter, Article 23: the permanent members of the Security Council. */
async function charterOfficial() {
  const t = await get('https://www.un.org/en/about-us/un-charter/chapter-5');
  const m = /The (Republic of China, [^.]*?) shall be permanent members/.exec(t);
  if (!m) throw new Error('UN Charter page: Article 23 was not found');
  const unknown = [];
  return {
    set: setOf(
      m[1].split(/, (?:and )?/).map((s) => s.replace(/^the /, '')),
      unknown,
    ),
    unknown,
  };
}
/** Government of Canada, "Canada and the G7": the seven members (the EU takes part). */
async function g7Official() {
  const t = await get(
    'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/g7/index.aspx?lang=eng',
  );
  const m = /Members include ([^.]*?), along with the European Union/.exec(t);
  if (!m) throw new Error('Canada G7 page: the member sentence was not found');
  const unknown = [];
  return { set: setOf(m[1].replace(' and the ', ', the ').split(/, (?:and )?/), unknown), unknown };
}
/** Government of Canada, "Canada and the G20": the 21 members, 19 of them countries. */
async function g20Official() {
  const t = await get(
    'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/g20/index.aspx?lang=eng',
  );
  const m = /The 21 members are: (.*?) The G20 presidency/.exec(t);
  if (!m) throw new Error('Canada G20 page: the member list was not found');
  // "African Union Argentina Australia ... Russia Saudi Arabia South Africa South Korea Türkiye ..." has no separators
  const known = [...mapNames, 'Türkiye', 'African Union', 'European Union'].sort((a, b) => b.length - a.length);
  let rest = m[1];
  const names = [];
  while (rest.trim()) {
    const hit = known.find((k) => rest.trim().startsWith(k));
    if (!hit) throw new Error('Canada G20 page: could not read "' + rest.trim().slice(0, 30) + '"');
    names.push(hit);
    rest = rest.trim().slice(hit.length);
  }
  const unknown = [],
    set = setOf(
      names.filter((n) => n !== 'African Union' && n !== 'European Union'),
      unknown,
    );
  return { set, unknown, regional: names.filter((n) => n === 'African Union' || n === 'European Union') };
}
/** g20.org, the 2026 presidency's own site: its "State Participants" (a presidency's list, shown for comparison). */
async function g20Presidency() {
  const t = await get('https://g20.org/about-g20/');
  const m = /State Participants (.*?) G20 Miami 2026 Non-State Participants/.exec(t);
  if (!m) throw new Error('g20.org: the participants were not found');
  const known = [...mapNames, 'Turkey', 'United States'].sort((a, b) => b.length - a.length);
  let rest = m[1].replace(/G20 Miami 2026/g, ' ');
  const names = [];
  while (rest.trim()) {
    const hit = known.find((k) => rest.trim().startsWith(k));
    if (!hit) throw new Error('g20.org: could not read "' + rest.trim().slice(0, 30) + '"');
    names.push(hit);
    rest = rest.trim().slice(hit.length);
  }
  return setOf(names, []);
}
/** Government of Japan, Ministry of Foreign Affairs, ASEAN page: "ASEAN is now composed of eleven member states". */
async function aseanOfficial() {
  const t = await get('https://www.mofa.go.jp/region/asia-paci/asean/index.html');
  const m =
    /five original nations \(([^)]*)\) and followed by the accession of ([^,]*(?:, [^,]*)*?) and ([A-Za-z-]+), ASEAN is now composed of (\w+) member states/.exec(
      t,
    );
  if (!m) throw new Error('Japan MOFA ASEAN page: the member sentence was not found');
  const unknown = [];
  return { set: setOf([...m[1].split(/, (?:and )?/), ...m[2].split(/, /), m[3]], unknown), unknown, stated: m[4] };
}
/** Wikidata members of an organisation (current "member of" statements without an end date). */
async function wikidata(qid) {
  const q = `SELECT DISTINCT ?l WHERE { ?c p:P463 ?s. ?s ps:P463 wd:${qid}. FILTER NOT EXISTS { ?s pq:P582 ?e } ?c rdfs:label ?l. FILTER(LANG(?l)='en') }`;
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {
    headers: { ...UA, accept: 'application/sparql-results+json' },
  });
  if (!r.ok) throw new Error('Wikidata answered HTTP ' + r.status);
  const unknown = [],
    set = setOf(
      (await r.json()).results.bindings.map((b) => b.l.value),
      unknown,
    );
  return { set, unknown };
}

/**
 * UN Statistics Division, M49 overview: the continent of each map place, as {name: continent}, for the places that
 * have an ISO code (src/iso.js) or share Cyprus's island. The Americas are split by M49's own sub-regions: South
 * America is its "South America" intermediate region; Northern America, Central America and the Caribbean are North
 * America. Also returns the map places M49 does not list.
 */
async function m49Official() {
  const r = await fetch('https://unstats.un.org/unsd/methodology/m49/overview/', { headers: UA });
  if (!r.ok) throw new Error('UNSD M49 page answered HTTP ' + r.status);
  const html = await r.text(),
    a = html.search(/id\s*=\s*"downloadTableEN"/);
  if (a < 0) throw new Error('UNSD M49 page: the English table was not found');
  const rows = [...html.slice(a, html.indexOf('</table>', a)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1]).trim()),
  );
  const head = rows[0],
    col = (n) => head.findIndex((h) => h.toLowerCase().startsWith(n));
  const [R, I, N, A3] = [col('region name'), col('intermediate region name'), col('country or area'), col('iso-alpha3')];
  if ([R, I, N, A3].includes(-1)) throw new Error('UNSD M49 page: the table columns changed');
  const byIso = new Map();
  for (const r of rows.slice(1))
    if (r[A3])
      byIso.set(
        r[A3],
        r[R] === 'Americas'
          ? r[I] === 'South America'
            ? 'South America'
            : 'North America'
          : r[R] || (r[N] === 'Antarctica' ? 'Antarctica' : ''),
      );
  const ISO = require('../src/iso.js'),
    idIso = new Map(Object.entries(ISO.ISO3_ID).map(([k, v]) => [v, k]));
  for (const [k, n] of Object.entries(ISO.ISO3_NAME)) idIso.set('name:' + n, k);
  // places on Cyprus's island that M49 does not list separately
  const FOLLOW = { 'N. Cyprus': 'CYP', 'Cyprus U.N. Buffer Zone': 'CYP', Akrotiri: 'CYP', Dhekelia: 'CYP' };
  const cont = {},
    unlisted = [];
  for (const g of world.objects.countries.geometries) {
    const n = g.properties && g.properties.name;
    // Baikonur and Guantánamo Bay are merged into Kazakhstan and Cuba on the map (ALIAS in src/js/data.js)
    if (!n || n in cont || ISO.ISO_SKIP.includes(n) || n === 'Baikonur' || n === 'USNB Guantanamo Bay') continue;
    const iso = FOLLOW[n] || (g.id && idIso.get(String(g.id).padStart(3, '0'))) || idIso.get('name:' + n);
    if (iso && byIso.get(iso)) cont[n] = byIso.get(iso);
    else if (!unlisted.includes(n)) unlisted.push(n);
  }
  return { cont, unlisted };
}

const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();
// Parts of France and the Netherlands that are EU territory and use the euro (see the group notes in groups.js)
const OVERSEAS = new Set(['French Guiana', 'Guadeloupe', 'Martinique', 'Mayotte', 'Réunion']);
const ours = (name) => new Set(Ecu.GROUPS[name]);
const withoutOverseas = (s) => new Set([...s].filter((x) => !OVERSEAS.has(x)));

(async () => {
  let failed = false;
  const line = (ok, group, kind, who, tail = '') => console.log((ok ? 'OK   ' : 'DIFF ') + group.padEnd(40) + kind.padEnd(9) + who + tail);
  const report = (group, kind, who, a, b, tail = '') => {
    const onlyOurs = diff(a, b),
      onlyThem = diff(b, a),
      ok = !onlyOurs.length && !onlyThem.length;
    if (!ok) failed = true;
    line(ok, group, kind, who, ok ? ' (' + a.size + ' agree)' + tail : tail);
    if (onlyOurs.length) console.log('       only in ours: ' + onlyOurs.join(', '));
    if (onlyThem.length) console.log('       only in the source: ' + onlyThem.join(', '));
  };
  const run = async (group, kind, who, fn) => {
    try {
      await fn();
    } catch (e) {
      failed = true;
      console.log('FAIL ' + group.padEnd(40) + kind.padEnd(9) + who + ': ' + e.message);
    }
  };
  const unknownNote = (who, u) => u.length && console.log('       ' + who + ': not matched to a map country (ignored): ' + u.join(', '));

  const EU = 'European Union (27)',
    EZ = 'Eurozone (21)';
  await run(EU, 'official', 'european-union.europa.eu', async () => {
    const o = await euOfficial();
    unknownNote('EU page', o.unknown);
    report(EU, 'official', 'european-union.europa.eu EU countries page', withoutOverseas(ours(EU)), o.eu);
    report(EZ, 'official', 'same page, "Euro area member since"', withoutOverseas(ours(EZ)), o.euro);
  });
  await run(EZ, 'official', 'ecb.europa.eu', async () => {
    const o = await ecbOfficial();
    unknownNote('ECB page', o.unknown);
    report(EZ, 'official', 'ecb.europa.eu euro page' + (o.stated ? ' (states ' + o.stated[1] + ')' : ''), withoutOverseas(ours(EZ)), o.set);
  });
  await run('NATO (32)', 'official', 'nato.int', async () => {
    const o = await natoOfficial();
    unknownNote('NATO page', o.unknown);
    report(
      'NATO (32)',
      'official',
      'nato.int member countries page' + (o.stated ? ' (states ' + o.stated + ')' : ''),
      ours('NATO (32)'),
      o.set,
    );
  });
  await run('UN Security Council permanent members', 'official', 'un.org', async () => {
    const o = await charterOfficial();
    unknownNote('Charter', o.unknown);
    report(
      'UN Security Council permanent members',
      'official',
      'UN Charter, Article 23 (the ROC and USSR seats are held by China and Russia)',
      ours('UN Security Council permanent members'),
      o.set,
    );
  });
  await run('G7', 'official', 'international.gc.ca', async () => {
    const o = await g7Official();
    unknownNote('Canada G7 page', o.unknown);
    report('G7', 'official', 'Government of Canada, Canada and the G7 (the EU takes part, not a country)', ours('G7'), o.set);
  });
  await run('G20 (19 countries)', 'official', 'international.gc.ca', async () => {
    const o = await g20Official();
    unknownNote('Canada G20 page', o.unknown);
    report(
      'G20 (19 countries)',
      'official',
      'Government of Canada, Canada and the G20 (plus ' + o.regional.join(' and ') + ')',
      ours('G20 (19 countries)'),
      o.set,
    );
  });
  await run('G20 (19 countries)', 'note', 'g20.org', async () => {
    const p = await g20Presidency(),
      mine = ours('G20 (19 countries)');
    const same = !diff(mine, p).length && !diff(p, mine).length;
    console.log(
      (same ? 'OK   ' : 'NOTE ') +
        'G20 (19 countries)'.padEnd(40) +
        'note     g20.org (2026 US presidency) "State Participants"' +
        (same ? ' agree' : ' differ'),
    );
    if (!same) console.log('       presidency list lacks: ' + diff(mine, p).join(', ') + '; adds: ' + diff(p, mine).join(', '));
  });
  await run('ASEAN (11)', 'official', 'mofa.go.jp', async () => {
    const o = await aseanOfficial();
    unknownNote('Japan MOFA page', o.unknown);
    report(
      'ASEAN (11)',
      'official',
      'Government of Japan, Ministry of Foreign Affairs, ASEAN page (states ' + o.stated + ')',
      ours('ASEAN (11)'),
      o.set,
    );
  });
  // Wikidata: a second opinion where its statements are reliable. Not used for the Eurozone (its statements do not
  // model euro area membership) or ASEAN (they list Australia, which is not a member, and some people).
  for (const [g, q, mine] of [
    [EU, 'Q458', withoutOverseas(ours(EU))],
    ['NATO (32)', 'Q7184', ours('NATO (32)')],
    ['G7', 'Q1764511', ours('G7')],
    ['G20 (19 countries)', 'Q19771', ours('G20 (19 countries)')],
  ])
    await run(g, 'wikidata', q, async () => {
      const w = await wikidata(q);
      report(g, 'wikidata', q, mine, w.set);
    });
  await run('Continents', 'official', 'unstats.un.org', async () => {
    const { cont, unlisted } = await m49Official();
    for (const c of Object.keys(Ecu.CONTINENTS)) {
      const mine = new Set(Ecu.CONTINENTS[c].filter((n) => n in cont)),
        theirs = new Set(Object.keys(cont).filter((n) => cont[n] === c));
      report(c, 'official', 'UN Statistics Division, M49 classification', mine, theirs);
    }
    console.log('       not in M49, kept with the land around them: ' + unlisted.sort().join(', '));
  });
  console.log(failed ? '\nSome checks failed or differ: do not call those groups verified.' : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})();
