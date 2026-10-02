const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
let account = null;
const messages = { invalid_credentials:'Проверьте почту и пароль (12–128 символов).', registration_unavailable:'Регистрация недоступна для этого адреса. Попробуйте войти.', authentication_required:'Войдите, чтобы открыть свои фото.', invalid_image:'Нужен корректный JPEG, PNG или WebP.', image_too_large:'Фото превышает 10 МиБ или 20 мегапикселей.', body_too_large:'Файл или запрос слишком большой.', rate_limited:'Слишком много запросов. Попробуйте позже.', busy:'Сервис занят. Попробуйте ещё раз.', origin_denied:'Адрес страницы не совпадает с адресом сервиса.', service_unavailable:'Сервис временно недоступен.', not_found:'Фото уже удалено или недоступно.' };
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path,{credentials:'same-origin',...options}); }
  catch { throw new Error('Нет связи с сервером. Состояние неизвестно; попробуйте обновить.'); }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) showAccount(null);
    throw new Error(messages[data.error] ?? 'Не удалось выполнить запрос.');
  }
  return data;
}
function showAccount(value) {
  account = value; $('auth').hidden = !!account; $('workspace').hidden = !account; $('logout').hidden = !account;
  $('account-info').textContent = account ? `${account.email} · Кредитов: ${account.credits}` : '';
  if (!account) $('uploads').replaceChildren();
}
async function refresh() {
  const { uploads } = await api('/api/uploads');
  $('uploads').replaceChildren(); $('empty').hidden = uploads.length > 0;
  for (const upload of uploads) {
    const item = document.createElement('li'); const link = document.createElement('a');
    link.href = `/api/uploads/${upload.id}`; link.target = '_blank'; link.rel = 'noopener';
    const image = document.createElement('img'); image.src = link.href; image.alt = 'Ваша исходная фотография комнаты'; image.loading = 'lazy';
    link.append(image,document.createTextNode('Открыть фото')); item.append(link);
    const info = document.createElement('p'); info.textContent = `${upload.width} × ${upload.height} · приватно`; item.append(info);
    const remove = document.createElement('button'); remove.textContent = 'Удалить фото'; remove.className = 'secondary';
    remove.addEventListener('click',async () => {
      remove.disabled = true;
      try { await api(link.getAttribute('href'),{method:'DELETE'}); await refresh(); status('Фото удалено.'); }
      catch (error) { status(error.message); remove.disabled = false; }
    }); item.append(remove); $('uploads').append(item);
  }
}
$('auth-form').addEventListener('submit',async event => {
  event.preventDefault(); const form = event.currentTarget; const action = event.submitter?.value ?? 'login';
  const password = $('password').value;
  if ([...password].length < 12 || [...password].length > 128) { status(messages.invalid_credentials); return; }
  form.querySelectorAll('button').forEach(button => button.disabled = true); status('Проверяем…');
  try {
    await api(`/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password})});
    $('password').value = ''; showAccount((await api('/api/me')).account); await refresh(); status('Вы вошли. Можно сохранить фото комнаты.');
  } catch (error) { status(error.message); }
  finally { form.querySelectorAll('button').forEach(button => button.disabled = false); }
});
$('upload-form').addEventListener('submit',async event => {
  event.preventDefault(); const file = $('file').files[0]; if (!file) return;
  if (file.size > 10485760) { status(messages.image_too_large); return; }
  const button = event.currentTarget.querySelector('button'); button.disabled = true; status('Проверяем и сохраняем фото…');
  try {
    await api('/api/uploads',{method:'POST',headers:{'Content-Type':file.type},body:file}); $('file').value = ''; await refresh(); status('Фото сохранено приватно. Редизайн ещё не доступен.');
  } catch (error) { status(error.message); }
  finally { button.disabled = false; }
});
$('refresh').addEventListener('click',() => refresh().then(() => status('Список обновлён.')).catch(error => status(error.message)));
$('logout').addEventListener('click',async () => {
  try { await api('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); showAccount(null); status('Вы вышли.'); }
  catch (error) { status(error.message); }
});
(async () => {
  try { showAccount((await api('/api/me')).account); await refresh(); status('Ваши фото доступны только вам.'); }
  catch (error) { showAccount(null); status(error.message); }
})();
