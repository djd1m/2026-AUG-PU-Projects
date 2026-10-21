import sharp from 'sharp';
import {DomainError} from '@n8/domain/common';
/** Local colour analysis only; no semantic recognition, external fetch or AI call. */
export async function referenceColor(image:Buffer):Promise<string>{
 if(!image.length||image.length>10*1024*1024)throw new DomainError(422,'INVALID_REFERENCE_IMAGE','Некорректное изображение референса');
 const thumbnail=await sharp(image,{limitInputPixels:20000000,failOn:'error'}).rotate().resize(64,64,{fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).toColourspace('srgb').png().timeout({seconds:3}).toBuffer();
 const {dominant}=await sharp(thumbnail).stats();return '#'+[dominant.r,dominant.g,dominant.b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

/** Equal-weight blend: every selected reference contributes, even for a one-surface GLB. */
export function combineReferenceColors(colors:readonly string[]):string{
 if(!colors.length||colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid reference colors');
 return '#'+[1,3,5].map(offset=>Math.round(colors.reduce((sum,c)=>sum+parseInt(c.slice(offset,offset+2),16),0)/colors.length).toString(16).padStart(2,'0')).join('');
}
