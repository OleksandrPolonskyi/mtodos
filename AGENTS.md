# AGENTS.md — MTodo Native iOS Delivery Playbook

## 1) Мета

Побудувати native iOS застосунок для MTodo (SwiftUI), який:
- зберігає функціональний паритет із поточним web/PWA (крім canvas на першій ітерації),
- використовує Liquid Glass стиль там, де це доречно,
- має стабільний CI/CD і передбачуваний релізний процес,
- вимагає мінімального втручання власника продукту.

## 2) Зафіксовані рішення

- Платформа: тільки iOS.
- Мінімальна версія iOS: 26+.
- Підхід до коду: окремий git-репозиторій `mtodo-ios-native`.

## 3) Рекомендований підхід до репозиторію

Рішення: окремий git-репозиторій `mtodo-ios-native`.

Причини:
- окремий життєвий цикл iOS (Xcode, provisioning, TestFlight, App Store),
- чистий CI без змішування Node/Swift пайплайнів,
- простіше керувати релізами і rollback.

Джерело правди бекенду залишається в поточному репо (`MTodo`), iOS-клієнт працює через існуючі API і синхронізується через Supabase/Postgres.

## 4) Продуктовий scope (Phase 1)

In-scope:
- Workspaces
- Blocks list view (без canvas drag-and-drop)
- Tasks CRUD
- Task dependencies
- Status/Priority/Ownership
- Due dates + reminders summary
- Dashboard weekly metrics
- Theme + Liquid Glass UI

Out-of-scope на Phase 1:
- Canvas board, canvas layout editor, складні canvas-анімації
- Будь-які фічі, що потребують iPad-first gesture engine

## 5) Технічний стек (native)

- Swift 6+
- SwiftUI
- Architecture: MVVM + Coordinators (або feature modules)
- Async/await + URLSession
- Локальне збереження: SwiftData (кеш + offline queue)
- Тести: XCTest + XCUITest
- Лінт/формат: SwiftLint + SwiftFormat
- CI: GitHub Actions + Fastlane

Liquid Glass:
- Використовувати нативні iOS 26+ glass API як основний стиль.
- Fallback для iOS < 26 не проєктується (поза scope).

## 6) Архітектурні правила

1. Domain-first: моделі MTodo у `Domain`, UI не містить бізнес-правил.
2. API contract strict: клієнт працює тільки через typed DTO + mapper.
3. Без "stringly-typed" ключів/статусів у View.
4. Error handling уніфікований (network, auth header, timeout, decoding).
5. Один network layer для всіх фіч.
6. Feature flags для ризикових змін UI/нових flow.
7. Кожен PR має тест або аргументований reason, чому тест неможливий.

## 7) Контракт з бекендом (критично)

Поточні API в web-репо:
- `/api/blocks`
- `/api/edges`
- `/api/tasks`
- `/api/dashboard/weekly`
- `/api/bootstrap`

Усі запити мають передавати `x-app-secret`.

Правила:
- до старту розробки зафіксувати API-специфікацію (OpenAPI або markdown-contract),
- versioning: будь-яка несумісна зміна API = нова версія контракту,
- CI перевіряє, що iOS DTO сумісні з контрактом.

Схема синхронізації (v1):
- write path: iOS -> Next API -> Supabase/Postgres,
- read path: iOS <- Next API + Realtime updates із Supabase,
- offline: локальна черга змін у SwiftData з повторною відправкою при відновленні мережі.

## 8) Етапи робіт і коли тестуємо

### Phase 0 — Discovery та дизайн контракту

Задачі:
- зафіксувати parity matrix (web feature -> iOS screen/use-case),
- затвердити navigation map,
- заморозити API contract v1.

Тести:
- contract smoke tests проти staging API,
- перевірка auth header (`x-app-secret`) на всіх endpoint.

Gate:
- без green contract tests в Phase 1 не переходимо.

### Phase 1 — Foundation

Задачі:
- створення iOS app shell,
- network client, DTO, mappers, error model,
- базова навігація, dependency injection, logging.

Тести:
- unit тести mapper/decoder/validation,
- unit тести use-case рівня,
- integration тести network layer на mocked responses.

Gate:
- `swift build` + unit tests green у CI.

### Phase 2 — Feature migration (паритет)

Задачі:
- blocks/tasks/dependencies/dashboard,
- редагування задач, дедлайни, фільтри, reminders summary.

Тести:
- per-feature unit tests,
- integration tests для CRUD сценаріїв,
- XCUITest для ключових user journeys:
  - create task,
  - edit status/priority,
  - complete task,
  - dependency flow,
  - dashboard open.

Gate:
- critical journeys green на симуляторі iPhone.

### Phase 3 — Liquid Glass polish + performance

Задачі:
- glass surfaces, cards, buttons, transitions.

Тести:
- snapshot tests для світлої/темної теми,
- accessibility tests (Dynamic Type, VoiceOver labels, contrast),
- performance baseline tests (launch time, scroll FPS, memory).

Gate:
- жодного high-severity accessibility дефекту,
- performance regression <= 10% до baseline.

### Phase 4 — Release candidate

Задачі:
- TestFlight build,
- crash/analytics baseline,
- фінальна перевірка чекліста релізу.

Тести:
- full regression suite,
- ручний smoke на реальному пристрої,
- network resilience (offline/slow network).

Gate:
- release checklist 100%,
- 0 blocker bugs,
- TestFlight sign-off.

## 9) CI/CD policy

PR pipeline (обовʼязковий):
- lint + format check
- compile check
- unit tests
- contract compatibility check

Nightly pipeline:
- XCUITest regression
- snapshot tests
- performance tests

Release pipeline:
- version bump + changelog
- archive + signing
- TestFlight upload

Правило merge:
- без green PR pipeline merge заборонений.

## 10) Мінімальне втручання власника (вас)

Ви залучаєтесь тільки в 4 контрольні точки:
1. Scope freeze (Phase 0)
2. UX preview sign-off (кінець Phase 2)
3. TestFlight sign-off (Phase 4)
4. App Store metadata/signing approvals

Все інше агент/команда робить автономно:
- декомпозиція задач,
- імплементація,
- написання тестів,
- виправлення CI,
- підготовка release notes.

## 11) Definition of Done (для кожної фічі)

- Функціонал відповідає parity matrix
- Покрито unit + integration тестами
- Критичний XCUITest сценарій пройдений
- Є логування помилок та user-safe fallback
- Accessibility не зламана
- Документація оновлена

## 12) Гілки та коміти

- Trunk-based: короткі feature branches від `main`
- Іменування гілок: `codex/ios-<feature>`
- Conventional commits:
  - `feat(ios): ...`
  - `fix(ios): ...`
  - `test(ios): ...`
  - `chore(ios): ...`

## 13) Ризики та контрзаходи

Ризик: розсинхрон API і mobile клієнта  
Контрзахід: contract tests у кожному PR.

Ризик: UI drift від web-логіки  
Контрзахід: parity matrix + acceptance criteria на рівні use-case.

Ризик: повільний реліз через ручні кроки  
Контрзахід: Fastlane, автоматичний build/test/upload.

## 14) Перші практичні кроки

1. Створити новий repo `mtodo-ios-native`.
2. Згенерувати API contract v1 з поточного `MTodo`.
3. Підняти iOS skeleton (app shell + network + auth header).
4. Увімкнути CI (lint/build/unit).
5. Почати migration features за parity matrix.
