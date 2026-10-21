/** Scene-only derivative: caller never supplies the project name, measurements, references or budget. */
async function image(source:string){const result=new Image();result.src=source;await result.decode();return result;}
export async function composeBeforeAfter(pair:{before:string;after:string},label:string):Promise<Blob>{
 const [before,after]=await Promise.all([image(pair.before),image(pair.after)]),width=Math.min(1000,before.naturalWidth),height=Math.round(before.naturalHeight*width/before.naturalWidth);
 const canvas=document.createElement('canvas');canvas.width=width*2+48;canvas.height=height+128;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось подготовить изображение');
 ctx.fillStyle='#f7f3e9';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#292b26';ctx.font='24px Georgia';ctx.fillText('До',16,34);ctx.fillText('После',width+32,34);ctx.drawImage(before,16,48,width,height);ctx.drawImage(after,width+32,48,width,height);ctx.font='18px sans-serif';ctx.fillText(label,16,height+86);ctx.font='14px sans-serif';ctx.fillText('Предварительная визуализация · не инженерный проект',16,height+111);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось сохранить PNG')),'image/png'));
}
