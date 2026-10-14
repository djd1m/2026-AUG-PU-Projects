import {DomainError} from '@n8/domain/common';
export type CatalogueResolution={status:'blocked'|'manual_required';retailer:'lemanapro'|'domlenta';officialURL:string;message:string;priceMinor:null;stock:'unknown';freshness:'blocked'};
const retailers=[
 {id:'lemanapro' as const,host:'lemanapro.ru',path:/^\/product\/[a-zA-Z0-9%._~-]+\/?$/u},
 {id:'domlenta' as const,host:'domlenta.ru',path:/^\/product\/[a-zA-Z0-9%._~-]+\/?$/u},
];
/** Honest MVP capability: validates a fixed official product deep-link and performs no fetch. */
export class ManualCatalogueProvider {
 async resolve(sourceURL:string):Promise<CatalogueResolution>{
  let url:URL;try{url=new URL(sourceURL);}catch{throw new DomainError(422,'INVALID_PRODUCT_URL','Нужна официальная HTTPS-ссылка товара');}
  const retailer=retailers.find(v=>url.protocol==='https:'&&!url.username&&!url.password&&url.hostname===v.host&&v.path.test(url.pathname)&&!url.search&&!url.hash);
  if(!retailer)throw new DomainError(422,'UNSUPPORTED_RETAILER','Поддерживаются официальные карточки Лемана ПРО и Дом Лента');
  return{status:'blocked',retailer:retailer.id,officialURL:url.toString(),message:'Автоматическая проверка недоступна; откройте официальную карточку и подтвердите данные вручную',priceMinor:null,stock:'unknown',freshness:'blocked'};
 }
}
export interface CatalogueProvider {resolve(sourceURL:string):Promise<CatalogueResolution>}
