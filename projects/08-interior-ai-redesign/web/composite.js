import sharp from 'sharp';
import { Capacity, HttpError } from './boundaries.js';
import { MAX_BYTES, MAX_PIXELS } from './media.js';
import { supportedRealMode } from './replicate-quality.js';
import { sha } from './generation.js';

// Embedded 5x7 bitmap alphabet: labels are pixels, independent of Docker fonts.
const FONT={
 A:'01110/10001/10001/11111/10001/10001/10001', B:'11110/10001/10001/11110/10001/10001/11110',
 C:'01111/10000/10000/10000/10000/10000/01111', D:'11110/10001/10001/10001/10001/10001/11110',
 E:'11111/10000/10000/11110/10000/10000/11111', F:'11111/10000/10000/11110/10000/10000/10000',
 G:'01111/10000/10000/10111/10001/10001/01111', H:'10001/10001/10001/11111/10001/10001/10001',
 I:'11111/00100/00100/00100/00100/00100/11111', K:'10001/10010/10100/11000/10100/10010/10001',
 L:'10000/10000/10000/10000/10000/10000/11111', M:'10001/11011/10101/10101/10001/10001/10001',
 N:'10001/11001/10101/10011/10001/10001/10001', O:'01110/10001/10001/10001/10001/10001/01110',
 P:'11110/10001/10001/11110/10000/10000/10000', R:'11110/10001/10001/11110/10100/10010/10001',
 S:'01111/10000/10000/01110/00001/00001/11110', T:'11111/00100/00100/00100/00100/00100/00100',
 U:'10001/10001/10001/10001/10001/10001/01110', V:'10001/10001/10001/10001/10001/01010/00100',
 Y:'10001/10001/01010/00100/00100/00100/00100', ' ':'00000/00000/00000/00000/00000/00000/00000'
};
export function labelPixels(text,scale=3) {
  const width=text.length*6*scale,height=7*scale,data=Buffer.alloc(width*height*3,255);
  [...text].forEach((char,i)=>{
    const glyph=FONT[char];if(!glyph)throw new Error('Unsupported bitmap label');
    glyph.split('/').forEach((row,y)=>[...row].forEach((bit,x)=>{
      if(bit==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++) {
        const at=((y*scale+dy)*width+i*6*scale+x*scale+dx)*3;data.fill(25,at,at+3);
      }
    }));
  });return {data,width,height,channels:3};
}
async function panel(bytes) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES)throw new HttpError(404,'not_found');
  const image=sharp(bytes,{limitInputPixels:MAX_PIXELS,failOn:'warning'});
  const m=await image.metadata();
  if(!m.width||!m.height||(m.pages??1)!==1)throw new HttpError(404,'not_found');
  return image.rotate().resize(1024,768,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).png().toBuffer();
}
export async function compose(before,after,{badgeFree=false,mode,quality}={}) {
  if(!(supportedRealMode(mode)||mode==='fixture')||!['unverified','accepted'].includes(quality))throw new HttpError(404,'not_found');
  const left=await panel(before),right=await panel(after);
  const labels=[['BEFORE',24,786],['AFTER',1048,786],['AI REDESIGN',24,824]];
  if(!badgeFree)labels.push(['ROOMKIND',1800,824]);
  if(mode==='fixture')labels.push(['DEMO UNVERIFIED',1048,824]);
  else if(quality==='unverified')labels.push(['UNVERIFIED',1048,824]);
  const overlays=labels.map(([text,x,y])=>{const p=labelPixels(text);return {input:p.data,raw:p,left:x,top:y};});
  const data=await sharp({create:{width:2048,height:868,channels:3,background:'#ffffff'}})
    .composite([{input:left,left:0,top:0},{input:right,left:1024,top:0},...overlays]).webp({quality:90}).toBuffer();
  if(data.length>8*1024*1024)throw new HttpError(503,'composite_too_large');
  return {data,mime:'image/webp',sha:sha(data)};
}
export function createCompositeCache() {
  const entries=new Map(),capacity=new Capacity(2);let bytes=0;
  return {async get(key,before,after,options) {
    return capacity.run(async()=>{
      if(entries.has(key))return entries.get(key);
      const result=await compose(before,after,options);
      if(entries.has(key))return entries.get(key); // Concurrent same-key miss: count/store once.
      while(entries.size>=8||bytes+result.data.length>16*1024*1024) {
        const oldest=entries.keys().next().value;bytes-=entries.get(oldest).data.length;entries.delete(oldest);
      }
      entries.set(key,result);bytes+=result.data.length;return result;
    });
  }};
}
