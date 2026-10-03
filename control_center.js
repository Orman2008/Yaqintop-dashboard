'use strict';

(() => {
  const main = document.querySelector('main');
  const sections = [...main.querySelectorAll(':scope > section')];
  const groupByTitle = { 'Все магазины': 'stores', 'Отзывы': 'reviews', 'Очередь жалоб': 'reports', 'Глобальный каталог': 'catalog', 'Сопоставление каталога': 'catalog', 'Пользователи': 'legacy-users', 'Заметки': 'dashboard' };
  sections.filter((s) => !s.classList.contains('connection')).forEach((s) => {
    s.dataset.page = groupByTitle[s.querySelector('h2')?.textContent] || 'dashboard';
  });
  const nav = document.createElement('nav'); nav.className = 'control-nav';
  const pages = [['dashboard','Dashboard'],['stores','Stores'],['users','Users'],['products','Products'],['search','Search Intelligence'],['qr','QR Deals'],['moderation','Moderation'],['operations','Operations'],['finance','Finance'],['tasks','Notes'],['audit','Audit Log'],['catalog','Global Catalog'],['support','Support'],['reviews','Reviews / UGC'],['reports','Reports'],['taxonomy','Categories & Brands'],['subscriptions','Subscriptions']];
  nav.innerHTML = pages.map(([id, label]) => `<button type="button" data-page-button="${id}">${label}</button>`).join('');
  main.insertBefore(nav, $('error'));
  const panel = (page, html) => {
    const section = document.createElement('section'); section.className = 'panel control-panel'; section.dataset.page = page; section.hidden = true;
    section.innerHTML = html; main.append(section); return section;
  };
  panel('dashboard', '<h2>Оперативная сводка</h2><div id="controlSummary" class="metrics"></div>');
  panel('users', '<div class="section-title"><h2>Поиск аккаунтов</h2><div class="actions"><input id="controlUserSearch" placeholder="Имя, телефон, ID"><select id="controlUserRole"><option value="">Все роли</option><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="staff">Seller Staff</option></select><button id="controlFindUsers" class="action">Найти</button></div></div><div id="controlUsers"></div>');
  panel('support', `<div class="section-title"><h2>Поддержка @mapmarket_support_bot</h2><button id="supportReload" class="action">Обновить</button></div>
    <div id="supportCounters" class="actions"></div><div class="actions support-filters"><select id="supportStatus"><option value="">Все</option><option>OPEN</option><option>WAITING_ADMIN</option><option>WAITING_USER</option><option>RESOLVED</option></select><select id="supportType"><option value="">Все пользователи</option><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="unknown">Без аккаунта</option></select><input id="supportSearch" placeholder="Номер обращения или имя"><select id="supportCategory"><option value="">Все категории</option>${['account','products','stores','map','qr','plans','app','other'].map((x) => `<option>${x}</option>`).join('')}</select></div>
    <div class="actions"><label>С даты <input id="supportFrom" type="date"></label><label>До даты <input id="supportTo" type="date"></label></div><div class="support-layout"><div id="supportInbox"></div><div id="supportConversation">Выберите обращение</div></div>`);
  panel('audit', '<div class="section-title"><h2>Audit Log</h2><input id="auditSearch" placeholder="Действие"><button id="auditReload" class="action">Обновить</button></div><div id="auditRows"></div><button id="auditMore" class="action">Следующие 100</button>');
  panel('operations', '<div class="section-title"><h2>Operations</h2><button id="operationsReload" class="action">Проверить</button></div><div id="operationsData"></div>');
  panel('taxonomy', '<div class="section-title"><h2>Categories & Brands</h2><div class="actions"><button id="addCategory" class="action">Добавить категорию</button><button id="addBrand" class="action">Добавить бренд</button><button id="taxonomyReload" class="action">Обновить</button></div></div><div id="taxonomyData"></div>');
  panel('subscriptions', '<h2>Подписки ADMIN / PILOT</h2><p>Выдача тарифа на месяц доступна по нажатию на тариф магазина. Это не банковская оплата.</p><div id="subscriptionStores"></div>');
  const dialog = document.createElement('dialog'); dialog.className = 'control-dialog'; dialog.innerHTML = '<button id="closeControlDetail" class="icon-button" aria-label="Закрыть">×</button><div id="controlDetail"></div>'; document.body.append(dialog);
  $('closeControlDetail').onclick = () => dialog.close();
  let page = 'dashboard'; let selectedTicket = null; let ticketMessages = []; let olderBefore = null; let pollBusy = false; let auditOffset = 0;
  let replyKey = null; let replyText = ''; let taxonomy = { categories: [], brands: [] }; const objectUrls = [];
  const date = (v) => v ? new Date(v).toLocaleString('ru-RU') : '—';
  let authGeneration = 0;
  const guardedApi = async (...args) => {
    const generation = authGeneration; const data = await api(...args);
    if (generation !== authGeneration) throw new Error('Подключение изменилось; загрузите данные повторно.');
    return data;
  };
  const handle = (fn) => async () => { try { await fn(); } catch (error) { if (error.status === 401 || error.status === 403) clearPrivateState(); setError(error.message); } };
  const rows = (items, columns) => `<div class="table-scroll"><table><thead><tr>${columns.map(([label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${items.map((row) => `<tr>${columns.map(([, value]) => `<td>${value(row)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">Нет данных</td></tr>`}</tbody></table></div>`;
  const object = (value) => `<dl class="detail-fields">${Object.entries(value || {}).map(([key, val]) => `<dt>${esc(key)}</dt><dd>${esc(typeof val === 'object' ? JSON.stringify(val) : val)}</dd>`).join('')}</dl>`;
  const detail = (title, html) => { $('controlDetail').innerHTML = `<h2>${esc(title)}</h2>${html}`; dialog.showModal(); };
  async function summary() {
    const data = await guardedApi('/admin/control/summary');
    $('controlSummary').innerHTML = Object.entries(data).map(([key, value]) => `<article class="metric"><small>${esc(key)}</small><strong>${esc(value)}</strong></article>`).join('');
  }
  async function findUsers() {
    const data = await guardedApi(`/admin/control/users?q=${encodeURIComponent($('controlUserSearch').value)}&role=${encodeURIComponent($('controlUserRole').value)}`);
    $('controlUsers').innerHTML = rows(data, [['Имя', (u) => `<button class="action" data-user-detail="${u.id}">${esc(u.name)} #${u.id}</button>`], ['Телефон', (u) => esc(u.phone)], ['Роль', (u) => esc(u.is_staff ? 'Seller Staff' : u.role)], ['Статус', (u) => u.is_blocked ? 'BLOCKED' : u.is_restricted ? 'RESTRICTED' : 'ACTIVE']]);
    $('controlUsers').querySelectorAll('[data-user-detail]').forEach((button) => button.onclick = handle(() => userDetail(button.dataset.userDetail)));
  }
  async function action(type, id, value) {
    const reason = window.prompt('Причина действия (обязательно):'); if (!reason) return;
    const confirmation = window.prompt(`Для подтверждения введите ${value.toUpperCase()} ${id}`);
    if (!confirmation) return;
    await guardedApi(`/admin/control/${type}/${id}/action`, { method: 'POST', body: JSON.stringify({ action: value, reason, confirmation }) });
    dialog.close(); await load(); if (type === 'users') await findUsers();
  }
  function bindActions(type, id) {
    $('controlDetail').querySelectorAll('[data-control-action]').forEach((button) => button.onclick = handle(() => action(type, id, button.dataset.controlAction)));
  }
  async function userDetail(id) {
    const data = await guardedApi(`/admin/control/users/${id}`);
    detail(`Аккаунт #${id}`, `${object(data.user)}<div class="actions">${['block','unblock','restrict','unrestrict','end_sessions','delete'].map((a) => `<button class="action" data-control-action="${a}">${a}</button>`).join('')}</div><h3>Магазины</h3>${rows(data.stores, [['Магазин', (s) => esc(s.name)], ['Роль', (s) => esc(s.position)]])}<h3>Обращения</h3>${rows(data.tickets, [['Номер', (t) => `#${t.id}`], ['Статус', (t) => esc(t.status)]])}<h3>Жалобы</h3>${rows(data.reports, [['Причина', (r) => esc(r.reason)], ['Статус', (r) => esc(r.status)]])}<h3>История</h3>${rows(data.history, [['Действие', (a) => esc(a.action)], ['Причина', (a) => esc(a.reason)], ['Дата', (a) => date(a.created_at)]])}`);
    bindActions('users', id);
  }
  async function storeDetail(id) {
    const data = await guardedApi(`/admin/control/stores/${id}`);
    detail(`Магазин #${id}`, `${object(data.store)}<div class="actions">${['block','unblock','restrict','unrestrict','review'].map((a) => `<button class="action" data-control-action="${a}">${a}</button>`).join('')}</div><h3>Сотрудники</h3>${rows(data.staff, [['Имя', (s) => esc(s.name)], ['Роль', (s) => esc(s.role)]])}<h3>Товары</h3>${rows(data.products, [['Товар', (p) => esc(p.title)], ['Цена', (p) => money(p.price)]])}<h3>Предложения</h3>${rows(data.offers, [['ID', (o) => esc(o.id)], ['Global Product', (o) => esc(o.master_product_id)], ['Статус', (o) => esc(o.status)]])}<h3>История подписок</h3>${rows(data.subscriptions, [['Тариф', (s) => esc(s.plan)], ['Дата', (s) => date(s.created_at)]])}<h3>Жалобы</h3>${rows(data.reports, [['Причина', (r) => esc(r.reason)], ['Статус', (r) => esc(r.status)]])}<h3>Обращения владельца</h3>${rows(data.tickets, [['Номер', (t) => esc(t.id)], ['Статус', (t) => esc(t.status)]])}`);
    bindActions('stores', id);
  }
  function bindStores() {
    $('shops').querySelectorAll('tr').forEach((tr, index) => {
      const name = tr.querySelector('strong');
      const shop = (dashboard?.shops || []).filter((s) => {
        const search = $('search').value.toLowerCase();
        return !search || [s.name,s.city,s.owner_name].join(' ').toLowerCase().includes(search);
      })[index];
      // IDs come from the existing row action, not its position after filtering.
      const button = tr.querySelector('[data-grant-shop], [data-shop-verify], [data-shop-block]');
      const id = button?.dataset.grantShop || button?.dataset.shopVerify || button?.dataset.shopBlock || shop?.id;
      if (name && id) { name.style.cursor = 'pointer'; name.onclick = handle(() => storeDetail(id)); }
    });
  }
  async function catalogDetail(id) {
    const data = await guardedApi(`/admin/control/catalog/${id}`); const p = data.product;
    detail(`Global Product #${id}`, `${object(p)}<h3>Предложения магазинов</h3>${rows(data.offers, [['Магазин', o => esc(o.shop_name)], ['Цена', o => money(o.price)], ['Статус', o => esc(o.status)]])}
      <h3>Metadata / GTIN</h3>
      ${[['name',p.canonical_name],['gtin',p.gtin],['brand',p.brand],['category',p.category],['description',p.description]].map(([key,value]) => `<label>${esc(key)}<input id="catalogEdit_${key}" value="${esc(value || '')}"></label>`).join('')}
      <label>Attributes (JSON)<textarea id="catalogEdit_attrs">${esc(JSON.stringify(p.attributes || {}, null, 2))}</textarea></label>
      <label>Причина<input id="catalogEdit_reason"></label><button id="catalogEditSave" class="primary">Сохранить</button>
      <h3>История</h3>${rows(data.history, [['Действие', a => esc(a.action)], ['Причина', a => esc(a.reason)], ['Дата', a => date(a.created_at)]])}`);
    $('catalogEditSave').onclick = handle(async () => {
      if (!window.confirm('Изменение canonical данных влияет на все магазины. Подтвердить?')) return;
      const body = Object.fromEntries(['name','gtin','brand','category','description','reason'].map(k => [k,$(`catalogEdit_${k}`).value]));
      body.attributes = JSON.parse($('catalogEdit_attrs').value); body.confirmed = true;
      await guardedApi(`/admin/catalog/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); dialog.close(); await reloadGlobalCatalog();
    });
  }
  const catalogFilters=document.createElement('div'); catalogFilters.className='actions';
  catalogFilters.innerHTML=[['catalogNoGtin','Без GTIN'],['catalogNoPhoto','Без фото'],['catalogDuplicates','Возможные дубли'],['catalogPhotoPending','Фото ожидает проверки'],['catalogPhotoRejected','Фото отклонено']].map(([id,label])=>`<label><input id="${id}" type="checkbox">${label}</label>`).join('');
  $('globalCatalog').closest('section').querySelector('.section-title').append(catalogFilters);
  catalogFilters.querySelectorAll('input').forEach(i=>i.onchange=renderGlobalCatalog);
  function bindCatalog() {
    $('globalCatalog').querySelectorAll('[data-catalog-detail]').forEach(b => b.onclick = handle(() => catalogDetail(b.dataset.catalogDetail)));
  }
  async function inbox() {
    const params = new URLSearchParams({ status: $('supportStatus').value, q: $('supportSearch').value, category: $('supportCategory').value, user_type: $('supportType').value, from: $('supportFrom').value, to: $('supportTo').value });
    const data = await guardedApi(`/admin/support?${params}`);
    $('supportCounters').innerHTML = data.counters.map((c) => `<button class="action" data-support-state="${esc(c.status)}">${esc(c.status)}: ${c.count} · новых ${c.unread || 0}</button>`).join('');
    $('supportCounters').querySelectorAll('[data-support-state]').forEach((b) => b.onclick = handle(async () => { $('supportStatus').value = b.dataset.supportState; await inbox(); }));
    $('supportInbox').innerHTML = data.tickets.map((t) => `<button class="support-ticket" data-ticket="${t.id}"><strong>#${t.id} · ${esc(t.display_name)}</strong><span>${esc(t.category)} · ${esc(t.user_type)} · ${esc(t.status)}</span><small>${date(t.updated_at)} · новых ${t.unread_count}</small></button>`).join('') || '<p>Обращений нет</p>';
    $('supportInbox').querySelectorAll('[data-ticket]').forEach((b) => b.onclick = handle(async () => { selectedTicket = b.dataset.ticket; ticketMessages = []; olderBefore = null; replyKey = null; replyText = ''; if ($('supportReply')) $('supportReply').value = ''; await conversation(); await guardedApi(`/admin/support/${selectedTicket}/read`, { method: 'POST', body: '{}' }); }));
  }
  async function conversation(older = false) {
    const id = selectedTicket; if (!id) return;
    const data = await guardedApi(`/admin/support/${id}${older && olderBefore ? '?before='+encodeURIComponent(olderBefore) : ''}`); if (id !== selectedTicket) return;
    const merged = new Map(ticketMessages.map(m => [String(m.id),m])); for (const m of data.messages) merged.set(String(m.id),m);
    ticketMessages = [...merged.values()].sort((a,b) => Number(a.id)-Number(b.id)); data.messages = ticketMessages;
    if (older || !olderBefore) olderBefore = data.has_more ? data.next_before : null;
    const draft = $('supportReply')?.value || '';
    objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    $('supportConversation').innerHTML = `<h3>#${id} · ${esc(data.ticket.status)}</h3><p>${esc(data.ticket.display_name)} · ${esc(data.ticket.account_name || 'Аккаунт не связан')} · ${esc(data.ticket.user_type)}</p><p>${data.shops.map((s) => esc(s.name)).join(', ')}</p>${olderBefore ? '<button id="supportEarlier" class="action">Предыдущие сообщения</button>' : ''}<div class="support-history">${data.messages.map((m) => `<article class="support-message ${m.sender_type === 'ADMIN' ? 'admin' : ''}"><strong>${esc(m.sender_type)} · ${date(m.created_at)}</strong><p>${esc(m.text)}</p>${m.media_storage_key ? `<img data-support-image="${m.id}" alt="Скриншот пользователя">` : ''}${m.delivery_status ? `<small>${esc(m.delivery_status)} ${esc(m.delivery_error || '')}</small>` : ''}${m.delivery_status === 'FAILED' ? `<button class="action" data-retry="${m.id}">Повторить доставку</button>` : ''}</article>`).join('')}</div>${data.ticket.status !== 'RESOLVED' ? '<textarea id="supportReply" maxlength="4000" placeholder="Написать ответ..."></textarea><div class="actions"><button id="supportSend" class="primary">Отправить</button><button id="supportClose" class="action">Закрыть обращение</button></div>' : '<p>Обращение закрыто. История сохранена.</p>'}`;
    if ($('supportReply')) $('supportReply').value = draft;
    if ($('supportEarlier')) $('supportEarlier').onclick = handle(() => conversation(true));
    for (const image of $('supportConversation').querySelectorAll('[data-support-image]')) {
      const { base, key } = connection();
      const response = await fetch(`${base}/admin/support/media/${image.dataset.supportImage}`, { headers: { 'x-admin-key': key }, signal: AbortSignal.timeout(15000) });
      if (response.ok && id === selectedTicket) { const url = URL.createObjectURL(await response.blob()); objectUrls.push(url); image.src = url; }
      else image.alt = 'Фото временно недоступно';
    }
    $('supportConversation').querySelectorAll('[data-retry]').forEach((b) => b.onclick = handle(async () => { await guardedApi(`/admin/support/${id}/retry/${b.dataset.retry}`, { method: 'POST', body: '{}' }); await conversation(); }));
    if ($('supportSend')) $('supportSend').onclick = handle(async () => {
      const text = $('supportReply').value.trim(); if (!text) return;
      if (replyText !== text || !replyKey) { replyKey = crypto.randomUUID(); replyText = text; }
      $('supportSend').disabled = true;
      try { await guardedApi(`/admin/support/${id}/reply`, { method: 'POST', body: JSON.stringify({ text, request_id: replyKey }) }); $('supportReply').value = ''; replyKey = null; await conversation(); }
      finally { if ($('supportSend')) $('supportSend').disabled = false; }
    });
    if ($('supportClose')) $('supportClose').onclick = handle(async () => {
      const reason = window.prompt('Причина закрытия:'); if (!reason) return;
      const confirmation = window.prompt(`Введите CLOSE ${id}`); if (!confirmation) return;
      await guardedApi(`/admin/support/${id}/close`, { method: 'POST', body: JSON.stringify({ reason, confirmation }) }); await conversation(); await inbox();
    });
  }
  async function auditLog() {
    const data = await guardedApi(`/admin/audit?q=${encodeURIComponent($('auditSearch').value)}&offset=${auditOffset}`);
    $('auditRows').innerHTML = rows(data, [['Admin', (a) => esc(a.admin_id || 'legacy')], ['Действие', (a) => esc(a.action)], ['Объект', (a) => `${esc(a.target_type)} #${esc(a.target_id)}`], ['Причина', (a) => esc(a.reason)], ['Дата', (a) => date(a.created_at)]]);
  }
  async function operations() { $('operationsData').innerHTML = object(await guardedApi('/admin/operations')); }
  async function loadTaxonomy() {
    taxonomy = await guardedApi('/admin/control/taxonomy');
    $('taxonomyData').innerHTML = '<h3>Категории</h3>' + rows(taxonomy.categories, [['Путь', (c) => esc([c.category,c.sub_category,c.leaf_category].filter(Boolean).join(' / '))], ['Статус', (c) => c.archived ? 'Архив' : 'Активна'], ['Действия', (c) => `<button class="action" data-taxonomy="category:${c.id}">Изменить</button>`]]) + '<h3>Бренды</h3>' + rows(taxonomy.brands, [['Бренд', (b) => esc(b.name)], ['Статус', (b) => b.archived ? 'Архив' : 'Активен'], ['Действия', (b) => `<button class="action" data-taxonomy="brand:${b.id}">Изменить</button>`]]);
    $('taxonomyData').querySelectorAll('[data-taxonomy]').forEach((b) => b.onclick = handle(() => editTaxonomy(...b.dataset.taxonomy.split(':'))));
  }
  async function editTaxonomy(type, id) {
    const old = (type === 'brand' ? taxonomy.brands : taxonomy.categories).find((r) => String(r.id) === String(id)) || {};
    const name = window.prompt('Название:', old.name || old.category || ''); if (!name) return;
    const sub_category = type === 'category' ? window.prompt('Подкатегория:', old.sub_category || '') : '';
    if (sub_category === null) return;
    const leaf_category = type === 'category' ? window.prompt('Раздел:', old.leaf_category || '') : '';
    if (leaf_category === null) return;
    const attrsRaw = type === 'category' ? window.prompt('Атрибуты категории (JSON массив):', JSON.stringify(old.attribute_definitions || [])) : '[]'; if (attrsRaw === null) return;
    const sort_order = window.prompt('Порядок:', String(old.sort_order || 0)); if (sort_order === null) return;
    const archived = id ? window.confirm('Архивировать? OK — архив, Отмена — активная запись.') : false;
    const reason = window.prompt('Причина изменения:'); if (!reason) return;
    await guardedApi(`/admin/control/taxonomy/${type}`, { method: 'POST', body: JSON.stringify({ id: id ? Number(id) : undefined, name, sub_category, leaf_category, attribute_definitions: JSON.parse(attrsRaw), sort_order, archived, reason }) }); await loadTaxonomy();
  }
  async function navigate(next) {
    page = next;
    main.querySelectorAll('[data-page]').forEach((s) => s.hidden = s.dataset.page !== page);
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.pageButton === page));
    if (page === 'support') { await inbox(); if (selectedTicket) await conversation(); }
    if (page === 'users') await findUsers();
    if (page === 'stores') bindStores();
    if (page === 'dashboard') await summary();
    if (page === 'audit') await auditLog();
    if (page === 'operations') await operations();
    if (page === 'taxonomy') await loadTaxonomy();
    if (page === 'subscriptions') {
      $('subscriptionStores').innerHTML = rows(dashboard?.shops || [], [['Магазин', (s) => esc(s.name)], ['Тариф', (s) => `<button class="action" data-subscription="${s.id}">${esc(s.plan || s.current_plan || 'FREE')}</button>`]]);
      $('subscriptionStores').querySelectorAll('[data-subscription]').forEach((b) => b.onclick = () => openFreeSubscriptionDialog(b.dataset.subscription));
    }
  }
  const clearPrivateState = () => {
    authGeneration++;
    selectedTicket = null; ticketMessages = []; olderBefore = null; replyKey = null; replyText = '';
    objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    for (const id of ['supportInbox','supportConversation','supportCounters','controlUsers','controlSummary','auditRows','operationsData','taxonomyData']) $(id).replaceChildren();
    dialog.close();
  };
  window.MapMarketControl = { navigate, storeDetail, userDetail, clearPrivateState };
  for (const id of ['apiUrl','adminKey']) $(id).addEventListener('input', clearPrivateState);
  function bindReports() {
    $('reports').querySelectorAll('[data-report-detail]').forEach(b => b.onclick=handle(async()=>{
      const data=await guardedApi(`/admin/control/reports/${b.dataset.reportDetail}`);
      detail('Жалоба #'+b.dataset.reportDetail,object(data.report)+'<h3>Объект</h3>'+object(data.target)+'<h3>Предыдущие действия</h3>'+rows(data.history,[['Действие',a=>esc(a.action)],['Причина',a=>esc(a.reason)],['Admin',a=>esc(a.admin_id)]]));
    }));
  }
  new MutationObserver(bindReports).observe($('reports'),{childList:true});
  const reviewSearch=document.createElement('input'); reviewSearch.placeholder='Поиск по загруженным отзывам'; reviewSearch.setAttribute('aria-label','Поиск отзывов');
  $('reviews').closest('section').querySelector('.section-title').append(reviewSearch);
  const filterReviews=()=>{$('reviews').querySelectorAll('tr').forEach(tr=>tr.hidden=!tr.textContent.toLowerCase().includes(reviewSearch.value.toLowerCase()));};
  reviewSearch.oninput=filterReviews;
  function bindReviews() {
    filterReviews();
    $('reviews').querySelectorAll('[data-delete-review]').forEach(b => b.onclick = handle(async () => {
      const id=b.dataset.deleteReview; const reason=window.prompt('Причина удаления отзыва:'); if(!reason) return;
      const confirmation=window.prompt(`Введите DELETE REVIEW ${id}`); if(!confirmation) return;
      await guardedApi(`/admin/control/reviews/${id}`,{method:'DELETE',body:JSON.stringify({reason,confirmation})});
      await load();
    }));
  }
  new MutationObserver(bindReviews).observe($('reviews'), { childList:true });
  new MutationObserver(bindCatalog).observe($('globalCatalog'), { childList: true });
  new MutationObserver(bindStores).observe($('shops'), { childList: true });
  nav.querySelectorAll('button').forEach((b) => b.onclick = handle(() => navigate(b.dataset.pageButton)));
  $('controlFindUsers').onclick = handle(findUsers); $('supportReload').onclick = handle(inbox);
  for (const id of ['supportStatus','supportType','supportCategory','supportFrom','supportTo']) $(id).onchange = handle(inbox);
  $('supportSearch').onkeydown = (e) => { if (e.key === 'Enter') handle(inbox)(); };
  $('auditReload').onclick = handle(async () => { auditOffset = 0; await auditLog(); });
  $('auditMore').onclick = handle(async () => { auditOffset += 100; await auditLog(); });
  $('operationsReload').onclick = handle(operations); $('taxonomyReload').onclick = handle(loadTaxonomy);
  $('addCategory').onclick = handle(() => editTaxonomy('category')); $('addBrand').onclick = handle(() => editTaxonomy('brand'));
  // Reuse the existing connection form and core dashboard loader.
  for (const id of ['load','refresh']) $(id).onclick = handle(async () => { await load(); if (dashboard) await navigate(page); else clearPrivateState(); });
  main.querySelectorAll('[data-page]').forEach((s) => s.hidden = s.dataset.page !== page);
  nav.querySelector('[data-page-button="dashboard"]').classList.add('active');
  setInterval(async () => {
    if (page !== 'support' || pollBusy || document.hidden || (!$('adminKey').value && !adminSession)) return;
    pollBusy = true;
    try { await inbox(); if (selectedTicket && document.activeElement !== $('supportReply')) await conversation(); }
    catch (error) { setError(error.message); } finally { pollBusy = false; }
  }, 10000);
})();
