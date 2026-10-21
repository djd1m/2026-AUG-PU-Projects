import { it,expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { wallPanels } from '../../packages/viewer/src/renderer.js';
import { RoomPlan } from '../../packages/viewer/src/index.js';
import { validateManualRoom } from '../../packages/domain/src/space/index.js';
it('manual wall mesh panels cut real openings, retain measured net area',()=>{const room=validateManualRoom({lengthM:'4.5',widthM:'4',heightM:'2.7',openings:[{id:'door',wallId:'north',offsetM:'1',widthM:'0.9',heightM:'2.1',sillM:'0'},{id:'window',wallId:'east',offsetM:'1',widthM:'1.2',heightM:'1',sillM:'1'}]});const panels=wallPanels(room);expect(panels.filter(p=>p.wallId==='north').reduce((a,p)=>a+p.width*p.height,0)).toBeCloseTo(10.26,10);expect(panels.filter(p=>p.wallId==='east').reduce((a,p)=>a+p.width*p.height,0)).toBeCloseTo(9.6,10);expect(panels.some(p=>p.wallId==='north'&&p.offset>=1&&p.offset+p.width<=1.9&&p.bottom<2.1)).toBe(false);});
it('2D plan renders known dimensions and escapes object labels, decimal catalog sizes supported',()=>{const room=validateManualRoom({lengthM:'4.5',widthM:'4',heightM:'2.7',openings:[]});const html=renderToStaticMarkup(createElement(RoomPlan,{room,scene:{materials:[],objects:[{id:'<script>alert(1)</script>',positionM:[2,0,2],dimensionsM:['1','0.5','0.8'],rotationY:0}]}}));expect(html).toContain('4.5');expect(html).toContain('2.7');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('width="1"');});
