export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const styles={warm:'Тёплый',minimal:'Минимализм',afrohemian:'Афробогемный',playful:'Яркий'};
const layout=(title,body)=>`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — RoomKind</title><body><header><a href="/examples">RoomKind</a></header><main>${body}</main></body></html>`;
function example(item) {
  return `<article><h2><a href="${escapeHtml(item.page)}">${escapeHtml(item.source_context)}</a></h2><p>Стиль: ${escapeHtml(styles[item.style])}</p><p>${escapeHtml(item.description)}</p><p>AI redesign — визуализация с помощью ИИ</p><img width="1024" height="434" src="${escapeHtml(item.composite)}" alt="Сравнение комнаты до и после AI redesign"></article>`;
}
export const publicPage=item=>layout(item.source_context,example(item));
export const publicList=result=>layout('Примеры',`<h1>Примеры AI redesign</h1>${result.items.map(example).join('')}${result.next?`<a href="/examples?before=${escapeHtml(result.next)}">Следующая страница</a>`:''}`);
