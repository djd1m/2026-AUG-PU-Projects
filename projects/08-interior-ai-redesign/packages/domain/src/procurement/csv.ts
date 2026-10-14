import type {BudgetRevision} from './types.js';

function inert(value:unknown):string {
 let text=value===null||value===undefined?'':String(value);
 if(/^\s*[=+\-@\t\r\n]/u.test(text))text=`'${text}`;
 return `"${text.replace(/"/g,'""')}"`;
}
const rub=(minor:number|null)=>minor===null?'':`${Math.floor(minor/100)}.${String(minor%100).padStart(2,'0')}`;
const columns=['kind','stable_id','name','retailer','seller','article','source_url','source','region','store','observed_at','base_unit','sale_unit','base_quantity','waste_pct','packs','price_rub','amount_rub','cost_kind','freshness','stock','unknown_reason','retained_reason','phase','quantity_source','source_shell_id','formula','budget_id','design_id','budget_created_at','input_project_version','complete'] as const;
type Column=typeof columns[number];
type CsvRow=Partial<Record<Column,string|number|boolean|null>>;

export function exportShoppingListCsv(b:BudgetRevision):string {
 const rows:CsvRow[]=[];
 for(const line of b.linesSnapshot){
  const snapshot=line.snapshot;
  rows.push({kind:'product',stable_id:line.elementId,name:snapshot?.name??'',retailer:snapshot?.retailer??'',seller:snapshot?.seller??'',article:snapshot?.article??'',source_url:snapshot?.sourceURL??'',source:snapshot?.source??'',region:snapshot?.region??'',store:snapshot?.store??'',observed_at:snapshot?.observedAt??'',base_unit:snapshot?.baseUnit??'',sale_unit:snapshot?.saleUnit??'',base_quantity:line.baseQuantity??'',waste_pct:line.wastePct,packs:line.packs??'',price_rub:rub(snapshot?.priceMinor??null),amount_rub:rub(line.lineMinor),freshness:line.effectiveFreshness,stock:snapshot?.stock??'',unknown_reason:line.reason??'',retained_reason:line.retainedReason??'',phase:line.phase,quantity_source:line.quantitySource,source_shell_id:line.sourceShellId??'',formula:line.formula});
 }
 for(const [kind,items] of [['service',b.services],['delivery',b.delivery]] as const){
  for(const item of items)rows.push({kind,stable_id:item.id,name:item.label,amount_rub:rub(item.amountMinor),cost_kind:item.kind,unknown_reason:item.reason??''});
 }
 rows.push({kind:'reserve',stable_id:'reserve',name:'Резерв',amount_rub:rub(b.reserveMinor),cost_kind:b.reserveMinor===null?'unknown':'confirmed',unknown_reason:b.reserveMinor===null?'База сценария неполна':'',formula:`${b.reservePct}% of ${b.reserveBase}`});
 rows.push({kind:'total_known',stable_id:'known_total',name:'Подтверждённый итог',amount_rub:rub(b.knownSubtotalMinor)});
 rows.push({kind:'total_scenario',stable_id:'scenario_total',name:'Сценарный итог',amount_rub:rub(b.scenarioTotalMinor),cost_kind:b.scenarioTotalMinor===null?'unknown':'confirmed',unknown_reason:b.scenarioTotalMinor===null?'Есть неразрешённые позиции или расходы':''});
 const common:CsvRow={budget_id:b.id,design_id:b.designId,budget_created_at:b.createdAt,input_project_version:b.inputProjectVersion,complete:b.complete};
 return [columns,...rows.map(entry=>columns.map(column=>entry[column]??common[column]??''))].map(row=>row.map(inert).join(',')).join('\r\n')+'\r\n';
}
