# TerraRun — итоги сессии (16.11.2026)

Проект: территориальная игра для бегунов (React + Vite + MapLibre), репозиторий `dimaklit/TerraRun`, деплой на GitHub Pages: https://dimaklit.github.io/TerraRun/

## 1. Neon: аутентификация и приватное хранение активностей

- Код интеграции (Better Auth + Data API через `@neon/neon-js`) дописан, протестирован и закоммичен (`10c1641`).
- Проект Neon: **TerraRun** (`dawn-paper-97073551`, branch `production`, AWS eu-west-2, база `neondb`).
- Включены Better Auth и Data API, применена миграция `neon/migrations/20261116000000_private_activities.sql` (таблица `private_activities` + RLS: пользователь видит и пишет только свои строки).
- Переменные:
  - локально: `.env.local` → `VITE_NEON_DATABASE_URL=https://ep-wandering-resonance-zamaapvp.c-2.eu-west-2.aws.neon.tech/neondb`
  - GitHub Actions variable: `VITE_NEON_DATABASE_URL` (то же значение).
- В Neon Auth добавлен доверенный домен `https://dimaklit.github.io` (localhost разрешён флагом Allow Localhost; `127.0.0.1` не работает).
- Pages пересобран с переменной — деплой успешен.

## 2. Тестирование на проде

- Один пользователь: `terrarun.test.copilot@example.com` — регистрация, импорт GeoJSON-петли (2.1 км, 0.281 км²), после перезагрузки маршрут подгружается из Neon («Private activity sync · Neon»).
- Три пользователя (`demo1..demo3.terrarun@example.com`, пароль `Demo-Pass-7391!`), у каждого по 3 маршрута:
  - сохранение: после выхода/входа все маршруты подгружаются;
  - изоляция: чужие маршруты не видны (RLS работает).
- Тестовые пользователи (4 шт.) и их данные **остались в базе** — при желании удалить через Neon Auth → Users и SQL Editor.

## 3. Интеграция с Garmin (код готов, ждёт ключей)

Выбран путь: заявка в **Garmin Connect Developer Program** (Activity API), бэкенд — **Cloudflare Workers**.

Закоммичено (`0cec414`):
- `worker/` — Cloudflare Worker: OAuth2+PKCE подключение Garmin, webhook приёма активностей, скачивание FIT, конвертация в GeoJSON, запись в БД. Эндпоинты: `/garmin/connect`, `/garmin/callback`, `/garmin/webhook`, `/garmin/deregister`, `/garmin/connection`. Dry-run сборка проходит; живая проверка невозможна без ключей.
- `neon/migrations/20261116010000_external_activities.sql` — таблицы `garmin_connections` (токены, браузеру недоступны) и `external_activities` (+RLS), view `garmin_link_status`. **Ещё не применена в Neon.**
- `src/utils/garmin.js` + правки `App.jsx` — кнопки Connect/Disconnect Garmin в меню аккаунта, автоимпорт новых активностей при входе. Меню скрыто, пока не задана `VITE_GARMIN_WORKER_URL`.
- Тесты: 32/32, сборка ОК.

### Шаги после одобрения заявки (см. `worker/README.md`)
1. Применить миграцию `20261116010000_external_activities.sql` в Neon SQL Editor.
2. `cd worker && npx wrangler login && wrangler secret put …` (DATABASE_URL, GARMIN_CLIENT_ID/SECRET, STATE_SECRET, WEBHOOK_SECRET) → `wrangler deploy`.
3. В `wrangler.toml` вписать `WORKER_URL` и `NEON_AUTH_JWKS_URL`.
4. В кабинете Garmin: redirect URI `<WORKER_URL>/garmin/callback`, webhooks `<WORKER_URL>/garmin/webhook?key=…` и `/garmin/deregister?key=…`.
5. Добавить `VITE_GARMIN_WORKER_URL` в GitHub Actions variables и `.env.local`.
6. Сверить эндпоинты Garmin OAuth/API с официальной документацией программы (написаны по памяти).

## 4. Заявка в Garmin и privacy policy

- Создана и опубликована страница **https://dimaklit.github.io/TerraRun/privacy.html** (`public/privacy.html`, коммит `775430c`), проверена — отвечает 200.
- Для формы Garmin (https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/):
  - Company Name: Dmitry Kliteynik
  - Company Website URL: `https://dimaklit.github.io/TerraRun/`
  - Privacy Policy URL: `https://dimaklit.github.io/TerraRun/privacy.html`
  - Primary business service: Health & Activity Insights; Industry: Fitness & Wellness
  - APIs: **Activity API**; Users (12 мес.): 0-100; Contact with Garmin: No
  - Готовые английские тексты для трёх больших полей (overview / business model / third parties) — в переписке; third parties: Neon (БД, AWS EU), Cloudflare Workers (бэкенд), GitHub Pages (только фронтенд), без аналитики и ИИ-провайдеров.
- **Форма ещё не отправлена** — отправка за пользователем.

## 5. Технические заметки

- Windows: использовать `npm.cmd` / `npx.cmd` (политика выполнения PowerShell блокирует `npm`).
- Git identity: `dimaklit <268390450+dimaklit@users.noreply.github.com>`.
- Коммиты этой сессии: `10c1641` (Neon auth) → `0cec414` (Garmin worker) → `775430c` (privacy page).
- Известные мелочи: главный JS-бандл ~1.5 МБ (Vite предупреждает, можно сделать code-splitting); кнопка «Create an account» на экране входа выглядит неоформленной; предупреждения MapLibre «Expected value to be of type number» безвредны.

## 6. Возможные следующие шаги

- Отправить форму Garmin и дождаться одобрения → деплой воркера.
- Удалить тестовых пользователей из Neon.
- Code review авторизации и RLS; code-splitting бандла; общие территории/серверные бои; стилизация кнопки регистрации; синхронизация Strava (бесплатный API) как альтернатива/дополнение.
