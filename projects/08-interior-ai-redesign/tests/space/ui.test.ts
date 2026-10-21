import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SpacePanel} from '../../apps/web/src/components/SpacePanel';
import {createManualShell,type ShellRevision} from '@n8/domain/space';
it('SPACE-R1 measured plan remains visible alongside loading or available3D, independent of WebGLfailure',()=>{
 const shell:ShellRevision={...createManualShell({lengthM:'6',widthM:'3',heightM:'2.7',openings:[]},true),id:'00000000-0000-4000-8000-000000000002',projectId:'00000000-0000-4000-8000-000000000001',parentId:null,hash:'test',confirmedAt:new Date(0).toISOString(),createdAt:new Date(0).toISOString()};
 const html=renderToStaticMarkup(createElement(SpacePanel,{context:{project:{id:shell.projectId,name:'Комната',region:'Москва',store:null,state:'active',version:2,currentShellId:shell.id,currentDesignId:null,currentBudgetId:null,sceneCatalog:[],createdAt:new Date(0).toISOString()},shell,shells:[shell],assets:[],references:[],refresh:async()=>{},notify:()=>{}}}));
 expect(html).toContain('aria-label="План 6 на 3 метров"');expect(html).toContain('Подготавливаем просмотр комнаты');expect(html).toContain('Ширина 3 м · высота 2.7 м');
});
