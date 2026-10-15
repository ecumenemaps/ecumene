// Dated layers (#46): units valid from one day (d0) to another (d1), both included, as yyyymmdd numbers like the
// Atlas of Historical County Boundaries stores them. Pure, unit tested.

/** Is a unit (its properties) in force on day n? */
export const onDate = (p, n) => p.d0 <= n && n <= p.d1;
/** The units of a dated layer in force on day n. */
export const unitsAt = (feats, n) => feats.filter((f) => onDate(f.properties, n));
