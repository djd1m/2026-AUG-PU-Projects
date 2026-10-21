import type { Observation } from './input.js';
export const DAY=86400000;
export type Reason='unknown'|'stale'|'incomparable'|'noimprovement'|'improved';
export function compare(baseline:Observation|undefined,latest:Observation|undefined,now:number) {
 const result=(reason:Reason,display:'raw_counts'|'ratios'='raw_counts')=>({reason,shareAllowed:reason==='improved',display,provenance:'manual/user-confirmed',causalClaim:false});
 if(!baseline || !latest || !baseline.manualVerified || !latest.manualVerified) return result('unknown');
 const b=Date.parse(baseline.observedAt),l=Date.parse(latest.observedAt);
 const bs=Date.parse(baseline.windowStart),be=Date.parse(baseline.windowEnd),ls=Date.parse(latest.windowStart),le=Date.parse(latest.windowEnd);
 if(![b,l,bs,be,ls,le,now].every(Number.isFinite) || l>now || b>now || le>now || be>now || bs>=be || ls>=le || be>b || le>l) return result('incomparable');
 if(now-l>7*DAY) return result('stale');
 if(b>=l || l-b>28*DAY || be>ls || be-bs!==le-ls || baseline.sourceUrl!==latest.sourceUrl || baseline.reference!==latest.reference || baseline.metric!==latest.metric || baseline.unit!==latest.unit || baseline.direction!==latest.direction) return result('incomparable');
 const ratios=baseline.denominator>=30 && latest.denominator>=30;
 const before=ratios?BigInt(baseline.numerator)*BigInt(latest.denominator):BigInt(baseline.numerator);
 const after=ratios?BigInt(latest.numerator)*BigInt(baseline.denominator):BigInt(latest.numerator);
 const improved=latest.direction==='higher'?after>before:after<before;
 return result(improved?'improved':'noimprovement',ratios?'ratios':'raw_counts');
}
