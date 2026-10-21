import {rubToMinor} from '@n8/domain/procurement';
export const phases={preparation:'Подготовка',finishing:'Отделка',furnishing:'Обстановка'};
export function money(value:number|null){return value===null?'Неизвестно':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(value/100);}
export function decimal(value:FormDataEntryValue|null){return String(value??'').trim().replace(',','.').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
export function optionalMoney(value:FormDataEntryValue|null){const text=String(value??'').trim();return text?rubToMinor(text.replace(',','.')):null;}
export function elementName(id:string){return ({floor:'Пол',ceiling:'Потолок','wall:north':'Северная стена','wall:east':'Восточная стена','wall:south':'Южная стена','wall:west':'Западная стена'} as Record<string,string>)[id]??'Предмет / поверхность скана';}
