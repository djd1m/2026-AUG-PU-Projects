export type Freshness='fresh'|'stale'|'unknown'|'blocked';
export type Stock='in_stock'|'out_of_stock'|'unknown';
export type BaseUnit='m2'|'l'|'kg'|'m'|'piece';
export type SaleUnit='pack'|'piece';
export type Phase='preparation'|'finishing'|'furnishing';
export type Selection='matched'|'unmatched'|'retained';
export interface ProductSnapshot {
 id:string;projectId:string;retailer:string;seller:string|null;article:string|null;name:string;sourceURL:string;
 region:string|null;store:string|null;observedAt:string|null;source:'manual'|'api'|'scraper'|'demo';freshness:Freshness;
 priceMinor:number|null;currency:'RUB';baseUnit:BaseUnit;saleUnit:SaleUnit;coverage:string|null;stock:Stock;stockQty:string|null;
 dimensionsM:[string,string,string]|null;createdAt:string;
}
export interface ShoppingLine {
 id:string;projectId:string;designId:string;elementId:string;selection:Selection;retainedReason:string|null;snapshotId:string|null;
 quantitySource:'floor_area'|'wall_area'|'surface_area'|'manual';sourceShellId:string|null;quantityConfirmed:boolean;baseQuantity:string|null;
 wastePct:string;phase:Phase;fit:'bbox_checked'|'unconfirmed';version:number;createdAt:string;
}
export interface CostRow {id:string;label:string;kind:'confirmed'|'estimate'|'unknown'|'excluded';amountMinor:number|null;reason:string|null}
export interface BudgetSnapshotLine {
 lineId:string|null;elementId:string;selection:Selection;retainedReason:string|null;quantitySource:ShoppingLine['quantitySource'];sourceShellId:string|null;
 quantityConfirmed:boolean;phase:Phase;fit:ShoppingLine['fit'];snapshot:ProductSnapshot|null;effectiveFreshness:Freshness;baseQuantity:string|null;
 wastePct:string;packs:number|null;purchasedQuantity:string|null;lineMinor:number|null;reason:string|null;formula:string;
}
export interface PhaseTotal {knownMinor:number;scenarioMinor:number|null;unresolvedCount:number}
export interface BudgetDelta {key:string;kind:'added'|'removed'|'changed';before:unknown;after:unknown}
export interface BudgetCalculation {
 linesSnapshot:BudgetSnapshotLine[];services:CostRow[];delivery:CostRow[];reservePct:string;reserveBase:'known_subtotal'|'scenario_subtotal';
 reserveBaseMinor:number;reserveMinor:number|null;phaseTotals:Record<Phase,PhaseTotal>;delta:BudgetDelta[];limitMinor:number|null;
 knownSubtotalMinor:number;scenarioTotalMinor:number|null;unresolvedCount:number;complete:boolean;limitStatus:'under'|'equal'|'over'|'uncertain'|null;
 inputHash:string;
}
export interface BudgetRevision extends BudgetCalculation {id:string;projectId:string;designId:string;parentId:string|null;inputProjectVersion:number;changeReason:string;createdAt:string}
export interface CalculationContext {
 project:{region:string;store:string|null;version:number;currentShellId:string|null;currentDesignId:string|null};
 design:{id:string;state:'draft'|'approved'|'superseded';shellId:string;scene:{materials:{surfaceId:string}[];objects:{id:string;catalogId:string}[]}};
 shell:{id:string;mode:'manual'|'glb';floorAreaM2:string|null;floorAreaSource:'manual_geometry'|'user_confirmed'|'unknown';geometry:unknown};
 lines:ShoppingLine[];snapshots:Map<string,ProductSnapshot>;services:CostRow[];delivery:CostRow[];reservePct:string;
 reserveBase:'known_subtotal'|'scenario_subtotal';limitMinor:number|null;previous?:BudgetRevision|null;now:Date;
}
