import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import validator from 'gltf-validator';
sharp.cache(false); sharp.concurrency(1);
const MP=20_000_000;
const refuse=(message)=>{throw new Error(message);};
function imageMime(b) {
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';
 return null;
}
async function imageInfo(bytes) {
 if(!imageMime(bytes))refuse('Разрешены JPEG, PNG, WebP');
 const meta=await sharp(bytes,{limitInputPixels:MP,failOn:'warning'}).metadata();
 if(!meta.width||!meta.height||meta.width*meta.height>MP||(meta.pages??1)!==1)refuse('Слишком большое или анимированное изображение');
 return meta;
}
function inspectObject(root) {
 const stack=[root];let visited=0;
 while(stack.length){const v=stack.pop();if(++visited>200000)refuse('Сложность GLB превышена');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(k==='uri')refuse('GLB должен содержать только встроенные данные без URI');if(k==='extensions'&&x&&typeof x==='object'&&Object.keys(x).some(e=>e!=='KHR_materials_unlit'))refuse('Расширение GLB не поддерживается');if(typeof x==='number'&&!Number.isFinite(x))refuse('Некорректное число');if(x&&typeof x==='object')stack.push(x);}}
}
async function parseGlb(b) {
 if(b.length<20||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)refuse('Некорректный GLB v2');
 const length=b.readUInt32LE(12);if(length%4||length>2*1024*1024||20+length>b.length||b.readUInt32LE(16)!==0x4e4f534a)refuse('Некорректный JSON GLB');
 const j=JSON.parse(b.subarray(20,20+length).toString('utf8'));inspectObject(j);
 if(j.asset?.version!=='2.0'||j.skins?.length||j.animations?.length)refuse('Анимация/скелет/версия GLB не поддерживаются');
 if([...(j.extensionsUsed??[]),...(j.extensionsRequired??[])].some(e=>e!=='KHR_materials_unlit'))refuse('Расширение GLB не поддерживается');
 const nodes=j.nodes??[];if(nodes.length>1000)refuse('Слишком много узлов');
 const accessors=j.accessors??[];const componentCounts={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};let components=0;
 for(const a of accessors){if(!Number.isSafeInteger(a.count)||a.count<0||!componentCounts[a.type]||a.sparse)refuse('Accessor GLB не поддерживается');components+=a.count*componentCounts[a.type];}if(components>8_000_000)refuse('Превышен лимит компонентов');
 let vertexCount=0,triangleCount=0;const surfaceIds=[];
 for(const [mi,m] of (j.meshes??[]).entries()) for(const [pi,p] of (m.primitives??[]).entries()) {
  if((p.mode??4)!==4||p.targets?.length)refuse('Поддерживаются только triangle mesh без morph targets');
  const pos=accessors[p.attributes?.POSITION];if(!pos||pos.type!=='VEC3'||pos.componentType!==5126)refuse('Некорректный POSITION');
  const indices=p.indices===undefined?null:accessors[p.indices];if(p.indices!==undefined&&(!indices||indices.type!=='SCALAR'))refuse('Некорректные индексы');
  const count=indices?indices.count:pos.count;if(count%3)refuse('Неполные треугольники');vertexCount+=pos.count;triangleCount+=count/3;surfaceIds.push(`mesh:${mi}:primitive:${pi}`);
 }
 if(!triangleCount||triangleCount>250000||vertexCount>750000)refuse('GLB должен иметь 1–250000 треугольников и ≤750000 вершин');
 // Counts also bound render instances: repeated nodes cannot amplify a small mesh without limit.
 let renderedVertices=0,renderedTriangles=0;
 for(const n of nodes)if(n.mesh!==undefined){const mesh=j.meshes?.[n.mesh];if(!mesh)refuse('Некорректный mesh');for(const p of mesh.primitives){const a=accessors[p.attributes.POSITION];renderedVertices+=a.count;renderedTriangles+=(p.indices===undefined?a.count:accessors[p.indices].count)/3;}}
 if(renderedVertices>750000||renderedTriangles>250000)refuse('Слишком много экземпляров геометрии');
 const binStart=20+length;let bin=Buffer.alloc(0);
 if(binStart<b.length){if(binStart+8>b.length||b.readUInt32LE(binStart+4)!==0x004e4942||binStart+8+b.readUInt32LE(binStart)!==b.length)refuse('Некорректный BIN GLB');bin=b.subarray(binStart+8);}
 let pixels=0;for(const img of j.images??[]){const view=j.bufferViews?.[img.bufferView];if(!view||view.buffer!==0||!Number.isSafeInteger(view.byteLength)||view.byteLength<1)refuse('Изображение GLB без bufferView');const offset=view.byteOffset??0;if(!Number.isSafeInteger(offset)||offset<0||offset+view.byteLength>bin.length)refuse('Изображение вне BIN');const bytes=bin.subarray(offset,offset+view.byteLength);const meta=await imageInfo(bytes);pixels+=meta.width*meta.height;if(pixels>MP)refuse('Встроенные изображения превышают 20 MP');await sharp(bytes,{limitInputPixels:MP,failOn:'warning'}).raw().toBuffer();}
 const report=await validator.validateBytes(new Uint8Array(b),{format:'glb',maxIssues:64,externalResourceFunction:()=>Promise.reject(new Error('External resources forbidden'))});
 if(report.issues.numErrors||report.issues.truncated)refuse('GLB не прошёл Khronos validation');
 return {mime:'model/gltf-binary',metadata:{vertexCount,triangleCount,nodeCount:nodes.length,surfaceIds,validator:'2.0.0-dev.3.10'}};
}
async function run({originalPath,normalizedPath,kind}) {
 const b=await readFile(originalPath);if(!b.length||b.length>(kind==='glb'?25:10)*1024*1024)refuse('Неверный размер файла');
 const originalHash=createHash('sha256').update(b).digest('hex');
 if(kind==='glb')return {...await parseGlb(b),originalHash,bytes:b.length,normalizedBytes:0,normalizedHash:null};
 await imageInfo(b);const result=await sharp(b,{limitInputPixels:MP,failOn:'warning'}).rotate().webp({quality:90}).toBuffer({resolveWithObject:true});
 if(result.data.length>20*1024*1024)refuse('Нормализованное изображение превышает 20 MiB');
 const out=await open(normalizedPath,'wx',0o600);try{await out.writeFile(result.data);await out.sync();}finally{await out.close();}
 return {mime:imageMime(b),normalizedMime:'image/webp',originalHash,bytes:b.length,normalizedBytes:result.data.length,normalizedHash:createHash('sha256').update(result.data).digest('hex'),metadata:{width:result.info.width,height:result.info.height,normalizedMime:'image/webp'}};
}
process.once('message',async input=>{try{process.send?.({ok:true,result:await run(input)},()=>process.exit(0));}catch(error){process.send?.({ok:false,message:error instanceof Error?error.message:'Некорректный файл'},()=>process.exit(1));}});
