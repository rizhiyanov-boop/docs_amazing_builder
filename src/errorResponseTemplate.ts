type BuildErrorResponseParams = {
  code: string;
  message: string;
};

const ERROR_RESPONSE_TECH_DATA = {
  traceId: 'd6c8a977a8f0f543ecc9ce8b80e8ac73',
  spanId: '10fb98db7da8163a',
  appVersion: '1.0.0',
  appTag: '0'
};

const ERROR_RESPONSE_WARNINGS = {
  clientId: 'X-CLIENT-ID is missing in the request headers',
  bpName: 'X-BP-NAME is missing in the request headers',
  sourceSystem: 'X-SOURCE-SYSTEM is missing in the request headers',
  bpId: 'X-BP-ID is missing in the request headers',
  traceparent: 'traceparent is missing in the request headers',
  userId: 'X-USER-ID is missing in the request headers'
};

export function buildServerErrorResponseTemplate({ code, message }: BuildErrorResponseParams): string {
  return JSON.stringify(
    {
      error: {
        code,
        message,
        cause: [],
        externalCode: 'unknown',
        fields: []
      },
      techData: ERROR_RESPONSE_TECH_DATA,
      warnings: ERROR_RESPONSE_WARNINGS
    },
    null,
    2
  );
}
