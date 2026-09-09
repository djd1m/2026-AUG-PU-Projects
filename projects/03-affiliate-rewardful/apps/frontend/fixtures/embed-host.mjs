import { originsFor, variantOrigin } from '../../../shared/contracts/deployment.mjs';
const allowedParents=new Set(originsFor('A'));
if(!allowedParents.has(location.origin))throw new Error('Open the fixture host on the A origin');
const child=new URL('/',variantOrigin('B',location.origin));
child.search=new URLSearchParams({embed:'1',parentOrigin:location.origin});
const frame=document.querySelector('#customer-frame');
const publish=document.querySelector('#host-publish');
frame.src=child.href;
let ready=false,published=false;
function exactMessage(value,type) {
  return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')==='type,version'
    && value.type===type && value.version===1;
}
function valueMoment() {
  frame.contentWindow.postMessage({type:'n3.value-moment',version:1,event:'widget_published'},child.origin);
}
window.addEventListener('message',event=>{
  if(event.origin!==child.origin || event.source!==frame.contentWindow)return;
  if(exactMessage(event.data,'n3.ready')) {
    ready=true;publish.disabled=false;document.querySelector('#host-feedback').textContent='Предложение готово. Опубликуйте демовиджет, чтобы увидеть его.';
    if(published)valueMoment();
  } else if(exactMessage(event.data,'n3.dismissed')) {
    frame.hidden=true;document.querySelector('#embed-result').textContent='Предложение закрыто. Ваш виджет продолжает работать.';
  }
});
publish.addEventListener('click',()=>{
  if(!ready)return;published=true;frame.hidden=false;valueMoment();
  document.querySelector('#host-feedback').textContent='Демовиджет опубликован. Участие в программе добровольное.';
});
document.querySelector('#host-edit').addEventListener('click',()=>{
  document.querySelector('#widget-title').textContent=document.querySelector('#widget-title-input').value;
  document.querySelector('#host-feedback').textContent='Заголовок демовиджета сохранён.';
});
