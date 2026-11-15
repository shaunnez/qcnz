// Content of the walk that is open. The Queen Charlotte Track has hand-made content. The other walks use the data pack.
const P = globalThis.__PACK__;
export const WALK = P.meta, REV = !!(P.plan && P.plan.rev);
export const STOPS = P.stops, GUIDE = P.guide || {}, HELP = P.help, POIS = P.pois || [], LABELS = P.labels || [], WILDLIFE = P.wildlife || [];
export const ZONES = P.zones || [];
// The walk direction. In the opposite direction the first place is the last place, and each lodge side track changes its role.
export const START = REV ? P.end : P.start, END = REV ? P.start : P.end;
export const NIGHT_OPTIONS = REV ? P.nightOptions.slice().reverse() : P.nightOptions.slice();
export const DEFAULT_NIGHTS = REV ? P.defaultNights.slice().reverse() : P.defaultNights.slice();
if (REV) for (const id in STOPS) { const s = STOPS[id], a = s.arrive; s.arrive = s.leave; s.leave = a; }
