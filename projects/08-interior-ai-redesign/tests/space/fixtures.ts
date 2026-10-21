interface TestGlb {
 asset:{version:string};scene:number;scenes:{nodes:number[]}[];nodes:{mesh:number}[];
 meshes:{primitives:{attributes:{POSITION:number};mode?:number}[]}[];
 buffers:{byteLength:number;uri?:string}[];bufferViews:{buffer:number;byteOffset:number;byteLength:number;target:number}[];
 accessors:{bufferView:number;componentType:number;count:number;type:string;min:number[];max:number[];sparse?:object}[];
 animations?:object[];skins?:object[];extensionsUsed?:string[];
}
export function triangleGlb(change?:(json:TestGlb)=>void):Buffer {
 const binary=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>binary.writeFloatLE(n,i*4));
 const json:TestGlb={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};change?.(json);const raw=Buffer.from(JSON.stringify(json));const data=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(data);const output=Buffer.alloc(12+8+data.length+8+binary.length);output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(data.length,12);output.writeUInt32LE(0x4e4f534a,16);data.copy(output,20);output.writeUInt32LE(binary.length,20+data.length);output.writeUInt32LE(0x004e4942,24+data.length);binary.copy(output,28+data.length);return output;
}

/** Real embedded texture, UVs and material; exercises decoder and viewer. */
export function texturedGlb(image:Buffer,mime='image/jpeg',copies=1):Buffer {
 const base=triangleGlb(),n=base.readUInt32LE(12),j=JSON.parse(base.subarray(20,20+n).toString());
 const stride=Math.ceil(image.length/4)*4,binary=Buffer.alloc(60+copies*stride);base.subarray(28+n).copy(binary);
 [0,0,1,0,0,1].forEach((v,i)=>binary.writeFloatLE(v,36+i*4));
 j.bufferViews.push({buffer:0,byteOffset:36,byteLength:24,target:34962});j.accessors.push({bufferView:1,componentType:5126,count:3,type:'VEC2',min:[0,0],max:[1,1]});
 j.meshes[0].primitives[0].attributes.TEXCOORD_0=1;j.meshes[0].primitives[0].material=0;
 j.images=[];for(let i=0;i<copies;i++){const offset=60+i*stride;image.copy(binary,offset);j.images.push({bufferView:j.bufferViews.length,mimeType:mime});j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:image.length});}
 j.textures=[{source:0}];j.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:0}},extensions:{KHR_materials_unlit:{}}}];j.extensionsUsed=['KHR_materials_unlit'];j.buffers[0].byteLength=binary.length;
 const raw=Buffer.from(JSON.stringify(j)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const out=Buffer.alloc(28+json.length+binary.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(binary.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);binary.copy(out,28+json.length);return out;
}
