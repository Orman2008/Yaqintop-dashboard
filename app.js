const $ = (id) => document.getElementById(id);
let dashboard = null;
let notes = [];
let financeAdjustments = [];
let users = [];
let moderationReports = [];
let catalogMatches = [];
let globalCatalog = [];
let reviews = [];
let reviewTotal = 0;
let reviewsHaveMore = false;
let reviewLoadingMore = false;
let moderationAvailable = true;
let catalogMatchesAvailable = true;
let globalCatalogAvailable = true;
let reviewsAvailable = true;
let adjustmentsOpen = false;
let dashboardLoading = false;
let grantShopId = null;

const configuredApiBase = String(window.MAPMARKET_CONFIG?.PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
const ADMIN_API_TIMEOUT_MS = 15_000;
const labels = { FREE: 'FREE', PRO: 'PRO', BUSINESS: 'BUSINESS', BUSINESS_PLUS: 'BUSINESS PLUS' };
const money = (value) => `${Number(value || 0).toLocaleString('ru-RU')} сум`;
const mediaUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw, `${connection().base}/`).toString(); } catch { return ''; }
};
const esc = (value) => {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
};

function setError(message = '') { $('error').textContent = message; }

function clearDashboardData() {
  dashboard = null;
  notes = [];
  financeAdjustments = [];
  users = [];
  moderationReports = [];
  catalogMatches = [];
  globalCatalog = [];
  reviews = [];
  reviewTotal = 0;
  reviewsHaveMore = false;
  for (const id of ['metrics', 'plans', 'cities', 'categories', 'shops', 'users', 'reports', 'globalCatalog', 'catalogMatches', 'reviews', 'notes']) {
    $(id).innerHTML = '';
  }
  $('reviewStatus').textContent = '';
  $('loadMoreReviews').hidden = true;
}

function connection() {
  const base = $('apiUrl').value.trim().replace(/\/$/, '');
  const key = $('adminKey').value.trim();
  if (!base || !key) throw new Error('Укажите URL backend и ADMIN_API_KEY.');
  let parsed;
  try { parsed = new URL(base); } catch { throw new Error('Укажите корректный URL backend.'); }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHost)) {
    throw new Error('Для удалённого backend требуется HTTPS, чтобы защитить ADMIN_API_KEY.');
  }
  return { base, key };
}

async function api(path, options = {}) {
  const { base, key } = connection();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_API_TIMEOUT_MS);
  let response;
  try {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    response = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(!isFormData ? { 'content-type': 'application/json' } : {}),
        'x-admin-key': key,
        ...(options.headers || {}),
      },
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      const error = new Error('Backend не ответил за 15 секунд. Проверьте соединение и повторите загрузку.');
      error.code = 'ADMIN_API_TIMEOUT';
      throw error;
    }
    const error = new Error('Не удалось подключиться к backend. Проверьте URL и сетевое соединение.');
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function apiOptional(path, fallback) {
  try {
    return { available: true, value: await api(path) };
  } catch (error) {
    if (error.status === 404) return { available: false, value: fallback };
    throw error;
  }
}

async function load() {
  if (dashboardLoading) return;
  dashboardLoading = true;
  $('load').disabled = true;
  $('refresh').disabled = true;
  setError('');
  $('status').textContent = 'Загрузка...';
  try {
    const [core, moderation, catalog, globalCatalogResult, reviewResult] = await Promise.all([
      Promise.all([
        api('/admin/dashboard'),
        api('/admin/notes'),
        api('/admin/finance-adjustments'),
        api('/admin/users'),
      ]),
      apiOptional('/admin/moderation/queue?status=open', []),
      apiOptional('/admin/catalog/match-candidates?status=pending', []),
      apiOptional('/admin/catalog/products?status=active&limit=200', { items: [] }),
      apiOptional('/admin/reviews?limit=100&offset=0', { reviews: [], total_count: 0, has_more: false }),
    ]);
    [dashboard, notes, financeAdjustments, users] = core;
    moderationReports = moderation.value;
    moderationAvailable = moderation.available;
    catalogMatches = catalog.value;
    catalogMatchesAvailable = catalog.available;
    globalCatalogAvailable = globalCatalogResult.available;
    globalCatalog = Array.isArray(globalCatalogResult.value?.items) ? globalCatalogResult.value.items : [];
    reviewsAvailable = reviewResult.available;
    reviews = Array.isArray(reviewResult.value)
      ? reviewResult.value
      : Array.isArray(reviewResult.value?.reviews) ? reviewResult.value.reviews : [];
    reviewTotal = Number(reviewResult.value?.total_count ?? reviews.length) || 0;
    reviewsHaveMore = reviewResult.value?.has_more === true;
    render();
    const unavailable = [
      !moderationAvailable && 'модерация',
      !catalogMatchesAvailable && 'сопоставление каталога',
      !globalCatalogAvailable && 'глобальный каталог',
      !reviewsAvailable && 'отзывы',
    ].filter(Boolean);
    $('status').textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}${unavailable.length ? ` · Backend не поддерживает: ${unavailable.join(', ')}` : ''}`;
  } catch (error) {
    clearDashboardData();
    setError(`Не удалось загрузить данные: ${error.message}`);
    $('status').textContent = '';
  } finally {
    dashboardLoading = false;
    $('load').disabled = false;
    $('refresh').disabled = false;
  }
}

function metric(label, value, note) {
  return `<article class="panel metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function signedMoney(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString('ru-RU')} сум`;
}

function renderAdjustments() {
  if (!financeAdjustments.length) return '<div class="empty">Финансовых операций пока нет</div>';
  return financeAdjustments.map((item) => {
    const amount = Number(item.amount || 0);
    return `<article class="adjustment"><div><p>${esc(item.description)}</p><small>${new Date(item.created_at).toLocaleString('ru-RU')}</small></div><span class="adjustment-amount ${amount >= 0 ? 'positive' : 'negative'}">${signedMoney(amount)}</span><button class="danger" type="button" data-adjustment-id="${item.id}">Удалить</button></article>`;
  }).join('');
}

function renderMetrics() {
  const summary = dashboard.summary || {};
  const baseRevenue = Number(summary.projected_monthly_revenue || 0);
  const adjustmentsTotal = financeAdjustments.reduce((total, item) => total + Number(item.amount || 0), 0);
  const finalRevenue = baseRevenue + adjustmentsTotal;
  const adjustmentClass = adjustmentsTotal >= 0 ? 'positive' : 'negative';
  $('metrics').innerHTML = [
    `<article class="panel metric metric-revenue"><div class="revenue-main"><div class="revenue-value"><span>Доход в месяц</span><strong>${money(finalRevenue)}</strong><div class="revenue-summary"><small>Тарифы: ${money(baseRevenue)}</small><small>·</small><small class="${adjustmentClass}">Корректировки: ${signedMoney(adjustmentsTotal)}</small></div></div><div class="revenue-controls"><button id="addAdjustment" class="finance-button" type="button" title="Добавить доход или расход" aria-label="Добавить доход или расход">+</button><button id="toggleAdjustments" class="finance-button finance-toggle" type="button" title="Показать операции" aria-expanded="${adjustmentsOpen}">${adjustmentsOpen ? '⌃' : '⌄'}</button></div></div><div class="adjustments" ${adjustmentsOpen ? '' : 'hidden'}>${renderAdjustments()}</div></article>`,
    metric('Покупателей', summary.buyer_users_total, 'аккаунтов Buyer App'),
    metric('Магазинов', summary.shops_total, 'аккаунтов Seller App'),
    metric('Товаров', summary.products_total, 'во всех каталогах'),
    metric('QR использований', summary.qr_scans_total, 'всего транзакций'),
  ].join('');
  $('addAdjustment').onclick = openAdjustmentDialog;
  $('toggleAdjustments').onclick = () => {
    adjustmentsOpen = !adjustmentsOpen;
    renderMetrics();
  };
  document.querySelectorAll('[data-adjustment-id]').forEach((button) => {
    button.onclick = () => removeAdjustment(button.dataset.adjustmentId);
  });
}

function render() {
  renderMetrics();
  renderBars('plans', dashboard.plans || [], (row) => labels[row.plan] || row.plan, (row) => `${row.shops_count} магаз. · ${money(row.projected_revenue)}`);
  renderBars('cities', dashboard.cities || [], (row) => row.city, (row) => `${row.shops_count} магаз. · ${row.products_count} товаров`);
  renderBars('categories', dashboard.product_categories || [], (row) => row.category, (row) => `${row.products_count} товаров · ${row.shops_count} магаз.`, (row) => row.products_count);
  renderShops(dashboard.shops || []);
  renderUsers();
  renderReports();
  renderGlobalCatalog();
  renderCatalogMatches();
  renderReviews();
  renderNotes();
}

function openAdjustmentDialog() {
  $('adjustmentAmount').value = '';
  $('adjustmentDescription').value = '';
  $('adjustmentDialog').showModal();
  $('adjustmentAmount').focus();
}

function closeAdjustmentDialog() {
  $('adjustmentDialog').close();
}

async function addAdjustment(event) {
  event.preventDefault();
  const amount = $('adjustmentAmount').value.trim();
  const description = $('adjustmentDescription').value.trim();
  try {
    const item = await api('/admin/finance-adjustments', {
      method: 'POST',
      body: JSON.stringify({ amount, description }),
    });
    financeAdjustments.unshift(item);
    adjustmentsOpen = true;
    closeAdjustmentDialog();
    renderMetrics();
  } catch (error) {
    setError(`Не удалось добавить операцию: ${error.message}`);
  }
}

async function removeAdjustment(id) {
  if (!window.confirm('Удалить эту финансовую операцию? Итог будет пересчитан.')) return;
  try {
    await api(`/admin/finance-adjustments/${id}`, { method: 'DELETE' });
    financeAdjustments = financeAdjustments.filter((item) => String(item.id) !== String(id));
    renderMetrics();
  } catch (error) {
    setError(`Не удалось удалить операцию: ${error.message}`);
  }
}

function renderBars(id, rows, label, value, weight = (row) => row.shops_count) {
  const max = Math.max(1, ...rows.map((row) => Number(weight(row) || 0)));
  $(id).innerHTML = rows.length
    ? rows.map((row) => `<div class="bar"><span>${esc(label(row))}</span><span class="track"><span class="fill" style="width:${(Number(weight(row) || 0) / max) * 100}%"></span></span><b>${esc(value(row))}</b></div>`).join('')
    : '<div class="empty">Нет данных</div>';
}

function renderShops(rows) {
  const query = ($('search').value || '').trim().toLowerCase();
  const plan = $('planFilter').value;
  const status = $('statusFilter').value;
  const list = rows.filter((row) => {
    const matchesQuery = `${row.name} ${row.city || ''} ${row.address || ''} ${row.plan || ''} ${row.owner_name || ''} ${row.owner_phone || ''}`.toLowerCase().includes(query);
    const matchesPlan = !plan || String(row.plan || 'FREE').toUpperCase().replaceAll(' ', '_') === plan;
    const matchesStatus = !status || row.moderation_status === status || row.verification_status === status;
    return matchesQuery && matchesPlan && matchesStatus;
  });
  $('shops').innerHTML = list.length
    ? list.map((row) => {
      const hasCoordinates = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
      const mapLink = hasCoordinates ? `<br><a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(row.latitude)}&mlon=${encodeURIComponent(row.longitude)}#map=17/${encodeURIComponent(row.latitude)}/${encodeURIComponent(row.longitude)}" target="_blank" rel="noopener">${esc(row.latitude)}, ${esc(row.longitude)} ↗</a>` : '<br><small>Координаты не указаны</small>';
      const activity = row.last_activity_at ? new Date(row.last_activity_at).toLocaleString('ru-RU') : 'Нет активности';
      const subscription = row.plan_expires_at ? `до ${new Date(row.plan_expires_at).toLocaleDateString('ru-RU')}` : 'без даты окончания';
      return `<tr><td><strong>${esc(row.name)}</strong><br><small>${esc(row.owner_name || '')} · ${esc(row.owner_phone || row.phone || '')}</small></td><td><strong>${esc(row.city || 'Не указан')}</strong><br><small>${esc(row.address || '')}</small>${mapLink}</td><td><button class="badge plan-action" type="button" data-grant-plan="${row.id}" title="Выдать бесплатный тариф на месяц">${labels[row.plan] || esc(row.plan)}</button><br><small>${subscription}</small></td><td>${row.product_count}</td><td>${row.qr_scans_count}</td><td><small>Просмотры: ${row.views_count}<br>Клики: ${row.clicks_count}<br>Звонки: ${row.calls_count}<br>Маршруты: ${row.route_clicks_count}<br>Последняя: ${activity}</small></td><td><span class="${row.verification_status === 'verified' ? 'status-ok' : row.verification_status === 'rejected' ? 'status-bad' : ''}">${esc(row.verification_status || 'unverified')}</span><br><small>${esc(row.moderation_status || 'active')}</small></td><td><div class="actions"><button class="action approve" data-shop-approve="${row.id}">Проверен</button><button class="action warn" data-shop-reject="${row.id}">Отклонить</button><button class="danger" data-shop-block="${row.id}">${row.moderation_status === 'blocked' ? 'Разблокировать' : 'Блокировать'}</button></div></td></tr>`;
    }).join('')
    : '<tr><td colspan="8" class="empty">Магазины не найдены</td></tr>';
  document.querySelectorAll('[data-shop-approve]').forEach((button) => { button.onclick = () => moderateShop(button.dataset.shopApprove, 'active', 'verified'); });
  document.querySelectorAll('[data-shop-reject]').forEach((button) => { button.onclick = () => moderateShop(button.dataset.shopReject, 'active', 'rejected'); });
  document.querySelectorAll('[data-shop-block]').forEach((button) => {
    const shop = rows.find((item) => String(item.id) === String(button.dataset.shopBlock));
    button.onclick = () => moderateShop(button.dataset.shopBlock, shop?.moderation_status === 'blocked' ? 'active' : 'blocked', shop?.verification_status || 'unverified');
  });
  document.querySelectorAll('[data-grant-plan]').forEach((button) => {
    button.onclick = () => openFreeSubscriptionDialog(button.dataset.grantPlan);
  });
}

function renderReviews() {
  $('reviewStatus').textContent = reviewsAvailable
    ? `Показано ${reviews.length} из ${reviewTotal} отзывов из базы данных`
    : 'Отзывы недоступны: обновите backend, чтобы подключить API отзывов.';
  $('loadMoreReviews').hidden = !reviewsAvailable || !reviewsHaveMore;
  $('loadMoreReviews').disabled = reviewLoadingMore;
  $('loadMoreReviews').textContent = reviewLoadingMore ? 'Загрузка…' : 'Показать ещё';
  $('reviews').innerHTML = !reviewsAvailable
    ? '<tr><td colspan="6" class="empty">Backend пока отвечает 404 на API отзывов. Опубликуйте обновление backend.</td></tr>'
    : reviews.length
    ? reviews.map((review) => `<tr><td><strong>${esc(review.shop_name)}</strong><br><small>#${esc(review.shop_id)}</small></td><td>${esc(review.author_name || 'Покупатель')}<br><small>#${esc(review.author_id)}</small></td><td>${esc(review.product_name)}<br><small>#${esc(review.product_id)}</small></td><td><span class="review-rating">${'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, Number(review.rating) || 0)))}</span></td><td class="review-text">${esc(review.text || 'Без текста')}</td><td>${new Date(review.updated_at || review.created_at).toLocaleString('ru-RU')}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Отзывов пока нет</td></tr>';
}

async function loadMoreReviews() {
  if (!reviewsAvailable || !reviewsHaveMore || reviewLoadingMore) return;
  reviewLoadingMore = true;
  renderReviews();
  try {
    const page = await api(`/admin/reviews?limit=100&offset=${reviews.length}`);
    reviews = reviews.concat(Array.isArray(page.reviews) ? page.reviews : []);
    reviewTotal = Number(page.total_count ?? reviewTotal) || 0;
    reviewsHaveMore = page.has_more === true;
    renderReviews();
  } catch (error) {
    setError(`Не удалось загрузить следующие отзывы: ${error.message}`);
  } finally {
    reviewLoadingMore = false;
    renderReviews();
  }
}

function openFreeSubscriptionDialog(id) {
  const shop = dashboard?.shops?.find((item) => String(item.id) === String(id));
  if (!shop) return;
  grantShopId = String(id);
  $('grantShopName').textContent = `${shop.name} · тариф ${labels[shop.plan] || shop.plan || 'FREE'}`;
  selectGrantPlan('');
  $('grantCode').value = '';
  $('freeSubscriptionDialog').showModal();
}

function selectGrantPlan(plan) {
  const allowed = ['PRO', 'BUSINESS', 'BUSINESS_PLUS'];
  $('grantPlan').value = allowed.includes(plan) ? plan : '';
  document.querySelectorAll('[data-grant-choice]').forEach((button) => {
    const selected = button.dataset.grantChoice === $('grantPlan').value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function closeFreeSubscriptionDialog() {
  $('freeSubscriptionDialog').close();
  $('grantCode').value = '';
  grantShopId = null;
}

async function grantFreeSubscription(event) {
  event.preventDefault();
  if (!grantShopId) return;
  const submit = $('grantSubscriptionSubmit');
  const plan = $('grantPlan').value;
  const activationCode = $('grantCode').value;
  if (!plan) {
    setError('Сначала выберите PRO, BUSINESS или BUSINESS PLUS.');
    return;
  }
  submit.disabled = true;
  setError('');
  try {
    const result = await api(`/admin/shops/${grantShopId}/free-subscription`, {
      method: 'POST',
      body: JSON.stringify({ plan, activation_code: activationCode }),
    });
    const shopName = result.shop?.name || $('grantShopName').textContent;
    const expiresAt = result.shop?.plan_expires_at
      ? new Date(result.shop.plan_expires_at).toLocaleDateString('ru-RU')
      : '';
    closeFreeSubscriptionDialog();
    await load();
    if (!dashboard) return;
    $('status').textContent = `${labels[plan] || plan} выдан магазину «${shopName}» бесплатно${expiresAt ? ` до ${expiresAt}` : ''}.`;
  } catch (error) {
    const message = error.status === 404
      ? 'Production backend ещё не обновлён: опубликуйте серверный маршрут выдачи тарифа и повторите попытку.'
      : error.message;
    setError(`Не удалось выдать тариф: ${message}`);
  } finally {
    submit.disabled = false;
  }
}

async function moderateShop(id, status, verificationStatus) {
  const needsReason = status === 'blocked' || verificationStatus === 'rejected';
  let reason = 'Ручная проверка администратором';
  if (needsReason) {
    const input = window.prompt('Укажите причину решения:');
    if (input === null) return;
    reason = String(input).trim();
    if (reason.length < 3) {
      setError('Укажите причину решения длиной не менее 3 символов.');
      return;
    }
  }
  try {
    await api(`/admin/shops/${id}/moderation`, { method: 'PATCH', body: JSON.stringify({ status, verification_status: verificationStatus, reason }) });
    await load();
  } catch (error) { setError(`Не удалось изменить статус магазина: ${error.message}`); }
}

function renderUsers() {
  $('users').innerHTML = users.length
    ? users.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.phone)}</td><td>${esc(user.role)}</td><td class="${user.is_blocked ? 'status-bad' : 'status-ok'}">${user.is_blocked ? 'blocked' : 'active'}</td><td><button class="${user.is_blocked ? 'action' : 'danger'}" data-user-block="${user.id}">${user.is_blocked ? 'Разблокировать' : 'Блокировать'}</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Пользователей нет</td></tr>';
  document.querySelectorAll('[data-user-block]').forEach((button) => {
    const user = users.find((item) => String(item.id) === String(button.dataset.userBlock));
    button.onclick = () => setUserBlocked(user);
  });
}

async function setUserBlocked(user) {
  const blocked = !user.is_blocked;
  let reason = 'Разблокирован администратором';
  if (blocked) {
    const input = window.prompt('Укажите причину блокировки:');
    if (input === null) return;
    reason = String(input).trim();
    if (reason.length < 3) {
      setError('Укажите причину блокировки длиной не менее 3 символов.');
      return;
    }
  }
  try {
    await api(`/admin/users/${user.id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked, reason }) });
    await load();
  } catch (error) { setError(`Не удалось изменить статус пользователя: ${error.message}`); }
}

function renderReports() {
  $('reports').innerHTML = !moderationAvailable
    ? '<tr><td colspan="5" class="empty">Раздел недоступен: обновите backend до версии с API модерации.</td></tr>'
    : moderationReports.length
    ? moderationReports.map((report) => `<tr><td>${esc(report.entity_type)} #${report.entity_id}</td><td>${esc(report.reason)}</td><td>${esc(report.details || '—')}</td><td>${new Date(report.created_at).toLocaleString('ru-RU')}</td><td><div class="actions"><button class="action" data-report-dismiss="${report.id}">Отклонить</button><button class="action warn" data-report-remove="${report.id}">Удалить контент</button><button class="danger" data-report-restrict="${report.id}">Ограничить аккаунт</button></div></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Открытых жалоб нет</td></tr>';
  document.querySelectorAll('[data-report-dismiss]').forEach((button) => { button.onclick = () => resolveReport(button.dataset.reportDismiss, 'dismiss'); });
  document.querySelectorAll('[data-report-remove]').forEach((button) => { button.onclick = () => resolveReport(button.dataset.reportRemove, 'remove_content'); });
  document.querySelectorAll('[data-report-restrict]').forEach((button) => { button.onclick = () => resolveReport(button.dataset.reportRestrict, 'restrict_account'); });
}

function renderGlobalCatalog() {
  const target = $('globalCatalog');
  if (!target) return;
  const query = ($('globalCatalogSearch')?.value || '').trim().toLowerCase();
  const status = $('globalCatalogStatusFilter')?.value || 'active';
  const rows = globalCatalog.filter((item) => {
    const haystack = `${item.canonical_name || ''} ${item.brand || ''} ${item.gtin || ''} ${item.category || ''}`.toLowerCase();
    return (!query || haystack.includes(query)) && (status === 'all' || item.status === status);
  });
  $('globalCatalogStatus').textContent = !globalCatalogAvailable
    ? 'Backend ещё не поддерживает Global Catalog API'
    : `${rows.length} из ${globalCatalog.length} товаров`;
  target.innerHTML = !globalCatalogAvailable
    ? '<tr><td colspan="8" class="empty">Раздел недоступен: опубликуйте backend с Global Catalog API.</td></tr>'
    : rows.length
      ? rows.map((item) => {
        const canonicalSource = mediaUrl(item.canonical_image_url);
        const originalSource = mediaUrl(item.original_image_url);
        const photo = `<div class="catalog-photo-pair"><span><small>Canonical</small>${canonicalSource
          ? `<img class="catalog-photo" src="${esc(canonicalSource)}" alt="Canonical" loading="lazy" referrerpolicy="no-referrer">`
          : '<span class="catalog-photo catalog-photo-empty">Нет</span>'}</span><span><small>Original</small>${originalSource
          ? `<img class="catalog-photo" src="${esc(originalSource)}" alt="Original" loading="lazy" referrerpolicy="no-referrer">`
          : '<span class="catalog-photo catalog-photo-empty">Нет</span>'}</span></div>`;
        const canMerge = item.status === 'active';
        return `<tr><td>${photo}</td><td class="catalog-product"><strong>${esc(item.canonical_name)}</strong><br><small>#${esc(item.id)} · создан ${new Date(item.created_at).toLocaleDateString('ru-RU')}</small></td><td>${esc(item.gtin || 'Без GTIN')}</td><td>${esc(item.brand || '—')}</td><td>${esc(item.category || '—')}</td><td>${esc(item.stores_count || 0)}<br><small>${esc(item.offers_count || 0)} предложений</small></td><td><span class="status-pill ${esc(item.status)}">${esc(item.status)}</span><br><small>${esc(item.image_processing_status || 'not_requested')}</small></td><td><div class="catalog-actions">${canMerge ? `<button class="action" data-photo-replace-original="${item.id}">Replace original</button><button class="action" data-photo-replace-canonical="${item.id}">Replace canonical</button><button class="action" data-photo-reprocess="${item.id}">Reprocess</button><button class="action" data-photo-action="restore_original:${item.id}">Restore Original</button><button class="action approve" data-photo-action="approve:${item.id}">Approve</button><button class="action warn" data-photo-action="reject:${item.id}">Reject</button><button class="action warn" data-global-merge="${item.id}">Объединить</button>` : ''}</div></td></tr>`;
      }).join('')
      : '<tr><td colspan="8" class="empty">Товары не найдены</td></tr>';
  document.querySelectorAll('[data-global-merge]').forEach((button) => {
    button.onclick = () => mergeGlobalProduct(button.dataset.globalMerge);
  });
  document.querySelectorAll('[data-photo-replace-original]').forEach((button) => {
    button.onclick = () => replaceGlobalProductPhoto(button.dataset.photoReplaceOriginal, 'original');
  });
  document.querySelectorAll('[data-photo-replace-canonical]').forEach((button) => {
    button.onclick = () => replaceGlobalProductPhoto(button.dataset.photoReplaceCanonical, 'canonical');
  });
  document.querySelectorAll('[data-photo-reprocess]').forEach((button) => {
    button.onclick = () => replaceGlobalProductPhoto(button.dataset.photoReprocess, 'canonical', 'Повторная on-device обработка');
  });
  document.querySelectorAll('[data-photo-action]').forEach((button) => {
    const [action, id] = button.dataset.photoAction.split(':');
    button.onclick = () => globalProductPhotoAction(id, action);
  });
}

function selectImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

async function replaceGlobalProductPhoto(id, kind, presetReason = '') {
  const file = await selectImageFile();
  if (!file) return;
  const reason = presetReason || String(window.prompt('Причина замены фото:') || '').trim();
  if (reason.length < 3) return setError('Укажите причину замены фото.');
  const body = new FormData();
  body.append(kind, file, file.name);
  body.append('reason', reason);
  try {
    await api(`/admin/catalog/products/${id}/photos`, { method: 'POST', body });
    await reloadGlobalCatalog();
  } catch (error) { setError(`Не удалось заменить фото: ${error.message}`); }
}

async function globalProductPhotoAction(id, action) {
  const needsReason = action === 'reject' || action === 'reprocess';
  const reason = needsReason ? String(window.prompt('Укажите причину:') || '').trim() : '';
  if (needsReason && reason.length < 3) return setError('Укажите причину действия.');
  if (!window.confirm(`Выполнить действие ${action} для товара #${id}?`)) return;
  try {
    await api(`/admin/catalog/products/${id}/photo-action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
    await reloadGlobalCatalog();
  } catch (error) { setError(`Не удалось изменить фото: ${error.message}`); }
}

async function reloadGlobalCatalog() {
  if (!globalCatalogAvailable) return;
  const status = $('globalCatalogStatusFilter')?.value || 'active';
  const query = ($('globalCatalogSearch')?.value || '').trim();
  try {
    const result = await api(`/admin/catalog/products?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&limit=200`);
    globalCatalog = Array.isArray(result.items) ? result.items : [];
    renderGlobalCatalog();
  } catch (error) {
    setError(`Не удалось загрузить глобальный каталог: ${error.message}`);
  }
}

async function mergeGlobalProduct(sourceId) {
  const targetId = String(window.prompt('ID товара, который нужно оставить основным:') || '').trim();
  if (!/^\d+$/.test(targetId) || targetId === String(sourceId)) {
    setError('Укажите другой корректный ID основного товара.');
    return;
  }
  const reason = String(window.prompt('Причина объединения (обязательно):') || '').trim();
  if (reason.length < 3) {
    setError('Укажите причину объединения длиной не менее 3 символов.');
    return;
  }
  if (!window.confirm(`Объединить товар #${sourceId} с #${targetId}? Предложения магазинов будут перенесены. Отменить это действие автоматически нельзя.`)) return;
  try {
    await api(`/admin/catalog/products/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ target_id: Number(targetId), reason }),
    });
    await reloadGlobalCatalog();
    $('status').textContent = `Товар #${sourceId} объединён с #${targetId}.`;
  } catch (error) {
    setError(`Не удалось объединить товары: ${error.message}`);
  }
}

async function resolveReport(id, action) {
  const note = String(window.prompt('Комментарий к решению:') || '').trim();
  if (note.length < 3) {
    setError('Добавьте комментарий к решению (минимум 3 символа).');
    return;
  }
  if (action !== 'dismiss' && !window.confirm('Это действие изменит контент или доступ пользователя. Продолжить?')) return;
  try {
    await api(`/admin/moderation/reports/${id}/action`, { method: 'POST', body: JSON.stringify({ action, note }) });
    moderationReports = moderationReports.filter((item) => String(item.id) !== String(id));
    renderReports();
  } catch (error) { setError(`Не удалось обработать жалобу: ${error.message}`); }
}

function renderCatalogMatches() {
  $('catalogMatches').innerHTML = !catalogMatchesAvailable
    ? '<tr><td colspan="5" class="empty">Раздел недоступен: обновите backend до версии с API каталога.</td></tr>'
    : catalogMatches.length
    ? catalogMatches.map((item) => `<tr><td><strong>${esc(item.product_title)}</strong><br><small>${esc([item.product_brand, item.product_model].filter(Boolean).join(' ') || 'Без бренда/модели')}</small></td><td><strong>${esc(item.candidate_name)}</strong><br><small>${esc([item.candidate_brand, item.candidate_model].filter(Boolean).join(' ') || 'Без бренда/модели')}</small></td><td>${Math.round(Number(item.confidence || 0) * 100)}%<br><small>${esc(item.match_method)}</small></td><td>${esc(item.shop_name)}</td><td><div class="actions"><button class="action approve" data-match-confirm="${item.id}">Объединить</button><button class="action warn" data-match-reject="${item.id}">Не совпадает</button></div></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Кандидатов для ручной проверки нет</td></tr>';
  document.querySelectorAll('[data-match-confirm]').forEach((button) => { button.onclick = () => decideCatalogMatch(button.dataset.matchConfirm, 'confirm'); });
  document.querySelectorAll('[data-match-reject]').forEach((button) => { button.onclick = () => decideCatalogMatch(button.dataset.matchReject, 'reject'); });
}

async function decideCatalogMatch(id, decision) {
  const promptText = decision === 'confirm'
    ? 'Подтвердить, что это один и тот же товар? Добавьте комментарий при необходимости:'
    : 'Почему товары не совпадают?';
  const reason = window.prompt(promptText, '') ?? null;
  if (reason === null) return;
  try {
    await api(`/admin/catalog/match-candidates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reason }),
    });
    catalogMatches = catalogMatches.filter((item) => String(item.id) !== String(id));
    renderCatalogMatches();
  } catch (error) {
    setError(`Не удалось сохранить сопоставление: ${error.message}`);
  }
}

function renderNotes() {
  $('notes').innerHTML = notes.length
    ? notes.map((note) => `<article class="note"><div><p>${esc(note.body)}</p><small>${new Date(note.created_at).toLocaleString('ru-RU')}</small></div><button class="danger" type="button" data-note-id="${note.id}">Удалить</button></article>`).join('')
    : '<div class="empty">Заметок пока нет</div>';
  document.querySelectorAll('[data-note-id]').forEach((button) => {
    button.onclick = () => removeNote(button.dataset.noteId);
  });
}

async function addNote() {
  const body = $('noteText').value.trim();
  if (!body) return;
  try {
    const note = await api('/admin/notes', { method: 'POST', body: JSON.stringify({ body }) });
    notes.unshift(note);
    $('noteText').value = '';
    renderNotes();
  } catch (error) {
    setError(`Не удалось сохранить заметку: ${error.message}`);
  }
}

async function removeNote(id) {
  if (!window.confirm('Удалить эту заметку?')) return;
  try {
    await api(`/admin/notes/${id}`, { method: 'DELETE' });
    notes = notes.filter((note) => String(note.id) !== String(id));
    renderNotes();
  } catch (error) {
    setError(`Не удалось удалить заметку: ${error.message}`);
  }
}

$('apiUrl').value = configuredApiBase;
$('load').onclick = load;
$('refresh').onclick = load;
$('addNote').onclick = addNote;
$('adjustmentForm').onsubmit = addAdjustment;
$('closeAdjustment').onclick = closeAdjustmentDialog;
$('cancelAdjustment').onclick = closeAdjustmentDialog;
$('freeSubscriptionForm').onsubmit = grantFreeSubscription;
$('closeFreeSubscription').onclick = closeFreeSubscriptionDialog;
$('cancelFreeSubscription').onclick = closeFreeSubscriptionDialog;
$('loadMoreReviews').onclick = loadMoreReviews;
document.querySelectorAll('[data-grant-choice]').forEach((button) => {
  button.onclick = () => selectGrantPlan(button.dataset.grantChoice);
});
$('search').oninput = () => { if (dashboard) renderShops(dashboard.shops || []); };
['planFilter', 'statusFilter'].forEach((id) => $(id).onchange = () => { if (dashboard) renderShops(dashboard.shops || []); });
$('globalCatalogSearch').oninput = () => renderGlobalCatalog();
$('globalCatalogStatusFilter').onchange = reloadGlobalCatalog;
['apiUrl', 'adminKey'].forEach((id) => $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') load(); }));
