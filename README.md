# Notification Preferences Service

REST API-сервис управления предпочтениями уведомлений пользователей.  
Принимает решение — отправлять или блокировать уведомление — на основе глобальных политик, настроек пользователя и тихих часов.

## Стек

| Технология | Назначение |
|---|---|
| Node.js ≥ 18.18 + NestJS | HTTP-фреймворк |
| TypeScript | Язык |
| PostgreSQL 16 | База данных |
| Prisma ORM | Работа с БД, миграции |
| Luxon | Работа с датами и таймзонами |
| Jest | Юнит-тесты |

---

## Быстрый старт (Docker)

```bash
cp .env.example .env
docker-compose up --build
```

Сервис будет доступен на `http://localhost:3000`.  
При старте автоматически применяются миграции и заливаются seed-данные.

---

## Запуск локально

### Требования

- Node.js ≥ 18.18
- PostgreSQL 16

### 1. Установить зависимости

```bash
npm install
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env
```

| Переменная | Пример | Описание |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/notification_preferences` | Строка подключения к PostgreSQL |
| `PORT` | `3000` | Порт HTTP-сервера |

### 3. Применить миграции и сгенерировать Prisma-клиент

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Залить начальные данные

```bash
npm run prisma:seed
```

Создаёт дефолтные настройки уведомлений и глобальные политики (см. [Seed-данные](#seed-данные)).

### 5. Запустить сервис

```bash
# Dev-режим с hot reload
npm run start:dev

# Продакшн-сборка
npm run build && npm run start:prod
```

---

## Запуск тестов

```bash
# Все тесты
npm test

# С отчётом покрытия
npm run test:cov

# Watch-режим
npm run test:watch
```

Тесты — юнит-тесты с моками, база данных не нужна.

---

## API

Базовый URL: `http://localhost:3000`

### Допустимые значения полей

**`notificationType`**
```
transactional_email  marketing_email
transactional_sms    marketing_sms
transactional_push   marketing_push
transactional_messenger  marketing_messenger
```

**`channel`**
```
email  sms  push  messenger
```

**`region`**
```
EU  US  RU  GLOBAL
```

---

### GET `/users/:id/preferences`

Возвращает текущие предпочтения пользователя: мерж пользовательских настроек с дефолтами и конфиг тихих часов.

**Параметры пути**

| Параметр | Тип | Описание |
|---|---|---|
| `id` | string | Идентификатор пользователя |

**Коды ответа**

| Код | Описание |
|---|---|
| `200` | Успех |

**Пример запроса**

```bash
curl http://localhost:3000/users/user-1/preferences
```

**Пример ответа**

```json
{
  "userId": "user-1",
  "preferences": [
    {
      "notificationType": "transactional_email",
      "channel": "email",
      "enabled": true,
      "source": "default"
    },
    {
      "notificationType": "marketing_email",
      "channel": "email",
      "enabled": false,
      "source": "user"
    }
  ],
  "quietHours": {
    "startTime": "22:00",
    "endTime": "08:00",
    "timezone": "Europe/Moscow"
  }
}
```

Поле `source` показывает, откуда пришла настройка:
- `"default"` — от дефолтных настроек системы
- `"user"` — явно задано пользователем

Поле `quietHours` равно `null`, если тихие часы не настроены.

---

### POST `/users/:id/preferences`

Обновляет настройки пользователя. Идемпотентен — повторный вызов с теми же данными не меняет состояние.

**Параметры пути**

| Параметр | Тип | Описание |
|---|---|---|
| `id` | string | Идентификатор пользователя |

**Тело запроса** (`application/json`)

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `preferences` | array | Нет | Список изменяемых настроек |
| `preferences[].notificationType` | string | Да | Тип уведомления |
| `preferences[].channel` | string | Да | Канал доставки |
| `preferences[].enabled` | boolean | Да | Включить / выключить |
| `quietHours` | object \| null | Нет | Тихие часы (`null` — удалить) |
| `quietHours.startTime` | string | Да | Начало, формат `"HH:MM"` |
| `quietHours.endTime` | string | Да | Конец, формат `"HH:MM"` |
| `quietHours.timezone` | string | Да | IANA-таймзона, например `"Europe/Moscow"` |

**Коды ответа**

| Код | Описание |
|---|---|
| `200` | Успех, возвращает актуальные настройки (как GET) |
| `400` | Ошибка валидации тела запроса |

**Примеры запросов**

Отключить маркетинговые email и задать тихие часы:

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": [
      {
        "notificationType": "marketing_email",
        "channel": "email",
        "enabled": false
      }
    ],
    "quietHours": {
      "startTime": "22:00",
      "endTime": "08:00",
      "timezone": "Europe/Moscow"
    }
  }'
```

Удалить тихие часы (передать `null`):

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -d '{ "quietHours": null }'
```

Обновить только одну настройку:

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": [
      {
        "notificationType": "transactional_sms",
        "channel": "sms",
        "enabled": true
      }
    ]
  }'
```

---

### POST `/evaluate`

Проверяет, можно ли отправить уведомление конкретному пользователю прямо сейчас.

**Тело запроса** (`application/json`)

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `userId` | string | Да | Идентификатор пользователя |
| `notificationType` | string | Да | Тип уведомления |
| `channel` | string | Да | Канал доставки |
| `region` | string | Да | Регион отправки |
| `datetime` | string | Да | Время отправки в ISO 8601 (UTC) |

**Коды ответа**

| Код | Описание |
|---|---|
| `200` | Решение принято (в том числе `deny`) |
| `400` | Ошибка валидации тела запроса |

**Пример запроса**

```bash
curl -X POST http://localhost:3000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-1",
    "notificationType": "marketing_sms",
    "channel": "sms",
    "region": "EU",
    "datetime": "2026-05-21T21:30:00Z"
  }'
```

**Формат ответа**

```json
{
  "decision": "deny",
  "reason": "blocked_by_global_policy"
}
```

| Поле | Значения |
|---|---|
| `decision` | `"allow"` \| `"deny"` |
| `reason` | см. таблицу ниже |

**Возможные значения `reason`**

| reason | decision | Описание |
|---|---|---|
| `allowed` | `allow` | Уведомление разрешено |
| `blocked_by_global_policy` | `deny` | Запрещено глобальной политикой для данного региона |
| `user_disabled` | `deny` | Пользователь отключил этот тип уведомлений |
| `quiet_hours` | `deny` | Попадает в тихие часы пользователя (только для `marketing_*` типов) |

**Логика принятия решения (по порядку)**

1. **Глобальная политика** — проверяется пара `(notificationType, region)`. Если политика запрещает — `blocked_by_global_policy`, дальнейшие проверки не выполняются.
2. **Настройка пользователя** — если пользователь явно выключил тип → `user_disabled`. Если включил — переход к п.3.
3. **Дефолтная настройка** — если пользовательской настройки нет. Если дефолт выключен → `user_disabled`.
4. **Тихие часы** — только для `marketing_*` типов. Если текущее время (с учётом таймзоны пользователя) попадает в тихие часы → `quiet_hours`.

---

## Архитектура

```
src/
├── types/           — доменные типы (NotificationType, Channel, Region, ...)
├── prisma/          — PrismaService (глобальный модуль)
├── preferences/     — управление настройками пользователей
│   ├── dto/
│   ├── preferences.controller.ts
│   └── preferences.service.ts
├── evaluate/        — логика принятия решения об отправке
│   ├── dto/
│   ├── evaluate.controller.ts
│   └── evaluate.service.ts
├── app.module.ts
└── main.ts
```

---

## Seed-данные

После `npm run prisma:seed` в БД будут записаны:

**Дефолтные настройки уведомлений**

| notificationType | channel | enabled |
|---|---|---|
| `transactional_email` | `email` | `true` |
| `marketing_email` | `email` | `false` |
| `transactional_sms` | `sms` | `true` |
| `marketing_sms` | `sms` | `false` |
| `transactional_push` | `push` | `true` |
| `marketing_push` | `push` | `false` |
| `transactional_messenger` | `messenger` | `true` |
| `marketing_messenger` | `messenger` | `false` |

**Глобальные политики**

| notificationType | region | enabled |
|---|---|---|
| `marketing_sms` | `EU` | `false` |
| `marketing_messenger` | `EU` | `false` |

---

## Что добавить для продакшена

1. **Auth** — JWT-авторизация, проверка что пользователь меняет только свои настройки
2. **Pagination** — для GET `/users/:id/preferences` при большом числе типов
3. **Cache** — Redis-кеш для `/evaluate` (hot path), инвалидация при обновлении настроек
4. **Events** — domain events при изменении настроек (Kafka/RabbitMQ) для синхронизации с другими сервисами
5. **Metrics** — счётчики allow/deny по типам и регионам (Prometheus)
6. **Admin API** — CRUD для глобальных политик и дефолтных настроек
7. **Audit log** — история изменений настроек пользователя
8. **E2E тесты** — тесты с реальной тест-БД (testcontainers)
# task
