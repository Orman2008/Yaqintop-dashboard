const $ = (id) => document.getElementById(id);
let dashboard = null;
let notes = [];
let financeAdjustments = [];
let adjustmentsOpen = false;

const configuredApiBase = String(window.MAPMARKET_CONFIG?.PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
const labels = { FREE: 'FREE', PRO: 'PRO', BUSINESS: 'BUSINESS', BUSINESS_PLUS: 'BUSINESS PLUS' };
const money = (value) => `${Number(value || 0).toLocaleString('ru-RU')} сум`;
const esc = (value) => {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
};

function setError(message = '') { $('error').textContent = message; }

function connection() {
  const base = $('apiUrl').value.trim().replace(/\/$/, '');
  const key = $('adminKey').value.trim();
  if (!base || !key) throw new Error('Укажите URL backend и ADMIN_API_KEY.');
  return { base, key };
}

async function api(path, options = {}) {
  const { base, key } = connection();
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-admin-key': key,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Ошибка HTTP ${response.status}`);
  return data;
}

async function load() {
  setError('');
  $('status').textContent = 'Загрузка...';
  try {
    [dashboard, notes, financeAdjustments] = await Promise.all([
      api('/admin/dashboard'),
      api('/admin/notes'),
      api('/admin/finance-adjustments'),
    ]);
    render();
    $('status').textContent = `Обновлено: ${new Date().toLocaleString('ru-RU')}`;
  } catch (error) {
    dashboard = null;
    setError(`Не удалось загрузить данные: ${error.message}`);
    $('status').textContent = '';
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
  renderShops(dashboard.shops || []);
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

function renderBars(id, rows, label, value) {
  const max = Math.max(1, ...rows.map((row) => Number(row.shops_count || 0)));
  $(id).innerHTML = rows.length
    ? rows.map((row) => `<div class="bar"><span>${esc(label(row))}</span><span class="track"><span class="fill" style="width:${(row.shops_count / max) * 100}%"></span></span><b>${esc(value(row))}</b></div>`).join('')
    : '<div class="empty">Нет данных</div>';
}

function renderShops(rows) {
  const query = ($('search').value || '').trim().toLowerCase();
  const list = rows.filter((row) => `${row.name} ${row.city || ''} ${row.address || ''} ${row.plan || ''}`.toLowerCase().includes(query));
  $('shops').innerHTML = list.length
    ? list.map((row) => `<tr><td><strong>${esc(row.name)}</strong><br><small>${esc(row.owner_name || row.phone || '')}</small></td><td><strong>${esc(row.city || 'Не указан')}</strong><br><small>${esc(row.address || '')}</small></td><td><span class="badge">${labels[row.plan] || esc(row.plan)}</span></td><td>${row.product_count}</td><td>${row.qr_scans_count}</td><td>${esc(row.moderation_status || 'active')}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Магазины не найдены</td></tr>';
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
$('search').oninput = () => { if (dashboard) renderShops(dashboard.shops || []); };
['apiUrl', 'adminKey'].forEach((id) => $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') load(); }));
