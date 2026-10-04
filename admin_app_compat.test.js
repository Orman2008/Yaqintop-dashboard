'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const createDashboard = (responses) => {
  const fetchCalls = [];
  const ids = [
    'apiUrl', 'adminKey', 'load', 'refresh', 'addNote', 'adjustmentForm',
    'closeAdjustment', 'cancelAdjustment', 'search', 'planFilter', 'statusFilter',
    'status', 'error', 'metrics', 'plans', 'cities', 'categories', 'shops',
    'users', 'reports', 'globalCatalog', 'globalCatalogStatus',
    'globalCatalogSearch', 'globalCatalogStatusFilter', 'catalogMatches',
    'reviews', 'notes', 'adjustmentAmount',
    'adjustmentDescription', 'adjustmentDialog', 'noteText',
    'freeSubscriptionForm', 'freeSubscriptionDialog', 'grantShopName',
    'grantPlan', 'grantCode', 'grantSubscriptionSubmit', 'closeFreeSubscription',
    'cancelFreeSubscription', 'reviewStatus', 'loadMoreReviews',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    onclick: null,
    showModal() {},
    close() {},
    focus() {},
    addEventListener() {},
    remove() {},
    querySelectorAll() {return [];},
  }]));
  const context = {
    console,
    Date,
    Math,
    Number,
    String,
    Promise,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    window: {
      MAPMARKET_CONFIG: { PUBLIC_API_BASE_URL: 'https://api.example.test' },
      prompt: () => null,
      confirm: () => true,
    },
    document: {
      addEventListener() {},
    getElementById: (id) => elements[id] || (elements[id] = {
        value: '', textContent: '', innerHTML: '', disabled: false,
        onclick: null, showModal() {}, close() {}, focus() {}, addEventListener() {}, remove() {}, querySelectorAll() {return [];},
      }),
      querySelectorAll: () => [],
      createElement: () => ({ set textContent(value) { this._text = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }, get innerHTML() { return this._text || ''; } }),
    },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname + new URL(url).search;
      fetchCalls.push({ url, options });
      const result = responses[path] || { status: 404, body: { error: 'Маршрут API не найден.' } };
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        async json() { return result.body; },
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nwindow.testLoad = load; window.testApiOptional = apiOptional; window.testConnection = connection; window.testApi = api; window.testRenderReviews = renderReviews; window.testLoadMoreReviews = loadMoreReviews; window.testOpenGrant = openFreeSubscriptionDialog; window.testGrantSubscription = grantFreeSubscription;`, context);
  elements.adminKey.value = 'test-admin-key';
  vm.runInNewContext('window.testResolveReport = resolveReport; window.testModerateShop = moderateShop; window.testSetUserBlocked = setUserBlocked;', context);
  return { context, elements, responses, fetchCalls };
};

test('dashboard loads core data and clearly reports optional endpoints missing on old backend', async () => {
  const { context, elements } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
  });

  elements.globalCatalogStatusFilter.value = 'active';
  await context.window.testLoad();

  assert.equal(elements.error.textContent, '', `load failed: ${elements.error.textContent}`);

  assert.match(elements.status.textContent, /Backend не поддерживает/);
  assert.match(elements.reports.innerHTML, /обновите backend до версии с API модерации/i);
  assert.match(elements.catalogMatches.innerHTML, /обновите backend до версии с API каталога/i);
  assert.match(elements.metrics.innerHTML, /Ожидаемый MRR/);
});

test('optional endpoints only tolerate 404; auth and server errors still fail', async () => {
  const { context } = createDashboard({
    '/admin/moderation/queue?status=open': { status: 401, body: { error: 'Неверный ключ администратора.' } },
  });

  await assert.rejects(
    context.window.testApiOptional('/admin/moderation/queue?status=open', []),
    (error) => error.status === 401,
  );
});

test('failed reload clears data shown from the previous authorized session', async () => {
  const { context, elements, responses } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
  });
  await context.window.testLoad();
  assert.notEqual(elements.metrics.innerHTML, '');

  responses['/admin/dashboard'] = { status: 401, body: { error: 'Неверный ключ администратора.' } };
  await context.window.testLoad();

  assert.equal(elements.metrics.innerHTML, '');
  assert.equal(elements.notes.innerHTML, '');
  assert.match(elements.error.textContent, /Неверный ключ администратора/);
});

test('admin key cannot be sent to a remote HTTP backend', () => {
  const { context, elements } = createDashboard({});
  elements.apiUrl.value = 'http://api.example.test';
  assert.throws(
    () => context.window.testConnection(),
    /требуется HTTPS/,
  );

  elements.apiUrl.value = 'http://localhost:3000';
  assert.equal(context.window.testConnection().base, 'http://localhost:3000');
});

test('backend URL input is masked just like the administrator key', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /id="apiUrl" type="password"/);
  assert.match(html, /id="adminKey" type="password"/);
});

test('global catalog section loads real API data and exposes guarded merge', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /id="globalCatalog"/);
  assert.match(html, /Глобальный каталог/);
  const { context, elements } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
    '/admin/catalog/products?status=active&limit=200': {
      status: 200,
      body: { items: [{ id: 7, canonical_name: 'Coca-Cola', gtin: '00000001234565', status: 'active', offers_count: 2, stores_count: 2, created_at: '2026-10-01T00:00:00Z' }] },
    },
  });
  elements.globalCatalogStatusFilter.value = 'active';
  await context.window.testLoad();
  assert.match(elements.globalCatalog.innerHTML, /Coca-Cola/);
  assert.match(elements.globalCatalog.innerHTML, /data-global-merge="7"/);
});

test('reviews render store, author, product, rating, text and date', async () => {
  const { context, elements } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
    '/admin/reviews?limit=100&offset=0': { status: 200, body: { reviews: [{ id: 4, shop_id: 2, shop_name: 'I tech', author_id: 8, author_name: 'Ali', product_id: 3, product_name: 'Phone', rating: 5, text: '<great>', created_at: '2026-09-30T10:00:00Z' }], total_count: 1, has_more: false } },
  });
  await context.window.testLoad();
  assert.match(elements.reviews.innerHTML, /I tech/);
  assert.match(elements.reviews.innerHTML, /Ali/);
  assert.match(elements.reviews.innerHTML, /Phone/);
  assert.match(elements.reviews.innerHTML, /&lt;great&gt;/);
  assert.match(elements.reviews.innerHTML, /★★★★★/);
  assert.match(elements.reviewStatus.textContent, /1 из 1/);
});

test('reviews can be paged until every database record is displayed', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: 200 - index, shop_name: 'Shop', author_name: 'Buyer', product_name: `Product ${index}`, rating: 4, text: 'review' }));
  const { context, elements, fetchCalls } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
    '/admin/reviews?limit=100&offset=0': { status: 200, body: { reviews: firstPage, total_count: 101, has_more: true } },
    '/admin/reviews?limit=100&offset=100': { status: 200, body: { reviews: [{ id: 1, shop_name: 'Shop', author_name: 'Buyer', product_name: 'Last product', rating: 5, text: 'last review' }], total_count: 101, has_more: false } },
  });
  await context.window.testLoad();
  assert.equal(elements.loadMoreReviews.hidden, false);
  await context.window.testLoadMoreReviews();
  assert.match(elements.reviews.innerHTML, /Last product/);
  assert.match(elements.reviewStatus.textContent, /101 из 101/);
  assert.equal(elements.loadMoreReviews.hidden, true);
  assert.ok(fetchCalls.some((call) => new URL(call.url).search === '?limit=100&offset=100'));
});

test('the admin dashboard contains only one all-shops table', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.equal((html.match(/id="shops"/g) || []).length, 1);
  assert.equal((html.match(/id="search"/g) || []).length, 1);
  assert.equal((html.match(/id="planFilter"/g) || []).length, 1);
});

test('the subscription dialog visibly offers all tiers and requires explicit confirmation', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  for (const plan of ['PRO', 'BUSINESS', 'BUSINESS_PLUS']) {
    assert.match(html, new RegExp(`data-grant-choice="${plan}"`));
  }
  assert.match(html, /id="grantCode" type="password"/);
  assert.match(html, />Подтвердить<\/button>/);
});

test('shop tariff control opens the one-month grant panel and posts selected plan/code', async () => {
  const shop = { id: 17, name: 'I tech', city: 'Tashkent', plan: 'FREE', product_count: 2, qr_scans_count: 0, views_count: 0, clicks_count: 0, calls_count: 0, route_clicks_count: 0 };
  const { context, elements, fetchCalls } = createDashboard({
    '/admin/dashboard': { status: 200, body: { summary: {}, plans: [], cities: [], product_categories: [], shops: [shop] } },
    '/admin/notes': { status: 200, body: [] },
    '/admin/finance-adjustments': { status: 200, body: [] },
    '/admin/users': { status: 200, body: [] },
    '/admin/reviews': { status: 200, body: { reviews: [] } },
    '/admin/shops/17/free-subscription': { status: 200, body: { success: true, shop: { ...shop, name: 'I tech', plan_expires_at: '2026-10-30T00:00:00Z' } } },
  });
  await context.window.testLoad();
  assert.match(elements.shops.innerHTML, /data-grant-plan="17"/);
  context.window.testOpenGrant('17');
  assert.match(elements.grantShopName.textContent, /I tech/);
  elements.grantPlan.value = 'BUSINESS_PLUS';
  elements.grantCode.value = 'test-grant-code-1234';
  await context.window.testGrantSubscription({ preventDefault() {} });

  const grantRequest = fetchCalls.find((call) => new URL(call.url).pathname === '/admin/shops/17/free-subscription');
  assert.ok(grantRequest);
  assert.equal(grantRequest.options.method, 'POST');
  assert.deepEqual(JSON.parse(grantRequest.options.body), { plan: 'BUSINESS_PLUS', activation_code: 'test-grant-code-1234' });
  assert.match(elements.status.textContent, /выдан магазину/);
});

test('Admin API request timeout aborts the request with a retryable message', async () => {
  const start = source.indexOf('const ADMIN_API_TIMEOUT_MS = 15_000;');
  const functionStart = source.indexOf('async function api(path', start);
  const end = source.indexOf('async function apiOptional', functionStart);
  assert.ok(start >= 0 && functionStart > start && end > functionStart);
  const apiSource = `${source.slice(start, source.indexOf('\n', start))}\n${source.slice(functionStart, end)}`;
  const window = {};
  const context = {
    window,
    adminSession: null,
    connection: () => ({ base: 'https://api.example.test', key: 'test-key' }),
    AbortController,
    setTimeout: (callback) => { callback(); return 1; },
    clearTimeout() {},
    fetch: async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      throw new Error('aborted');
    },
  };
  vm.createContext(context);
  vm.runInContext(`${apiSource}\nwindow.testApi=api;`, context);
  await assert.rejects(context.window.testApi('/admin/dashboard'), /Backend не ответил за 15 секунд/);
});

test('dashboard load is single-flight and disables both load controls while pending', () => {
  assert.match(source, /if \(dashboardLoading\) return/);
  assert.match(source, /\$\('load'\)\.disabled = true/);
  assert.match(source, /\$\('refresh'\)\.disabled = true/);
  assert.match(source, /dashboardLoading = false/);
});

test('moderation decisions reject blank resolution notes before sending', async () => {
  const { context, elements, fetchCalls } = createDashboard({});
  context.window.prompt = () => '  ';

  await context.window.testResolveReport('42', 'dismiss');

  assert.match(elements.error.textContent, /минимум 3 символа/);
  assert.equal(fetchCalls.length, 0);
});

test('moderation decisions trim and send the resolution note required by backend', async () => {
  const { context, elements, fetchCalls } = createDashboard({
    '/admin/moderation/reports/42/action': { status: 200, body: { report: { id: 42 } } },
  });
  context.window.prompt = () => '  Проверено  ';

  await context.window.testResolveReport('42', 'dismiss');

  assert.equal(elements.error.textContent, '');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    action: 'dismiss',
    note: 'Проверено',
    confirmed: true,
  });
});

test('destructive moderation actions require an explicit confirmation', async () => {
  const { context, fetchCalls } = createDashboard({});
  context.window.prompt = () => 'Подтверждённое нарушение';
  context.window.confirm = () => false;

  await context.window.testResolveReport('42', 'remove_content');

  assert.equal(fetchCalls.length, 0);
});

test('shop blocking rejects short reasons before sending', async () => {
  const { context, elements, fetchCalls } = createDashboard({});
  context.window.prompt = () => ' x ';

  await context.window.testModerateShop('17', 'blocked', 'unverified');

  assert.match(elements.error.textContent, /причину решения.*3 символов/i);
  assert.equal(fetchCalls.length, 0);
});

test('user blocking rejects short reasons before sending', async () => {
  const { context, elements, fetchCalls } = createDashboard({});
  context.window.prompt = () => ' x ';

  await context.window.testSetUserBlocked({ id: 21, is_blocked: false });

  assert.match(elements.error.textContent, /причину блокировки.*3 символов/i);
  assert.equal(fetchCalls.length, 0);
});

test('global catalog exposes guarded original and canonical photo management', () => {
  assert.match(source, /data-photo-replace-original/);
  assert.match(source, /data-photo-replace-canonical/);
  assert.match(source, /restore_original/);
  assert.match(source, /\/photo-action/);
  assert.match(source, /x-admin-key/);
  assert.match(source, /body instanceof FormData/);
});
