import {it,expect} from 'vitest';
import {resolveUploadKind} from '../../apps/web/src/lib/upload-asset.js';
it.each(['room_photo','reference','glb'] as const)('GLB extension overrides selected %s',selected=>{
 expect(resolveUploadKind({name:'scan.GLB',type:'application/octet-stream'},selected)).toBe('glb');
});
it('GLB MIME without extension routes to mesh; images retain the selected image purpose',()=>{
 expect(resolveUploadKind({name:'scan',type:'model/gltf-binary'},'room_photo')).toBe('glb');
 expect(resolveUploadKind({name:'room.png',type:'image/png'},'reference')).toBe('reference');
 expect(resolveUploadKind({name:'room.glb.png',type:'image/png'},'room_photo')).toBe('room_photo');
});
