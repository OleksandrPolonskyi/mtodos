# Moddyland Canvas Task Manager

Web + PWA застосунок для візуального керування задачами бізнесу на канвасі (аналог FigJam-стилю) з Supabase/Postgres.

## Stack

- Next.js (App Router) + TypeScript
- React Flow (canvas + dependency arrows)
- Tailwind CSS
- Supabase Postgres (через `postgres` драйвер)

## Основні можливості (MVP)

- Канвас блоків бізнесу з drag & drop
- CRUD блоків та soft archive
- Стрілки-залежності між блоками
- Сайдбар задач для вибраного блоку
- CRUD задач, пріоритети, дедлайни, чекліст
- Debounced автозбереження позицій (500мс)
- In-app reminders (`overdue` + `due within 24h`)
- Dashboard `/[workspace]/dashboard`
- Bootstrap пресету блоків при першому запуску
- PWA (`manifest`, `service worker`, icons)

## Швидкий старт

1. Встановити залежності:

```bash
npm install
```

2. Скопіювати конфіг:

```bash
cp .env.example .env.local
```

3. Заповнити `DATABASE_URL` на Supabase Postgres.

4. Застосувати SQL міграцію в Supabase SQL Editor:

- файл: `supabase/migrations/20260208_init_canvas_manager.sql`

5. Запустити локально:

```bash
npm run dev
```

6. Відкрити застосунок за секретним шляхом:

```text
http://localhost:3000/<APP_SECRET_PATH>
```

## API endpoints

- `GET /api/blocks`
- `POST /api/blocks`
- `PATCH /api/blocks/:id`
- `DELETE /api/blocks/:id`
- `POST /api/blocks/reposition`
- `GET /api/edges`
- `POST /api/edges`
- `DELETE /api/edges/:id`
- `GET /api/tasks?blockId=:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/reorder`
- `GET /api/dashboard/weekly`
- `POST /api/bootstrap`

Усі API-запити очікують заголовок `x-app-secret`.

## Безпека в межах MVP

- Немає auth у v1 (solo-first).
- Захист через unlisted URL + `x-app-secret` + `X-Robots-Tag: noindex`.
