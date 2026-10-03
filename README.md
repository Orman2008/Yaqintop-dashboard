# MapMarket Admin Panel

Операционный центр MapMarket на реальных данных backend и PostgreSQL: Dashboard, Stores, Users, Products, Search Intelligence, QR Deals, Moderation, Operations, Finance, Notes и Audit Log.

## Запуск

1. Запустите backend MapMarket из `C:\Users\User\Desktop\MapMarket\MapMarket\backend` с настроенными `DATABASE_URL` и `ADMIN_API_KEY`:

   ```powershell
   $env:ADMIN_API_KEY = 'ваш-длинный-ключ-минимум-32-символа'
   npm start
   ```

2. Укажите backend в `runtime-config.js` через `PUBLIC_API_BASE_URL`.
3. Для локальной проверки запустите `npm run build` и откройте `dist/index.html` через HTTP сервер.
4. Введите `ADMIN_API_KEY`. Панель обменяет его на часовую admin session, удалит исходный ключ из памяти интерфейса и будет отправлять session token в заголовке `Authorization: Bearer ...`.

## Правила данных

- Метрики, таблицы, карточки магазинов, воронки, Search Intelligence, ledger и задачи загружаются из API; фиктивных транзакций и чисел нет.
- Expected MRR рассчитывается только по активным тарифам и не смешивается с ручным Finance Ledger.
- Выданные администратором тарифы имеют источник `ADMIN/PILOT`, срок действия и запись в Audit Log. Платёжная интеграция отключена до подключения реального провайдера.
- Исторические поиски без сохранённого `results_count` или поисковой атрибуции показываются как неизвестные, а не как нули.

## Проверки

```powershell
npm run check
npm test
npm run build
```
