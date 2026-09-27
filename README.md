# MapMarket Dashboard

Отдельная простая админская панель для просмотра данных MapMarket из базы.

## Запуск

1. Запустите backend MapMarket из `C:\Users\User\Desktop\MapMarket\MapMarket\backend` с настроенными `DATABASE_URL` и `ADMIN_API_KEY`:

   ```powershell
   $env:ADMIN_API_KEY = 'ваш-длинный-ключ-минимум-32-символа'
   npm start
   ```

2. Укажите production backend в `runtime-config.js` через `PUBLIC_API_BASE_URL`.
3. Откройте [index.html](index.html), введите `ADMIN_API_KEY` и нажмите «Загрузить данные».

## Что отображается

- прогноз месячного дохода по активным тарифам;
- общее и активное число магазинов;
- количество товаров;
- общее количество QR-транзакций;
- распределение магазинов по `FREE`, `PRO`, `BUSINESS`, `BUSINESS_PLUS`;
- распределение магазинов и товаров по городам;
- таблица магазинов с тарифом, товарами и QR-сканами.

Данные не хранятся в браузере и не заменяются тестовыми значениями: каждый запрос идет в защищенный endpoint `/admin/dashboard` с заголовком `x-admin-key`.
