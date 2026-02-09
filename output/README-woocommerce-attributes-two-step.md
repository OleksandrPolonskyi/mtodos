# WooCommerce атрибути: two-step (кістяк -> м'ясо)

Файли згенеровано через скіл `woocommerce-import-csv` (`build_woocommerce_csv.py --two-step`) і адаптовано під імпорт атрибутів.

## Файли для імпорту
- `/Users/oleksandrpolonskyi/Moddyland/Імпорт в Woocomerce/woocommerce-attributes-parents-only.csv`
- `/Users/oleksandrpolonskyi/Moddyland/Імпорт в Woocomerce/woocommerce-attributes-variations-only.csv`

## Що зроблено
- Формат: повний WooCommerce CSV з усіма колонками.
- Режим: `parents-only` + `variations-only`.
- Кольори/матеріали розбиті на 6 технічних батьків (короткі значення в рядку, без довгих "ковбас"), щоб уникнути зависання імпорту.
- Матеріали нормалізовані: `Денім` -> `Джинс`.

## Порядок імпорту
1. Імпортуй `woocommerce-attributes-parents-only.csv`.
2. Дочекайся завершення.
3. Імпортуй `woocommerce-attributes-variations-only.csv`.
4. Перевір терміни в `Товари -> Атрибути -> Колір/Матеріал -> Налаштувати терміни`.
5. Видали технічні товари з SKU `MD-ATTR-TS-01 ... MD-ATTR-TS-06`.

## Якщо знову "крутиться"
- Перезавантаж сторінку імпорту й повтори з `parents-only` (без одночасних вкладок/інших імпортів).
- На кроці мапінгу переконайся, що колонки атрибутів не стоять як `Не імпортувати`.
