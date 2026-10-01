// Reproducible fictional import stress example. Uses the project's actual row/source logic.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import schema from '../src/importContract/workspace-v3.schema.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { buildInputFromRows } = await server.ssrLoadModule('/src/sourceSync.ts');
  const { ERROR_CATALOG } = await server.ssrLoadModule('/src/errorCatalog.ts');
  const { validateCodexProjectImport } = await server.ssrLoadModule('/src/codexImportValidation.ts');
  const { loadWorkspaceProjectFromPayload } = await server.ssrLoadModule('/src/projectImport.ts');
  const timestamp = '2026-10-02T09:00:00.000Z';
  const columns = schema.definitions.parsedSection.properties.requestColumnOrder.const;
  const json = value => JSON.stringify(value, null, 2);
  const text = (id, title, value) => ({ id, title, enabled: true, kind: 'text', value });
  const field = (client, downstream, value, description, options = {}) => ({ client, downstream, value, description, ...options });
  const commonRequest = [
    field('requestId', 'request_id', 'req-demo-20261002-001', 'Идентификатор запроса; не меняется при повторе.', { validations: 'Длина 8–64 символа; уникален в пределах операции.' }),
    field('requestedAt', 'requested_at', '02.10.2026 14:00:00', 'Дата публичного API DD.MM.YYYY HH:mm:ss; downstream использует ISO UTC.', { serverValue: timestamp, validations: 'Валидная календарная дата, часовой пояс учебного клиента Asia/Tashkent.' }),
    field('channel', 'source_channel', 'WEB', 'Источник запроса.', { validations: 'WEB | MOBILE | SUPPORT.' }),
    field('locale', 'locale', 'ru-RU', 'Язык уведомлений.', { required: '-', validations: 'ru-RU | en-US | uz-UZ.' })
  ];
  const definitions = [
    { key: 'create', name: 'Регистрация заказа — вход оркестрации', endpoint: 'orders', request: [
      field('customer.id', 'customer.external_id', 'customer-demo-001', 'Идентификатор клиента.'),
      field('customer.contact.email', 'customer.contact.email_address', 'demo@example.test', 'Адрес для уведомления.', { mask: true, validations: 'Учебный email; длина ≤ 254.' }),
      field('customer.contact.phone', 'customer.contact.phone_number', '+998900000000', 'Учебный номер телефона.', { mask: true, required: '-' }),
      field('items[0].sku', 'lines[0].product_code', 'sku-demo-001', 'Товар первого примерного элемента.'),
      field('items[0].quantity', 'lines[0].qty', 2, 'Количество товара.', { validations: 'Целое число от 1 до 100.' }),
      field('items[0].unitPrice', 'lines[0].unit_price', 1250.5, 'Цена единицы в учебной валюте.', { type: 'number', validations: 'Положительное число; 2 десятичных знака.' }),
      field('items[0].attributes.color', 'lines[0].attributes.color_code', 'BLUE', 'Вариант товара.', { required: '-' }),
      field('items[0].attributes.size', 'lines[0].attributes.size_code', 'M', 'Размер.', { required: '-' }),
      field('delivery.address.city', 'shipping.address.city_name', 'Ташкент', 'Город доставки.'),
      field('delivery.address.street', 'shipping.address.street_name', 'Учебная улица', 'Вымышленный адрес.', { mask: true }),
      field('delivery.address.house', 'shipping.address.house_number', '10', 'Дом.', { mask: true }),
      field('delivery.address.coordinates.latitude', 'shipping.address.geo.lat', 41.3111, 'Широта.', { type: 'number', required: '-' }),
      field('delivery.address.coordinates.longitude', 'shipping.address.geo.lon', 69.2797, 'Долгота.', { type: 'number', required: '-' }),
      field('delivery.timeWindow.from', 'shipping.window.start_at', '03.10.2026 10:00:00', 'Начало интервала.', { serverValue: '2026-10-03T05:00:00.000Z' }),
      field('delivery.timeWindow.to', 'shipping.window.end_at', '03.10.2026 14:00:00', 'Конец интервала.', { serverValue: '2026-10-03T09:00:00.000Z' }),
      field('payment.token', 'billing.payment_token', 'PAYMENT_TOKEN_EXAMPLE', 'Учебный токен оплаты.', { mask: true }),
      field('payment.currency', 'billing.currency_code', 'UZS', 'Валюта.', { validations: 'В примере только UZS.' }),
      field('preferences.allowPartial', 'options.partial_allowed', false, 'Разрешить частичное исполнение.'),
      field('preferences.tags', 'options.tags', ['demo', 'priority'], 'Метки заказа.', { type: 'array', required: '-' }),
      field('preferences.metadata', 'options.metadata', { campaign: 'demo-autumn', source: 'codex' }, 'Набор дополнительных метаданных.', { type: 'map', required: '-' })
    ], response: [
      field('orderId', 'order_id', 'order-demo-001', 'Созданный черновик заказа.'), field('status', 'state', 'CREATED', 'Состояние до резервирования и оплаты.'),
      field('customerId', 'customer_id', 'customer-demo-001', 'Клиент заказа.'),
      field('total.amount', 'total.amount_value', 2501, 'Сумма заказа.', { type: 'number' }), field('total.currency', 'total.currency_code', 'UZS', 'Валюта.'),
      field('items[0].sku', 'lines[0].product_code', 'sku-demo-001', 'Подтверждённый товар.'), field('items[0].quantity', 'lines[0].qty', 2, 'Подтверждённое количество.'),
      field('createdAt', 'created_at', '02.10.2026 14:00:00', 'Дата создания.', { serverValue: timestamp }),
      field('estimatedDelivery', 'delivery_at', '03.10.2026 14:00:00', 'Ожидаемая доставка.', { serverValue: '2026-10-03T09:00:00.000Z' })
    ] },
    { key: 'customer', name: 'Получение и проверка профиля клиента', endpoint: 'customers/profile', get: true, request: [
      field('customerId', 'customer_id', 'customer-demo-001', 'Идентификатор клиента.'), field('includeConsent', 'include_consent', true, 'Включить согласие на уведомление.')
    ], response: [field('customerId', 'customer_id', 'customer-demo-001', 'Клиент.'), field('status', 'state', 'ACTIVE', 'Статус профиля.'), field('riskTier', 'risk_tier', 'LOW', 'Категория риска.'), field('contact.email', 'contact.email_address', 'demo@example.test', 'Email.', { mask: true }), field('contact.phone', 'contact.phone_number', '+998900000000', 'Телефон.', { mask: true }), field('notificationConsent', 'notification_consent', true, 'Согласие на уведомления.')] },
    { key: 'reserve', name: 'Резервирование товаров на складе', endpoint: 'inventory/reservations', request: [
      field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('items[0].sku', 'lines[0].product_code', 'sku-demo-001', 'Товар.'), field('items[0].quantity', 'lines[0].qty', 2, 'Количество.', { validations: 'Целое ≥ 1.' }), field('warehouseId', 'warehouse_code', 'wh-demo-01', 'Склад.'), field('expiresInSeconds', 'ttl_seconds', 900, 'Время жизни резерва.', { validations: 'От 60 до 1800 секунд.' })
    ], response: [field('reservationId', 'reservation_id', 'res-demo-001', 'Идентификатор резерва.'), field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('status', 'state', 'RESERVED', 'Результат.'), field('expiresAt', 'expires_at', '02.10.2026 14:15:00', 'Срок резерва.', { serverValue: '2026-10-02T09:15:00.000Z' }), field('items[0].sku', 'lines[0].product_code', 'sku-demo-001', 'Резервируемый товар.'), field('items[0].quantity', 'lines[0].qty', 2, 'Количество.'), field('items[0].available', 'lines[0].available', true, 'Доступность.')] },
    { key: 'risk', name: 'Проверка риска и принятие решения', endpoint: 'risk/assessments', request: [
      field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('customerId', 'customer_id', 'customer-demo-001', 'Клиент.'), field('amount', 'amount_value', 2501, 'Сумма.', { type: 'number' }), field('currency', 'currency_code', 'UZS', 'Валюта.'), field('device.ip', 'device.ip_address', '192.0.2.10', 'Документационный IP.', { mask: true }), field('device.fingerprint', 'device.fingerprint_hash', 'DEVICE_HASH_EXAMPLE', 'Учебный отпечаток.', { mask: true })
    ], response: [field('assessmentId', 'assessment_id', 'risk-demo-001', 'Оценка.'), field('decision', 'decision_code', 'ALLOW', 'ALLOW | REVIEW | DENY.'), field('score', 'score_value', 12.5, 'Риск от 0 до 100.', { type: 'number' }), field('reasons', 'reason_codes', ['KNOWN_CUSTOMER'], 'Причины решения.', { type: 'array' }), field('rulesVersion', 'rules_version', 'demo-1', 'Версия правил.')] },
    { key: 'capture', name: 'Списание оплаты с идемпотентностью', endpoint: 'payments/captures', request: [
      field('orderId', 'merchant_order_id', 'order-demo-001', 'Заказ.'), field('reservationId', 'reservation_id', 'res-demo-001', 'Резерв.'), field('assessmentId', 'assessment_id', 'risk-demo-001', 'Проверка риска.'), field('amount', 'amount_value', 2501, 'Сумма списания.', { type: 'number' }), field('currency', 'currency_code', 'UZS', 'Валюта.'), field('paymentToken', 'payment_token', 'PAYMENT_TOKEN_EXAMPLE', 'Учебный платёжный токен.', { mask: true }), field('customerId', 'customer_id', 'customer-demo-001', 'Плательщик.')
    ], response: [field('paymentId', 'transaction_id', 'pay-demo-001', 'Транзакция.'), field('orderId', 'merchant_order_id', 'order-demo-001', 'Заказ.'), field('status', 'state', 'CAPTURED', 'Результат.'), field('amount', 'amount_value', 2501, 'Списанная сумма.', { type: 'number' }), field('currency', 'currency_code', 'UZS', 'Валюта.'), field('receipt.number', 'receipt.receipt_no', 'receipt-demo-001', 'Чек.'), field('receipt.url', 'receipt.receipt_url', 'https://receipts.example.test/demo-001', 'Учебная ссылка.'), field('capturedAt', 'captured_at', '02.10.2026 14:00:00', 'Дата оплаты.', { serverValue: timestamp })] },
    { key: 'shipment', name: 'Создание доставки после оплаты', endpoint: 'shipments', request: [
      field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('reservationId', 'reservation_id', 'res-demo-001', 'Резерв.'), field('paymentId', 'payment_id', 'pay-demo-001', 'Оплата.'), field('address.city', 'destination.city_name', 'Ташкент', 'Город.'), field('address.street', 'destination.street_name', 'Учебная улица', 'Адрес.', { mask: true }), field('address.house', 'destination.house_number', '10', 'Дом.', { mask: true }), field('recipient.email', 'recipient.email_address', 'demo@example.test', 'Email.', { mask: true }), field('items[0].sku', 'packages[0].product_code', 'sku-demo-001', 'Товар.'), field('items[0].quantity', 'packages[0].qty', 2, 'Количество.')
    ], response: [field('shipmentId', 'shipment_id', 'ship-demo-001', 'Доставка.'), field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('status', 'state', 'CREATED', 'Статус.'), field('tracking.number', 'tracking.tracking_no', 'track-demo-001', 'Трекинг.'), field('tracking.url', 'tracking.tracking_url', 'https://tracking.example.test/demo-001', 'Учебная ссылка.'), field('estimatedDelivery', 'delivery_at', '03.10.2026 14:00:00', 'Срок.', { serverValue: '2026-10-03T09:00:00.000Z' })] },
    { key: 'notify', name: 'Асинхронная постановка уведомления', endpoint: 'notifications', request: [
      field('orderId', 'entity_id', 'order-demo-001', 'Заказ.'), field('shipmentId', 'shipment_id', 'ship-demo-001', 'Доставка.'), field('customerId', 'recipient_id', 'customer-demo-001', 'Клиент.'), field('email', 'email_address', 'demo@example.test', 'Email.', { mask: true }), field('template', 'template_code', 'ORDER_CONFIRMED', 'Шаблон.'), field('variables.trackingNumber', 'template_vars.tracking_no', 'track-demo-001', 'Номер отслеживания.'), field('variables.total', 'template_vars.amount', 2501, 'Сумма.', { type: 'number' })
    ], response: [field('notificationId', 'message_id', 'msg-demo-001', 'Задание уведомления.'), field('status', 'state', 'QUEUED', 'Состояние.'), field('scheduledAt', 'scheduled_at', '02.10.2026 14:00:00', 'Дата постановки.', { serverValue: timestamp })] },
    { key: 'release', name: 'Компенсация — освобождение резерва', endpoint: 'inventory/reservations/release', request: [field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('reservationId', 'reservation_id', 'res-demo-001', 'Освобождаемый резерв.'), field('reason', 'reason_code', 'PAYMENT_FAILED', 'PAYMENT_FAILED | RISK_DENIED | SHIPMENT_FAILED | CUSTOMER_CANCELLED.'), field('compensationId', 'compensation_id', 'comp-demo-001', 'Ключ идемпотентной компенсации.')], response: [field('reservationId', 'reservation_id', 'res-demo-001', 'Резерв.'), field('status', 'state', 'RELEASED', 'Результат.'), field('alreadyReleased', 'already_released', false, 'Повторная компенсация возвращает true.')] },
    { key: 'refund', name: 'Компенсация — возврат списанных средств', endpoint: 'payments/refunds', request: [field('orderId', 'merchant_order_id', 'order-demo-001', 'Заказ.'), field('paymentId', 'original_transaction_id', 'pay-demo-001', 'Исходная оплата.'), field('amount', 'refund_amount', 2501, 'Сумма возврата.', { type: 'number' }), field('currency', 'currency_code', 'UZS', 'Валюта.'), field('reason', 'reason_code', 'SHIPMENT_FAILED', 'Причина.'), field('compensationId', 'compensation_id', 'comp-demo-001', 'Ключ повторов.')], response: [field('refundId', 'refund_transaction_id', 'refund-demo-001', 'Возврат.'), field('paymentId', 'original_transaction_id', 'pay-demo-001', 'Исходная оплата.'), field('status', 'state', 'REFUNDED', 'Результат.'), field('amount', 'refund_amount', 2501, 'Возвращённая сумма.', { type: 'number' })] },
    { key: 'cancel', name: 'Отмена заказа и фиксация результата саги', endpoint: 'orders/cancellations', request: [field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('reason', 'reason_code', 'SHIPMENT_FAILED', 'Причина отмены.'), field('refundId', 'refund_transaction_id', 'refund-demo-001', 'Завершённый возврат.', { required: '-' }), field('compensationComplete', 'compensation_complete', true, 'Все обратные операции завершены.'), field('originalErrorCode', 'original_error_code', '600105', 'Исходная причина из справочника.')], response: [field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('status', 'state', 'CANCELLED', 'Состояние.'), field('requiresManualReview', 'manual_review_required', false, 'Необходимость ручного разбора.')] },
    { key: 'status', name: 'Чтение статуса и истории исполнения', endpoint: 'orders/status', get: true, request: [field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('includeHistory', 'include_history', true, 'История исполнения.')], response: [field('orderId', 'order_id', 'order-demo-001', 'Заказ.'), field('status', 'state', 'CONFIRMED', 'Текущее состояние.'), field('paymentId', 'payment_id', 'pay-demo-001', 'Оплата.'), field('shipmentId', 'shipment_id', 'ship-demo-001', 'Доставка.'), field('history[0].step', 'history[0].step_code', 'PAYMENT_CAPTURED', 'Этап.'), field('history[0].status', 'history[0].state', 'DONE', 'Результат.'), field('history[0].at', 'history[0].completed_at', '02.10.2026 14:00:00', 'Дата.', { serverValue: timestamp }), field('compensation.pending', 'compensation.pending', false, 'Ожидается компенсация.'), field('compensation.attempts', 'compensation.attempt_count', 0, 'Число попыток.') ] }
  ];

  function makeRows(key, side, specs, source = 'body') {
    const rows = [];
    const seen = new Set();
    const add = (path, type, value, info = {}) => {
      if (seen.has(path)) return;
      seen.add(path);
      rows.push({ id: `${key}-${side}-${path.replaceAll('[0]', '-item').replaceAll('.', '-')}`, field: path, sourceField: path, type,
        required: info.required ?? '+', validations: info.validations ?? '', description: info.description ?? `Контейнер ${path}; дочерние поля описаны ниже.`,
        example: ['object', 'map', 'array', 'array_object'].includes(type) ? JSON.stringify(value) : String(value),
        origin: 'generated', source, enabled: true, maskInLogs: info.mask ?? false, clientField: '' });
    };
    for (const spec of specs) {
      const path = spec.path;
      if (source === 'body') {
        for (const match of path.matchAll(/\.|\[0\]/g)) {
          const prefix = path.slice(0, match.index);
          if (!prefix || prefix.endsWith('[0]')) continue;
          add(prefix, match[0] === '[0]' ? 'array_object' : 'object', match[0] === '[0]' ? [] : {}, { required: spec.required });
        }
      }
      const type = spec.type ?? (typeof spec.value === 'boolean' ? 'boolean' : typeof spec.value === 'number' ? 'int' : 'string');
      add(path, type, spec.value, spec);
    }
    return rows;
  }
  const specsFor = (fields, client, response = false) => fields.map(f => ({ ...f, path: client ? `${response ? 'data.' : ''}${f.client}` : f.downstream, value: client ? f.value : f.serverValue ?? f.value }));
  const header = (key, suffix, fieldName, example, enabled = true) => ({ id: `${key}-${suffix}`, field: fieldName, sourceField: fieldName, type: 'string', required: '+', validations: 'Не менять при повторе одной операции.', description: 'Технический header учебного контракта.', example, origin: 'generated', source: 'header', enabled, maskInLogs: false, clientField: '' });
  const diagram = (id, title, engine, code, description) => ({ id, title, engine, code, description });
  function parsed(key, kind, rows, clientRows, mappings, def) {
    const request = kind === 'request';
    const source = request && def.get ? 'curl' : 'json';
    const curl = (url, values) => `curl -X GET "${url}?${new URLSearchParams(values.filter(r => r.source === 'query').map(r => [r.field, r.example])).toString()}"`;
    const endpoint = `https://${def.key === 'create' ? 'order-core' : def.key}.example.test/${def.endpoint}`;
    const publicEndpoint = `https://gateway.example.test/api/v1/${def.endpoint}`;
    const result = { id: kind, title: request ? 'Request — Server / Client' : 'Response — Server / Client', enabled: true, kind: 'parsed', sectionType: kind,
      format: source, lastSyncedFormat: source, input: source === 'curl' ? curl(endpoint, rows) : buildInputFromRows('json', rows), schemaInput: '', rows, error: '', domainModelEnabled: true,
      clientFormat: source, clientLastSyncedFormat: source, clientInput: source === 'curl' ? curl(publicEndpoint, clientRows) : buildInputFromRows('json', clientRows), clientSchemaInput: '', clientRows, clientError: '', clientMappings: mappings, requestColumnOrder: [...columns] };
    if (request) Object.assign(result, { authType: 'api-key', authHeaderName: 'X-DEMO-API-KEY', authTokenExample: '', authUsername: '', authPassword: '', authApiKeyExample: 'API_KEY_EXAMPLE', requestUrl: endpoint, requestMethod: def.get ? 'GET' : 'POST', requestProtocol: 'REST', externalRequestUrl: publicEndpoint, externalRequestMethod: def.get ? 'GET' : 'POST', externalAuthType: 'bearer', externalAuthHeaderName: '', externalAuthTokenExample: 'TOKEN_EXAMPLE', externalAuthUsername: '', externalAuthPassword: '', externalAuthApiKeyExample: '' });
    return result;
  }
  function errors(def) {
    const codes = ['100101', '200101', '300101', '100301', '100303', '600101', '600104', '600105', '600301', '600304', '700101'];
    const rows = codes.map(code => {
      const preset = ERROR_CATALOG.find(item => item.internalCode === code);
      const business = code === '100303';
      const serverHttpStatus = business ? '422' : preset.httpStatus;
      const wrapper = { error: { internalCode: code, message: preset.message, externalCode: code.startsWith('6') ? 'DEMO_DOWNSTREAM_ERROR' : '', details: [{ field: business ? 'orderId' : 'requestId', reason: business ? 'Недопустимый переход состояния учебного заказа.' : 'Учебный пример причины.' }] }, techData: { traceId: 'trace-demo-001', spanId: 'span-demo-001', appVersion: 'demo-1.0', appTag: 'order-saga-demo' }, warnings: {} };
      return { clientHttpStatus: serverHttpStatus, clientResponse: business ? 'Конфликт состояния; повторы без изменения условий запрещены.' : code.startsWith('6') ? 'Сбой downstream; решение о повторе зависит от этапа саги.' : 'Запрос завершён ошибкой учебного контракта.', clientResponseCode: json(wrapper), trigger: `${def.name}: ${code === '100303' ? 'повтор с тем же ключом и изменённым содержимым либо недопустимое состояние' : preset.message}.`, errorType: business ? 'BusinessException' : code === '700101' ? 'AlertException' : 'CommonException', serverHttpStatus, internalCode: code, message: preset.message, responseCode: json({ ...wrapper, warnings: {} }) };
    });
    return { id: 'errors', title: 'Ошибки, преобразование ответов и бизнес-валидация', enabled: true, kind: 'errors', rows,
      validationRules: (def.get ? def.request : [...commonRequest, ...def.request]).filter(f => f.required !== '-').map(f => ({ parameter: f.client, validationCase: f.validations || 'Поле обязательное; тип и формат соответствуют таблице Request.', condition: 'Проверить до downstream-вызова; не подменять бизнес-проверки downstream.', cause: '100101 / CommonException / HTTP 400. Конфликт состояния отдельно: 100303 / BusinessException / HTTP 422.' })) };
  }
  const methods = definitions.map(def => {
    const requestFields = def.get ? def.request : [...commonRequest, ...def.request];
    const serverRequestRows = makeRows(def.key, 'request-server', specsFor(requestFields, false), def.get ? 'query' : 'body');
    const clientRequestRows = makeRows(def.key, 'request-client', specsFor(requestFields, true), def.get ? 'query' : 'body');
    serverRequestRows.push(header(def.key, 'server-idempotency', 'Idempotency-Key', `idem-${def.key}-demo-001`), header(def.key, 'server-bp-disabled', 'X-BP-NAME', 'order-saga-demo', false));
    clientRequestRows.push(header(def.key, 'client-idempotency', 'Idempotency-Key', `idem-${def.key}-demo-001`));
    const technical = [field('traceId', 'trace_id', 'trace-demo-001', 'Идентификатор трассировки.'), field('spanId', 'span_id', `span-${def.key}-001`, 'Span вызова.'), field('appVersion', 'app_version', 'demo-1.0', 'Версия.'), field('appTag', 'app_tag', 'order-saga-demo', 'Тег приложения.')];
    const serverResponseRows = makeRows(def.key, 'response-server', [...specsFor(def.response, false), ...technical.map(f => ({ ...f, path: `meta.${f.downstream}` }))]);
    const clientResponseRows = makeRows(def.key, 'response-client', [...specsFor(def.response, true, true), ...technical.map(f => ({ ...f, path: `techData.${f.client}` })), { path: 'warnings', type: 'object', value: {}, description: 'Предупреждения по необязательным headers; в успешном примере пусто.', required: '+' }]);
    const req = parsed(def.key, 'request', serverRequestRows, clientRequestRows, Object.fromEntries(requestFields.map(f => [f.downstream, f.client])), def);
    const resp = parsed(def.key, 'response', serverResponseRows, clientResponseRows, Object.fromEntries([...def.response.map(f => [f.downstream, `data.${f.client}`]), ...technical.map(f => [`meta.${f.downstream}`, `techData.${f.client}`])]), def);
    const descriptions = 'Описание учебного процесса: проверить Request и headers, установить контекст трассировки, проверить идемпотентность, выполнить downstream-вызов, преобразовать поля и даты, вернуть стандартный wrapper. При транспортной ошибке сначала выяснить результат операции; повтор денежной операции без проверки состояния запрещён.';
    return { id: `method-${def.key}`, name: def.name, updatedAt: timestamp, jiraTicket: '', epic: 'Учебная сага оформления заказа', initiators: 'Демонстрационный проект для проверки импорта', responsible: 'Demo Integration Team', externalUrl: '', status: 'draft', sections: [
      text('goal', 'Цель метода', `${def.name}. Все адреса, бизнес-правила и примеры вымышлены; это сложный тестовый документ для импорта.`),
      text('functional', 'Функциональные требования', '1. Возвращать воспроизводимый результат при повторе неизменного запроса с тем же ключом.\n2. Отклонять конфликтующий повтор.\n3. Сохранять причину отказа и идентификатор трассировки.\n4. Передавать результат в последующий шаг только после подтверждения результата операции.'),
      { id: 'process-diagram', title: 'Диаграммы метода и описание', enabled: true, kind: 'diagram', diagrams: [
        diagram(`${def.key}-sequence`, 'Вызов и преобразование контракта', 'mermaid', `sequenceDiagram\n  autonumber\n  participant C as Client\n  participant A as Adapter\n  participant D as Downstream\n  C->>A: ${def.get ? 'GET' : 'POST'} ${def.endpoint}\n  A->>A: Validate and deduplicate\n  A->>D: Map fields and call\n  alt Success\n    D-->>A: Confirmed result\n    A-->>C: data + techData + warnings\n  else Failure\n    D-->>A: Downstream error\n    A-->>C: error + techData + warnings\n  end`, descriptions),
        diagram(`${def.key}-states`, 'Жизненный цикл операции', 'mermaid', 'stateDiagram-v2\n  [*] --> RECEIVED\n  RECEIVED --> VALIDATED\n  RECEIVED --> REJECTED\n  VALIDATED --> IN_PROGRESS\n  IN_PROGRESS --> SUCCEEDED\n  IN_PROGRESS --> RESULT_UNKNOWN\n  RESULT_UNKNOWN --> SUCCEEDED: reconcile\n  RESULT_UNKNOWN --> FAILED: confirmed failure\n  FAILED --> COMPENSATING\n  COMPENSATING --> COMPENSATED\n  SUCCEEDED --> [*]\n  REJECTED --> [*]\n  COMPENSATED --> [*]', 'Неизвестный результат отличается от подтверждённого отказа. Компенсация применяется только к изменённым ресурсам, а не к чтению. Диаграмма описывает общую модель; конкретные этапы указаны в сценариях проекта.')
      ] }, req, resp, errors(def),
      text('non-functional', 'Нефункциональные требования', 'Учебные значения: общий бюджет саги 15 с; таймаут чтения 2 с; максимум 2 повтора безопасных операций с задержками 200/500 мс и jitter. Идемпотентность 24 ч. Маскировать email, телефон, адрес и платёжный токен. Сохранять traceId и первопричину. Денежные операции повторять только с прежним ключом после проверки результата.'),
      text('mapping-notes', 'Правила преобразования полей', 'rows/input описывают Server — downstream-контракт. clientRows/clientInput описывают Client — фасадный контракт. clientMappings всегда Server field → Client field. Даты фасада DD.MM.YYYY HH:mm:ss преобразуются в ISO UTC. Маппинг не исполняет преобразование: формула и источник фиксируются в описании и связях сценария. [0] — первый примерный элемент; массив применяется ко всем элементам при реализации.'),
      text('recovery', 'Повторы и восстановление', def.get ? 'Чтение безопасно повторять при таймауте; статус не изменять.' : ['release', 'refund', 'cancel'].includes(def.key) ? 'Компенсацию повторять с неизменным compensationId. Уже завершённая операция возвращает предыдущий результат. После исчерпания попыток — ручной разбор, исходную причину не терять.' : 'Повтор с тем же Idempotency-Key и тем же payload возвращает сохранённый результат. Изменённый payload с тем же ключом — конфликт. При неопределённом результате сначала выполнить сверку, затем решить о повторе или компенсации.')
    ] };
  });

  function flow(id, name, description) {
    return { id, name, description, createdAt: timestamp, updatedAt: timestamp, nodes: [], edges: [] };
  }
  function addNode(flow, id, type, label, key, x, y, description = '') {
    const node = { id, type, label, description, position: { x, y }, actor: type === 'method' ? 'Order Orchestrator' : 'Учебный сценарий', noteContent: type === 'note' ? description : '', preconditions: type === 'method' ? ['Входные поля доступны в контексте; предыдущий этап подтверждён.'] : [], postconditions: type === 'method' ? ['Результат и traceId сохранены; ошибка классифицирована.'] : [] };
    if (key) node.methodRef = { methodId: `method-${key}` };
    flow.nodes.push(node); return node;
  }
  function ref(flow, nodeId, side, path) {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (side === 'context') return { nodeId, side, rowId: '', fieldPath: path };
    const method = methods.find(m => m.id === node.methodRef.methodId);
    const section = method.sections.find(s => s.id === side);
    const row = section.clientRows.find(r => r.field === path);
    if (!row) throw new Error(`Missing row ${nodeId} ${side} ${path}`);
    return { nodeId, side, rowId: row.id, fieldPath: path };
  }
  function connect(flow, from, to, label, condition = '', pairs = []) {
    const id = `${flow.id}-${from}-${to}`;
    flow.edges.push({ id, type: 'sequence', fromNodeId: from, toNodeId: to, label, condition, mappings: pairs.map(([sourceSide, sourcePath, targetSide, targetPath, transform = '', note = 'Передача по подтверждённому результату.'], index) => ({ id: `${id}-map-${index + 1}`, source: ref(flow, from, sourceSide, sourcePath), target: ref(flow, to, targetSide, targetPath), transform, note })) });
  }
  const toRequest = (from, to, transform = '', note) => ['response', from, 'request', to, transform, note];
  const ctx = (from, to, transform = '') => ['context', from, 'request', to, transform];
  const save = (from, to) => ['response', from, 'context', to];
  const forward = (from, to) => ['context', from, 'context', to];
  const main = flow('flow-checkout', '01 — Оформление заказа: ветвления, оплата и доставка', 'Основной сценарий с отклонением риска, таймаутами и передачей в компенсацию. Note-узлы фиксируют условия ветвления и контекст: отдельного типа gateway в текущей модели нет. Выполнение саги описано, но приложение не исполняет его.');
  const mainNodes = [
    ['start', 'start', 'Запрос клиента', null, 0, 180], ['create', 'method', 'Принять заказ', 'create', 280, 180],
    ['context', 'note', 'Контекст заказа', null, 560, 180], ['customer', 'method', 'Проверить клиента', 'customer', 840, 180],
    ['reserve', 'method', 'Резерв склада', 'reserve', 1120, 180], ['risk', 'method', 'Оценить риск', 'risk', 1400, 180],
    ['decision', 'note', 'ALLOW / REVIEW / DENY', null, 1680, 180], ['capture', 'method', 'Списать оплату', 'capture', 1960, 180],
    ['shipment', 'method', 'Создать доставку', 'shipment', 2240, 180], ['notify', 'method', 'Поставить уведомление', 'notify', 2520, 180],
    ['success', 'end', 'Заказ подтверждён', null, 2800, 180], ['manual', 'note', 'Ручная проверка риска', null, 1960, 500],
    ['release', 'method', 'Освободить резерв', 'release', 1960, 800], ['refund', 'method', 'Вернуть оплату', 'refund', 2240, 800],
    ['cancel', 'method', 'Зафиксировать отмену', 'cancel', 2520, 800], ['failure', 'end', 'Отказ / компенсация', null, 2800, 800],
    ['reconcile', 'method', 'Сверить статус после таймаута', 'status', 2240, 500], ['warning', 'note', 'Уведомление будет повторено', null, 2800, 500]
  ];
  mainNodes.forEach(([id, type, label, key, x, y]) => addNode(main, id, type, label, key, x, y, type === 'note' ? id === 'context' ? 'Контекст содержит orderId, customerId, items, address, paymentToken, amount, currency и промежуточные результаты. Регистрация возвращает CREATED; CONFIRMED возникает только после последующих шагов. Все подтверждённые результаты накапливаются в общем контексте, исходные поля Request сохраняются.' : id === 'decision' ? 'ALLOW → оплата; REVIEW → ручная проверка; DENY → освобождение резерва. Сохранить assessmentId и первопричину.' : id === 'manual' ? 'Продолжение только после решения оператора; таймаут рассмотрения приводит к отмене.' : 'Асинхронный retry уведомления не отменяет оплаченный заказ.' : label));
  connect(main, 'start', 'create', 'Принять Request', '', [ctx('client.requestId', 'requestId'), ctx('client.customer.id', 'customer.id'), ctx('client.items', 'items'), ctx('client.delivery.address', 'delivery.address'), ctx('client.payment.token', 'payment.token')]);
  connect(main, 'create', 'context', 'Сохранить входной контекст', '', [save('data.orderId', 'order.orderId'), save('data.total.amount', 'order.amount'), save('data.total.currency', 'order.currency'), ['request', 'customer.id', 'context', 'order.customerId'], ['request', 'items', 'context', 'order.items'], ['request', 'delivery.address', 'context', 'order.address'], ['request', 'payment.token', 'context', 'order.paymentToken'], ['request', 'requestId', 'context', 'order.requestId'] ]);
  connect(main, 'context', 'customer', 'Клиент', '', [ctx('order.customerId', 'customerId'), ctx('constants.includeConsent', 'includeConsent', 'true')]);
  connect(main, 'customer', 'reserve', 'ACTIVE: резерв', 'data.status == ACTIVE', [save('data.contact.email', 'customer.contact.email'), save('data.contact.phone', 'customer.contact.phone'), save('data.notificationConsent', 'customer.notificationConsent')]);
  connect(main, 'context', 'reserve', 'Входные данные резерва', 'customer.status == ACTIVE', [ctx('order.orderId', 'orderId'), ctx('order.items', 'items'), ctx('constants.warehouseId', 'warehouseId'), ctx('constants.reservationTtlSeconds', 'expiresInSeconds', '900')]);
  connect(main, 'reserve', 'risk', 'Резерв подтверждён', 'data.status == RESERVED', [toRequest('data.orderId', 'orderId'), save('data.reservationId', 'reservation.reservationId'), save('data.expiresAt', 'reservation.expiresAt')]);
  connect(main, 'context', 'risk', 'Данные оценки риска', 'reservation.status == RESERVED', [ctx('order.customerId', 'customerId'), ctx('order.amount', 'amount', 'sum(items.quantity * items.unitPrice)'), ctx('order.currency', 'currency')]);
  connect(main, 'risk', 'decision', 'Сохранить решение', '', [save('data.decision', 'risk.decision'), save('data.assessmentId', 'risk.assessmentId'), save('data.score', 'risk.score')]);
  connect(main, 'decision', 'capture', 'ALLOW', 'risk.decision == ALLOW', [ctx('risk.assessmentId', 'assessmentId'), ctx('order.orderId', 'orderId'), ctx('reservation.reservationId', 'reservationId'), ctx('order.paymentToken', 'paymentToken'), ctx('order.amount', 'amount'), ctx('order.currency', 'currency'), ctx('order.customerId', 'customerId')]);
  connect(main, 'decision', 'manual', 'REVIEW', 'risk.decision == REVIEW', [forward('risk.assessmentId', 'review.assessmentId')]);
  connect(main, 'manual', 'capture', 'Оператор разрешил', 'review.approved == true', [ctx('risk.assessmentId', 'assessmentId'), ctx('order.orderId', 'orderId')]);
  connect(main, 'decision', 'release', 'DENY', 'risk.decision == DENY', [ctx('reservation.reservationId', 'reservationId'), ctx('order.orderId', 'orderId'), ctx('constants.riskDenied', 'reason', 'RISK_DENIED')]);
  connect(main, 'manual', 'release', 'Отказ / истёк срок', 'review.approved == false OR review.expired == true', [ctx('reservation.reservationId', 'reservationId'), ctx('order.orderId', 'orderId')]);
  connect(main, 'capture', 'shipment', 'CAPTURED', 'data.status == CAPTURED', [toRequest('data.paymentId', 'paymentId'), toRequest('data.orderId', 'orderId')]);
  connect(main, 'context', 'shipment', 'Адрес и состав заказа', 'payment.status == CAPTURED', [ctx('order.address', 'address'), ctx('order.items', 'items'), ctx('customer.contact.email', 'recipient.email'), ctx('reservation.reservationId', 'reservationId')]);
  connect(main, 'shipment', 'notify', 'Доставка создана', 'data.status == CREATED', [toRequest('data.shipmentId', 'shipmentId'), toRequest('data.orderId', 'orderId'), toRequest('data.tracking.number', 'variables.trackingNumber')]);
  connect(main, 'context', 'notify', 'Контакт и шаблон', 'shipment.status == CREATED', [ctx('order.customerId', 'customerId'), ctx('customer.contact.email', 'email'), ctx('constants.confirmationTemplate', 'template', 'ORDER_CONFIRMED'), ctx('order.amount', 'variables.total')]);
  connect(main, 'notify', 'success', 'QUEUED: ответ клиенту', 'data.status == QUEUED', [save('data.notificationId', 'result.notificationId')]);
  connect(main, 'notify', 'warning', 'Уведомление временно недоступно', 'internalCode == 600105', [forward('order.orderId', 'retry.orderId')]);
  connect(main, 'warning', 'success', 'Подтверждение с warning', '', [forward('retry.orderId', 'result.orderId')]);
  connect(main, 'capture', 'reconcile', 'Неопределённый результат', 'internalCode == 600101 OR internalCode == 600102', [ ['request', 'orderId', 'request', 'orderId'] ]);
  connect(main, 'reconcile', 'shipment', 'Оплата подтверждена сверкой', 'data.paymentId != empty', [toRequest('data.paymentId', 'paymentId'), toRequest('data.orderId', 'orderId')]);
  connect(main, 'capture', 'release', 'Подтверждённый отказ оплаты', 'confirmedFailure == true', [ ['request', 'reservationId', 'request', 'reservationId'], ['request', 'orderId', 'request', 'orderId'] ]);
  connect(main, 'shipment', 'refund', 'Доставка не создана', 'confirmedFailure == true', [ ['request', 'paymentId', 'request', 'paymentId'], ['request', 'orderId', 'request', 'orderId'] ]);
  connect(main, 'refund', 'release', 'Возврат подтверждён', 'data.status == REFUNDED', [ctx('reservation.reservationId', 'reservationId'), ctx('order.orderId', 'orderId'), save('data.refundId', 'saga.refundId')]);
  connect(main, 'release', 'cancel', 'Резерв освобождён', 'data.status == RELEASED', [ctx('order.orderId', 'orderId'), ctx('saga.refundId', 'refundId'), ctx('failure.internalCode', 'originalErrorCode'), ctx('saga.reason', 'reason'), ctx('saga.compensationComplete', 'compensationComplete', 'true')]);
  connect(main, 'cancel', 'failure', 'Отмена завершена', 'data.status == CANCELLED', [save('data.orderId', 'result.orderId'), save('data.status', 'result.status')]);

  const compensation = flow('flow-compensation', '02 — Сага компенсации и ручное восстановление', 'Обратный порядок изменений: вернуть оплату, освободить резерв, отменить заказ. Транспортная ошибка компенсации переводит сценарий в ручное восстановление; повтор использует тот же compensationId.');
  [['start', 'start', 'Ошибка после оплаты', null, 0, 160], ['context', 'note', 'Снимок успешных этапов', null, 280, 160], ['refund', 'method', 'Возврат', 'refund', 560, 160], ['release', 'method', 'Освободить резерв', 'release', 840, 160], ['cancel', 'method', 'Зафиксировать отмену', 'cancel', 1120, 160], ['end', 'end', 'Компенсация завершена', null, 1400, 160], ['manual', 'note', 'Ручное восстановление', null, 840, 480], ['status', 'method', 'Сверка состояния', 'status', 1120, 480], ['pending', 'end', 'Компенсация ожидает разбора', null, 1400, 480]].forEach(([id, type, label, key, x, y]) => addNode(compensation, id, type, label, key, x, y, label));
  connect(compensation, 'start', 'context', 'Первопричина и снимок', '', [forward('failure.internalCode', 'saga.originalErrorCode'), forward('saga.paymentId', 'saga.paymentId'), forward('saga.orderId', 'saga.orderId')]);
  connect(compensation, 'context', 'refund', 'Оплата была списана', 'saga.paymentCaptured == true', [ctx('saga.orderId', 'orderId'), ctx('saga.paymentId', 'paymentId'), ctx('saga.amount', 'amount'), ctx('saga.currency', 'currency'), ctx('saga.compensationId', 'compensationId'), ctx('saga.reason', 'reason')]);
  connect(compensation, 'context', 'release', 'Оплаты не было', 'saga.paymentCaptured == false', [ctx('saga.orderId', 'orderId'), ctx('saga.reservationId', 'reservationId'), ctx('saga.compensationId', 'compensationId'), ctx('saga.reason', 'reason')]);
  connect(compensation, 'refund', 'release', 'Возврат завершён', 'data.status == REFUNDED', [ctx('saga.reservationId', 'reservationId'), ctx('saga.orderId', 'orderId'), ctx('saga.reason', 'reason'), ctx('saga.compensationId', 'compensationId'), save('data.refundId', 'saga.refundId')]);
  connect(compensation, 'release', 'cancel', 'Обратные операции завершены', 'data.status == RELEASED', [ctx('saga.orderId', 'orderId'), ctx('saga.refundId', 'refundId'), ctx('saga.originalErrorCode', 'originalErrorCode')]);
  connect(compensation, 'context', 'cancel', 'Контекст отмены', 'refund.confirmed AND release.confirmed', [ctx('saga.orderId', 'orderId'), ctx('saga.reason', 'reason'), ctx('saga.refundId', 'refundId'), ctx('saga.originalErrorCode', 'originalErrorCode'), ctx('saga.compensationComplete', 'compensationComplete', 'true')]);
  connect(compensation, 'cancel', 'end', 'CANCELLED', 'data.status == CANCELLED', [save('data.orderId', 'result.orderId'), save('data.requiresManualReview', 'result.requiresManualReview')]);
  connect(compensation, 'refund', 'manual', 'Возврат не подтверждён', 'retryBudgetExhausted == true', [ ['request', 'paymentId', 'context', 'review.paymentId'] ]);
  connect(compensation, 'release', 'manual', 'Освобождение не подтверждено', 'retryBudgetExhausted == true', [ ['request', 'reservationId', 'context', 'review.reservationId'] ]);
  connect(compensation, 'manual', 'status', 'Сверить результат', '', [ctx('saga.orderId', 'orderId'), ctx('constants.includeHistory', 'includeHistory', 'true')]);
  connect(compensation, 'status', 'pending', 'Состояние зафиксировано', '', [save('data.status', 'review.currentStatus'), save('data.history', 'review.history')]);

  const inquiry = flow('flow-inquiry', '03 — Проверка статуса и повторное уведомление', 'Безопасное чтение статуса, ветвление по наличию доставки и повторная постановка уведомления. Повтор не вызывает списание оплаты или создание нового заказа.');
  [['start', 'start', 'Запрос статуса', null, 0, 120], ['status', 'method', 'Статус заказа', 'status', 280, 120], ['decision', 'note', 'Нужен повтор уведомления?', null, 560, 120], ['notify', 'method', 'Повтор уведомления', 'notify', 840, 120], ['end', 'end', 'Статус возвращён', null, 1120, 120], ['pending', 'note', 'Компенсация ещё выполняется', null, 840, 420]].forEach(([id, type, label, key, x, y]) => addNode(inquiry, id, type, label, key, x, y, label));
  connect(inquiry, 'start', 'status', 'GET', '', [ctx('query.orderId', 'orderId'), ctx('query.includeHistory', 'includeHistory')]);
  connect(inquiry, 'status', 'decision', 'Сохранить состояние', '', [save('data.orderId', 'order.orderId'), save('data.status', 'order.status'), save('data.shipmentId', 'order.shipmentId'), save('data.compensation.pending', 'order.compensationPending')]);
  connect(inquiry, 'decision', 'notify', 'Повтор разрешён', 'order.status == CONFIRMED AND resendRequested == true', [ctx('order.orderId', 'orderId'), ctx('order.shipmentId', 'shipmentId'), ctx('order.customerId', 'customerId'), ctx('customer.email', 'email'), ctx('constants.confirmationTemplate', 'template', 'ORDER_CONFIRMED')]);
  connect(inquiry, 'decision', 'end', 'Только чтение', 'resendRequested == false', [forward('order.status', 'result.status')]);
  connect(inquiry, 'decision', 'pending', 'Компенсация', 'order.compensationPending == true', [forward('order.orderId', 'review.orderId')]);
  connect(inquiry, 'pending', 'end', 'Вернуть промежуточный статус', '', [forward('review.orderId', 'result.orderId')]);
  connect(inquiry, 'notify', 'end', 'Уведомление принято', 'data.status == QUEUED', [save('data.notificationId', 'result.notificationId')]);

  const mainDiagram = 'flowchart TD\n  START([Client request]) --> CREATE[Accept order]\n  CREATE --> CUSTOMER[Validate customer]\n  CUSTOMER --> RESERVE[Reserve inventory]\n  RESERVE --> RISK[Risk assessment]\n  RISK --> DECISION{Decision}\n  DECISION -->|ALLOW| PAY[Capture payment]\n  DECISION -->|REVIEW| MANUAL[Manual review]\n  MANUAL -->|Approved| PAY\n  DECISION -->|DENY| RELEASE[Release reservation]\n  PAY -->|Confirmed| SHIP[Create shipment]\n  PAY -->|Unknown result| STATUS[Reconcile status]\n  STATUS -->|Captured| SHIP\n  PAY -->|Failed| RELEASE\n  SHIP -->|Created| NOTIFY[Queue notification]\n  SHIP -->|Failed| REFUND[Refund payment]\n  REFUND --> RELEASE\n  RELEASE --> CANCEL[Cancel order]\n  CANCEL --> FAIL([Compensated failure])\n  NOTIFY --> SUCCESS([Confirmed order])';
  const architecture = 'flowchart LR\n  CLIENT[Client] --> GATEWAY[Public API facade]\n  GATEWAY --> SAGA[Order orchestrator]\n  SAGA --> CUSTOMER[Customer service]\n  SAGA --> STOCK[Inventory service]\n  SAGA --> RISK[Risk service]\n  SAGA --> PAYMENT[Payment service]\n  SAGA --> DELIVERY[Delivery service]\n  SAGA --> OUTBOX[Notification outbox]\n  SAGA --> STATE[(Saga state and idempotency)]\n  OUTBOX --> NOTIFY[Notification service]\n  SAGA -.-> TRACE[Trace and audit]';
  const payload = { importProfile: 'codex-v1', version: 3, projectName: 'Сложный учебный импорт — Order Saga / Orchestration / Errors / Field Mapping', updatedAt: timestamp, activeMethodId: 'method-create', methods,
    groups: [
      { id: 'group-checkout', name: 'Основной процесс заказа', methodIds: ['create', 'customer', 'reserve', 'risk', 'capture', 'shipment', 'notify'].map(k => `method-${k}`), links: [['create', 'customer'], ['customer', 'reserve'], ['reserve', 'risk'], ['risk', 'capture'], ['capture', 'shipment'], ['shipment', 'notify']].map(([a, b]) => ({ fromMethodId: `method-${a}`, toMethodId: `method-${b}`, relationType: b === 'notify' ? 'async' : 'request-response', note: b === 'notify' ? 'Асинхронная постановка; сбой не отменяет заказ.' : 'Вызов только после подтверждённого результата предыдущего этапа.' })) },
      { id: 'group-compensation', name: 'Компенсация саги', methodIds: ['refund', 'release', 'cancel', 'status'].map(k => `method-${k}`), links: [{ fromMethodId: 'method-refund', toMethodId: 'method-release', relationType: 'sync', note: 'Обратный порядок изменений.' }, { fromMethodId: 'method-release', toMethodId: 'method-cancel', relationType: 'sync', note: 'Зафиксировать отмену.' }, { fromMethodId: 'method-status', toMethodId: 'method-refund', relationType: 'custom', note: 'Сверка перед повтором возврата.' }] },
      { id: 'group-support', name: 'Чтение и повтор уведомления', methodIds: ['status', 'notify'].map(k => `method-${k}`), links: [{ fromMethodId: 'method-status', toMethodId: 'method-notify', relationType: 'event', note: 'Повтор только по явному запросу после проверки состояния.' }] }
    ],
    projectSections: [
      { id: 'overview', title: 'Обзор и границы демонстрации', enabled: true, type: 'markdown', order: 0, content: '# Учебная оркестрация заказа\n11 методов, 3 сценария, бизнес-отказы и транспортные ошибки, Server/Client контракты и межшаговые маппинги.\n\nВсе бизнес-правила, SLA, адреса и примеры вымышлены. Документ предназначен для проверки импорта и отображения. Оркестратор координирует резерв, риск, оплату и доставку. При отказе выполняет обратные операции. Диаграммы и связи описывают процесс; приложение не исполняет его.\n\nДля полного импорта выбрать «Заменить проект». Дополнительного поля mode в JSON нет: режим с несколькими методами определяется существующей моделью проекта.' },
      { id: 'architecture', title: 'Архитектура взаимодействий', enabled: true, type: 'diagram', order: 1, content: 'Фасад принимает доменный контракт, оркестратор сохраняет состояние саги и ключи повторов, downstream выполняет операции. Outbox отделяет подтверждение заказа от доставки уведомления. Сплошные связи — вызовы, пунктир — аудит и трассировка.', diagramEngine: 'mermaid', diagramCode: architecture },
      { id: 'checkout-diagram', title: 'Основной процесс и ветви компенсации', enabled: true, type: 'diagram', order: 2, content: 'Основная последовательность: клиент → резерв → риск → оплата → доставка → уведомление. REVIEW требует оператора. DENY освобождает резерв. Неизвестный результат оплаты требует сверки. Отказ доставки после оплаты требует возврата, освобождения резерва и отмены заказа.', diagramEngine: 'mermaid', diagramCode: mainDiagram },
      { id: 'compensation-sequence', title: 'Последовательность компенсации', enabled: true, type: 'diagram', order: 3, content: 'Возврат и освобождение выполняются с прежним compensationId. Ошибка одной из обратных операций сохраняет первопричину и переводит процесс в ручное восстановление.', diagramEngine: 'mermaid', diagramCode: 'sequenceDiagram\n  participant O as Orchestrator\n  participant P as Payment\n  participant I as Inventory\n  participant S as Saga state\n  O->>P: Refund original payment\n  P-->>O: REFUNDED\n  O->>I: Release reservation\n  I-->>O: RELEASED\n  O->>S: Save CANCELLED and original error\n  Note over O,S: Same compensationId for every retry' },
      { id: 'mapping-matrix', title: 'Маппинги и источники полей', enabled: true, type: 'markdown', order: 4, content: '| Источник | Назначение | Правило |\n| --- | --- | --- |\n| Client customer.id | Server customer.external_id | Идентификатор сохраняется |\n| Client items[0].sku | Server lines[0].product_code | Для каждого элемента массива |\n| Client requestedAt | Server requested_at | Asia/Tashkent → UTC ISO |\n| Risk data.assessmentId | Capture assessmentId | Только ALLOW / подтверждение оператора |\n| Capture data.paymentId | Shipment paymentId | Только CAPTURED |\n| Shipment data.tracking.number | Notify variables.trackingNumber | Только CREATED |\n| Saga paymentId | Refund paymentId | Исходная подтверждённая оплата |\n\nJSON clientMappings хранит направление Server → Client независимо от направления фактического HTTP-вызова. Flow mappings используют rowId и fieldPath одной строки; context хранит накопленные значения. Формулы transform — текстовая спецификация, не исполняемый код.' },
      { id: 'error-policy', title: 'Политика ошибок и повторов', enabled: true, type: 'markdown', order: 5, content: 'Ошибки из каталога проекта: 100101 — некорректный запрос; 100301 — ограничение повторов; 100303 — конфликт; 600101 — таймаут; 600104 — неизвестный ответ; 600105 — недоступный downstream; 700101 — внутренняя ошибка. Для BusinessException Server HTTP 422. Wrapper ошибки: error + techData + warnings. externalCode сохраняет исходный код downstream. Таймаут не доказывает отсутствие списания. Не повторять денежную операцию с новым ключом. Не включать токены или персональные данные в текст исключения.' },
      { id: 'acceptance', title: 'Сценарии проверки импорта', enabled: true, type: 'checklist', order: 6, content: '- [ ] Все 11 методов и 3 группы доступны.\n- [ ] Все 3 flow сохраняют узлы, ветви, условия и маппинги.\n- [ ] На обеих сторонах Request/Response видны вложенные массивы и валидации.\n- [ ] Таблицы ошибок сохраняют коды, HTTP statuses и JSON-примеры.\n- [ ] Маскирование персональных полей включено.\n- [ ] Диаграммы Mermaid и их описания отображаются.\n- [ ] Query GET не превращается в body.\n- [ ] Сохранение и повторный импорт сохраняют rowId и ссылки.' },
      { id: 'limitations', title: 'Представление оркестрации в текущей модели', enabled: true, type: 'note', order: 7, content: 'В модели flow допустимы start/method/end/note. Условия ветвления записаны на рёбрах, note хранит контекст или решение; gateway/task не добавлены. Состояние саги в context должно быть накопительным и общим для ветвей. Входные рёбра «Контекст» описывают зависимости данных, а не отдельные безусловные вызовы. Фактический исполнитель должен оценивать условия и использовать снапшот подтверждённых операций. HTTP статусы и сообщения ошибок сохранены в точности по каталогу проекта.' }
    ], flows: [main, compensation, inquiry] };
  const issues = validateCodexProjectImport(payload);
  if (issues.length) throw new Error(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
  const normalized = loadWorkspaceProjectFromPayload(payload);
  if (normalized.methods.length !== methods.length || normalized.flows.length !== 3) throw new Error('Import lost methods or flows');
  const { getValidClientMappings } = await server.ssrLoadModule('/src/requestHeaders.ts');
  for (let index = 0; index < methods.length; index++) {
    for (const original of methods[index].sections.filter(s => s.kind === 'parsed')) {
      const loaded = normalized.methods[index].sections.find(s => s.id === original.id);
      for (const side of ['rows', 'clientRows']) {
        if (json(original[side].map(r => [r.id, r.field, r.example])) !== json(loaded[side].map(r => [r.id, r.field, r.example]))) throw new Error(`Rows changed for ${methods[index].id} ${side}`);
      }
      if (Object.keys(getValidClientMappings(loaded)).length !== Object.keys(original.clientMappings).length) throw new Error(`Mapping loss: ${methods[index].id} ${original.id}`);
    }
  }
  if (!isDeepStrictEqual(payload.flows, JSON.parse(json(normalized.flows)))) throw new Error('Flow references changed during import');
  const dom = new JSDOM('');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const diagrams = [...methods.flatMap(m => m.sections.filter(s => s.kind === 'diagram').flatMap(s => s.diagrams)), ...payload.projectSections.filter(s => s.type === 'diagram').map(s => ({ id: s.id, engine: s.diagramEngine, code: s.diagramCode }))];
    for (const diagram of diagrams) if (diagram.engine === 'mermaid') await mermaid.parse(diagram.code);
    console.log(`Verified ${diagrams.length} Mermaid diagrams, row IDs, renderer mappings and flow references.`);
  } finally { dom.window.close(); }
  const destination = resolve(root, 'docs/ai-import-json/examples/complex-order-saga.json');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${json(payload)}\n`, 'utf8');
  const parsedSections = methods.flatMap(m => m.sections.filter(s => s.kind === 'parsed'));
  const stats = { file: destination, bytes: (await readFile(destination)).length, methods: methods.length, groups: payload.groups.length, flows: payload.flows.length, nodes: payload.flows.reduce((n, f) => n + f.nodes.length, 0), edges: payload.flows.reduce((n, f) => n + f.edges.length, 0), rows: parsedSections.reduce((n, s) => n + s.rows.length + s.clientRows.length, 0), fieldMappings: parsedSections.reduce((n, s) => n + Object.keys(s.clientMappings).length, 0), flowMappings: payload.flows.reduce((n, f) => n + f.edges.reduce((k, e) => k + e.mappings.length, 0), 0), errors: methods.reduce((n, m) => n + m.sections.find(s => s.kind === 'errors').rows.length, 0), diagrams: methods.reduce((n, m) => n + m.sections.find(s => s.kind === 'diagram').diagrams.length, 0) + payload.projectSections.filter(s => s.type === 'diagram').length };
  console.log(json(stats));
} finally { await server.close(); }
