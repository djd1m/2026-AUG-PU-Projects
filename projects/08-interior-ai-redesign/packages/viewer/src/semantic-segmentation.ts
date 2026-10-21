export type SemanticRole = 'floor' | 'walls' | 'ceiling' | 'furniture' | 'unknown';
export interface SegmentationEligibility { eligible:boolean; coverage:number; reason:string; regions:number }
type Plane = { area:number; weighted:number; minY:number; maxY:number; x:number; z:number; xx:number; zz:number; xz:number };
type Triangle = { area:number; horizontalArea:number; minY:number; maxY:number; x:number; y:number; z:number };
const roles:SemanticRole[]=['floor','walls','ceiling','furniture','unknown'];
const tolerance=0.12, heightBin=0.05, wallBin=0.1;
// Fixed orientations keep both inference and lookup bounded. No pairwise triangle search.
const directions=Array.from({length:16},(_,i)=>({x:Math.cos(i*Math.PI/16),z:Math.sin(i*Math.PI/16)}));

/** World-metre geometry approximation; source indices and attributes are never edited. */
export function segmentTriangles(positions:ArrayLike<number>,indices:ArrayLike<number>): {
 groups:Record<SemanticRole,number[]>; floorY:number; counts:Record<SemanticRole,number>; eligibility:SegmentationEligibility;
} {
 if(!Number.isSafeInteger(positions.length)||positions.length<0||positions.length%3!==0||!Number.isSafeInteger(indices.length)||indices.length<0||indices.length%3!==0||indices.length>3_000_000)throw new RangeError('Invalid or oversized triangle geometry');
 const groups:Record<SemanticRole,number[]>={floor:[],walls:[],ceiling:[],furniture:[],unknown:[]};
 const counts:Record<SemanticRole,number>={floor:0,walls:0,ceiling:0,furniture:0,unknown:0};
 const horizontal=new Map<number,Plane>(), walls=directions.map(()=>new Map<number,Plane>());
 const triangles:Triangle[]=[];
 let totalArea=0,highestY=-Infinity,planeBins=0,resourceLimited=false;
 function add(map:Map<number,Plane>,key:number,area:number,coordinate:number,minY:number,maxY:number,x:number,z:number){
  if(area<=1e-10)return;
  const previous=map.get(key);
  if(previous){previous.area+=area;previous.weighted+=coordinate*area;previous.minY=Math.min(previous.minY,minY);previous.maxY=Math.max(previous.maxY,maxY);previous.x+=x*area;previous.z+=z*area;previous.xx+=x*x*area;previous.zz+=z*z*area;previous.xz+=x*z*area;}
  else if(planeBins<100_000){map.set(key,{area,weighted:coordinate*area,minY,maxY,x:x*area,z:z*area,xx:x*x*area,zz:z*z*area,xz:x*z*area});planeBins++;}
  else resourceLimited=true;
 }
 for(let i=0;i<indices.length;i+=3){
  const ids=[indices[i],indices[i+1],indices[i+2]];
  for(const id of ids)if(!Number.isSafeInteger(id)||id<0||id>=positions.length/3)throw new RangeError('Triangle index out of bounds');
  const [a,b,c]=ids.map(id=>[positions[id*3],positions[id*3+1],positions[id*3+2]]);
  if(![...a,...b,...c].every(Number.isFinite))throw new RangeError('Nonfinite triangle position');
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);
  const area=Number.isFinite(length)&&length>1e-10?length/2:0;
  const minY=Math.min(a[1],b[1],c[1]),maxY=Math.max(a[1],b[1],c[1]);
  const x=a[0]/3+b[0]/3+c[0]/3,y=a[1]/3+b[1]/3+c[1]/3,z=a[2]/3+b[2]/3+c[2]/3;
  triangles.push({area,horizontalArea:area?Math.abs(ny)/2:0,minY,maxY,x,y,z});
  if(!area)continue;
  totalArea+=area;highestY=Math.max(highestY,maxY);
  // Projected area supports planes even when noisy local normals point away from them.
  if(maxY-minY<=tolerance*2)add(horizontal,Math.round(y/heightBin),Math.abs(ny)/2,y,minY,maxY,x,z);
  // Seed vertical support from predominantly vertical facets only; assignments below
  // accept every nearby facet, including wrinkles whose normals fail this seed rule.
  if(Math.abs(ny)>=Math.max(Math.abs(nx),Math.abs(nz)))continue;
  for(let d=0;d<directions.length;d++){
   const normal=directions[d];
   // Small facets fit many offset bins: only their observed wall-normal direction
   // may seed a plane. Distance-only assignment below still fills noisy facets.
   if(Math.abs(nx*normal.x+nz*normal.z)/Math.hypot(nx,nz)<0.94)continue;
   const pa=a[0]*normal.x+a[2]*normal.z,pb=b[0]*normal.x+b[2]*normal.z,pc=c[0]*normal.x+c[2]*normal.z;
   if(Math.max(pa,pb,pc)-Math.min(pa,pb,pc)<=tolerance*2){
    const offset=x*normal.x+z*normal.z;
    add(walls[d],Math.round(offset/wallBin),Math.abs(nx*normal.x+nz*normal.z)/2,offset,minY,maxY,x,z);
   }
  }
 }
 function neighborhood(map:Map<number,Plane>,key:number,radius:number):Plane {
  const sum:Plane={area:0,weighted:0,minY:Infinity,maxY:-Infinity,x:0,z:0,xx:0,zz:0,xz:0};
  for(let offset=-radius;offset<=radius;offset++){const p=map.get(key+offset);if(p){sum.area+=p.area;sum.weighted+=p.weighted;sum.minY=Math.min(sum.minY,p.minY);sum.maxY=Math.max(sum.maxY,p.maxY);sum.x+=p.x;sum.z+=p.z;sum.xx+=p.xx;sum.zz+=p.zz;sum.xz+=p.xz;}}
  return sum;
 }
 const supportedWalls=walls.map((map,d)=>{
  const supported=new Map<number,Plane & {normalX:number;normalZ:number;offset:number}>();
  for(const key of map.keys()){
   const p=neighborhood(map,key,1);
   if(p.area>=0.5&&p.maxY-p.minY>1.4){
    const x=p.x/p.area,z=p.z/p.area,xx=Math.max(0,p.xx/p.area-x*x),zz=Math.max(0,p.zz/p.area-z*z),xz=p.xz/p.area-x*z;
    const delta=Math.hypot(xx-zz,2*xz),major=(xx+zz+delta)/2,minor=Math.max(0,(xx+zz-delta)/2);
    // Fit the whole support strip: a diagonal slice through a wall is still that wall,
    // not a new diagonal plane extending through furniture elsewhere in the room.
    if(major>1e-8&&(minor/major>0.12||minor>0.0009))continue;
    const angle=0.5*Math.atan2(2*xz,xx-zz)+Math.PI/2;
    const normalX=major>1e-8?Math.cos(angle):directions[d].x,normalZ=major>1e-8?Math.sin(angle):directions[d].z;
    supported.set(key,{...p,normalX,normalZ,offset:x*normalX+z*normalZ});
   }
  }
  return supported;
 });
 let wallBase=Infinity,wallTop=-Infinity;
 for(const map of supportedWalls)for(const p of map.values()){wallBase=Math.min(wallBase,p.minY);wallTop=Math.max(wallTop,p.maxY);}
 const horizontalPlanes=[...horizontal.keys()].map(key=>neighborhood(horizontal,key,2));
 let maximumSupport=0;
 for(const p of horizontalPlanes)maximumSupport=Math.max(maximumSupport,p.area);
 const support=Math.max(0.5,maximumSupport*0.03);
 const bottomLimit=Number.isFinite(wallBase)?wallBase+Math.max(0.25,(wallTop-wallBase)*0.2):Infinity;
 let floorY=Infinity,ceilingY=-Infinity;
 for(const p of horizontalPlanes){const y=p.weighted/p.area;if(p.area>=support&&y<=bottomLimit)floorY=Math.min(floorY,y);}
 const hasFloor=Number.isFinite(floorY);
 if(!hasFloor)floorY=0;
 if(hasFloor)for(const p of horizontalPlanes){const y=p.weighted/p.area;if(p.area>=support&&y-floorY>=1.8&&highestY-y<=tolerance*2)ceilingY=Math.max(ceilingY,y);}
 let ambiguousArea=0;
 const candidates:SemanticRole[]=triangles.map((t,i)=>{
  if(!t.area||resourceLimited)return 'unknown';
  if(hasFloor&&Math.max(Math.abs(t.minY-floorY),Math.abs(t.maxY-floorY))<=tolerance)return 'floor';
  let wallNormal:{x:number;z:number}|undefined;
  for(let d=0;d<directions.length;d++){
   const n=directions[d],key=Math.round((t.x*n.x+t.z*n.z)/wallBin);
   for(let neighbor=-1;neighbor<=1;neighbor++){
    const p=supportedWalls[d].get(key+neighbor);if(!p)continue;
    const offset=p.offset;
    let near=true;
    for(let v=0;v<3;v++){const index=indices[i*3+v];if(Math.abs(positions[index*3]*p.normalX+positions[index*3+2]*p.normalZ-offset)>tolerance){near=false;break;}}
    if(near){
     if(wallNormal&&Math.abs(wallNormal.x*p.normalX+wallNormal.z*p.normalZ)<0.9){ambiguousArea+=t.area;return 'unknown';}
     wallNormal={x:p.normalX,z:p.normalZ};
    }
   }
  }
  if(wallNormal)return 'walls';
  if(Number.isFinite(ceilingY)&&Math.max(Math.abs(t.minY-ceilingY),Math.abs(t.maxY-ceilingY))<=tolerance)return 'ceiling';
  if(hasFloor&&t.minY-floorY>=0.12&&t.maxY-floorY<=1.4)return 'furniture';
  return 'unknown';
 });
 // Weld coincident/near-coincident seam vertices for connectivity only, never moving them.
 const parent=Int32Array.from({length:triangles.length},(_,i)=>i),rank=new Uint8Array(triangles.length);
 function find(i:number):number{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 function join(a:number,b:number){a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;}
 const owners=new Map<string,number>();
 for(let i=0;i<triangles.length;i++)if(candidates[i]!=='unknown')for(let v=0;v<3;v++){
  const index=indices[i*3+v];
  const key=`${candidates[i]}:${Math.round(positions[index*3]/0.02)},${Math.round(positions[index*3+1]/0.02)},${Math.round(positions[index*3+2]/0.02)}`;
  const other=owners.get(key);if(other===undefined)owners.set(key,i);else join(i,other);
 }
 const regions=new Map<number,{area:number;horizontalArea:number;role:SemanticRole;count:number}>();
 for(let i=0;i<triangles.length;i++)if(candidates[i]!=='unknown'){
  const root=find(i),p=regions.get(root),t=triangles[i];
  if(p){p.area+=t.area;p.horizontalArea+=t.horizontalArea;p.count++;}
  else regions.set(root,{area:t.area,horizontalArea:t.horizontalArea,role:candidates[i],count:1});
 }
 let coloredArea=0,acceptedRegions=0,discardedArea=0;
 const accepted=new Set<number>();
 for(const [root,p]of regions){
  const threshold=p.role==='furniture'?0.4:0.5;
  if(p.area>=threshold&&(p.role!=='furniture'||p.horizontalArea>=Math.max(0.15,p.area*0.1))){accepted.add(root);acceptedRegions++;}
  else discardedArea+=p.area;
 }
 for(let i=0;i<triangles.length;i++){
  const role=candidates[i]!=='unknown'&&accepted.has(find(i))?candidates[i]:'unknown';
  groups[role].push(indices[i*3],indices[i*3+1],indices[i*3+2]);counts[role]++;
  if(role!=='unknown')coloredArea+=triangles[i].area;
 }
 const coverage=totalArea>0&&Number.isFinite(totalArea)?Math.min(1,Math.max(0,coloredArea/totalArea)):0;
 const fragmented=discardedArea>coloredArea*0.25||acceptedRegions>24;
 const ambiguous=totalArea>0&&ambiguousArea/totalArea>0.1;
 const eligible=!resourceLimited&&!ambiguous&&hasFloor&&counts.floor>0&&coverage>=0.8&&!fragmented;
 const reason=resourceLimited?'resource_limit':ambiguous?'ambiguous_wall_planes':!hasFloor||!counts.floor?'no_supported_floor':fragmented?'fragmented_regions':coverage<0.8?'insufficient_coverage':'supported_regions';
 for(const role of roles)if(counts[role]*3!==groups[role].length)throw new Error('Triangle partition mismatch');
 return {groups,floorY,counts,eligibility:{eligible,coverage,reason,regions:acceptedRegions}};
}
