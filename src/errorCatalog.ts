export type ErrorCatalogItem = {
  httpStatus: string;
  internalCode: string;
  message: string;
};

export const POPULAR_HTTP_STATUS_CODES = [
  '400',
  '401',
  '403',
  '404',
  '405',
  '409',
  '413',
  '415',
  '422',
  '423',
  '429',
  '500',
  '501',
  '502',
  '503',
  '504'
];

export const ERROR_CATALOG: ErrorCatalogItem[] = [
  { httpStatus: '400', internalCode: '100101', message: 'Bad request sent to the system' },
  { httpStatus: '415', internalCode: '100102', message: 'Unsupported media type' },
  { httpStatus: '429', internalCode: '100301', message: 'Identical request was sent within restricted time window' },
  { httpStatus: '409', internalCode: '100303', message: 'Conflict occurred' },
  { httpStatus: '405', internalCode: '100305', message: 'Method not allowed' },
  { httpStatus: '401', internalCode: '200101', message: 'Unauthorized' },
  { httpStatus: '403', internalCode: '300101', message: 'Insufficient permissions to perform this action' },
  { httpStatus: '-', internalCode: '400101', message: '-' },
  { httpStatus: '404', internalCode: '400201', message: 'Resource not found' },
  { httpStatus: '409', internalCode: '500101', message: 'Conflicted row in database' },
  { httpStatus: '500', internalCode: '500301', message: 'Lost connection to the database' },
  { httpStatus: '504', internalCode: '600101', message: 'Timeout occurred while calling external service' },
  { httpStatus: '504', internalCode: '600102', message: 'Read timeout occurred while calling external service' },
  { httpStatus: '502', internalCode: '600104', message: 'External service returned unknown response' },
  { httpStatus: '503', internalCode: '600105', message: 'External service is currently unavailable' },
  { httpStatus: '401', internalCode: '600201', message: 'Unauthorized response from external system' },
  { httpStatus: '403', internalCode: '600202', message: 'Forbidden response from external system' },
  { httpStatus: '400', internalCode: '600301', message: 'Bad request sent to external system' },
  { httpStatus: '429', internalCode: '600302', message: 'External conflict occurred' },
  { httpStatus: '409', internalCode: '600303', message: 'External identical request was sent within restricted time window' },
  { httpStatus: '404', internalCode: '600304', message: 'External resource not found' },
  { httpStatus: '405', internalCode: '600305', message: 'External method not allowed' },
  { httpStatus: '415', internalCode: '600306', message: 'External not acceptable' },
  { httpStatus: '413', internalCode: '600307', message: 'External payload too large' },
  { httpStatus: '423', internalCode: '600308', message: 'External service locked' },
  { httpStatus: '500', internalCode: '700101', message: 'Internal server error occurred' },
  { httpStatus: '500', internalCode: '700103', message: 'An I/O error occurred' },
  { httpStatus: '503', internalCode: '700104', message: 'Internal service is currently unavailable' },
  { httpStatus: '500', internalCode: '700105', message: 'Error occurred while parsing json' },
  { httpStatus: '501', internalCode: '700106', message: 'Method not implemented' }
];

export const ERROR_CATALOG_BY_CODE = new Map(ERROR_CATALOG.map((item) => [item.internalCode, item]));
