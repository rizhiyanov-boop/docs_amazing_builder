import { describe, expect, it } from 'vitest';
import { parseCurlMeta, parseJsonSchemaToRows, parseToRows, wrapNonDomainResponseJson } from './parsers';

describe('parsers', () => {
  it('parses nested json to flattened rows', () => {
    const rows = parseToRows('json', '{"id":1,"user":{"name":"Alice"},"items":[{"active":true}]}');

    expect(rows.some((row) => row.field === 'id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.field === 'user' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === 'user.name' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'items' && row.type === 'array_object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0]' && row.type === 'object')).toBe(false);
    expect(rows.some((row) => row.field === 'items[0].active' && row.type === 'boolean')).toBe(true);
  });

  it('keeps quoted numbers as string in json payload', () => {
    const rows = parseToRows('json', '{"externalId":"123","amount":123}');

    expect(rows.some((row) => row.field === 'externalId' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'amount' && row.type === 'int')).toBe(true);
  });

  it('parses xml attributes, repeated elements and text nodes', () => {
    const rows = parseToRows(
      'xml',
      '<request version="1"><items><item id="100"><name>Alice</name></item><item id="101"><name><![CDATA[Bob]]></name></item></items><active>true</active></request>'
    );

    expect(rows.some((row) => row.field === 'request' && row.sourceField === 'request' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === '@version' && row.sourceField === 'request.@version' && row.type === 'int' && row.example === '1')).toBe(true);
    expect(rows.some((row) => row.field === 'items.item[0].@id' && row.sourceField === 'request.items.item[0].@id' && row.type === 'int' && row.example === '100')).toBe(true);
    expect(rows.some((row) => row.field === 'items.item[0].name' && row.sourceField === 'request.items.item[0].name' && row.type === 'string' && row.example === 'Alice')).toBe(true);
    expect(rows.some((row) => row.field === 'items.item[1].@id' && row.sourceField === 'request.items.item[1].@id' && row.type === 'int' && row.example === '101')).toBe(true);
    expect(rows.some((row) => row.field === 'items.item[1].name' && row.sourceField === 'request.items.item[1].name' && row.type === 'string' && row.example === 'Bob')).toBe(true);
    expect(rows.some((row) => row.field === 'active' && row.sourceField === 'request.active' && row.type === 'boolean' && row.example === 'true')).toBe(true);
  });

  it('parses xsd into business message rows instead of schema internals', () => {
    const xsd = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">
  <xs:element name="CustomerInfoRequest">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Header" type="HeaderType"/>
        <xs:element name="Customer" type="CustomerType"/>
        <xs:element name="Tags" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
      </xs:sequence>
      <xs:attribute name="requestId" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="HeaderType">
    <xs:sequence>
      <xs:element name="SourceSystem" type="xs:string"/>
      <xs:element name="RequestDateTime" type="xs:dateTime"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="CustomerType">
    <xs:sequence>
      <xs:element name="CustomerId" type="xs:long"/>
      <xs:element name="IsResident" type="xs:boolean" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;

    const rows = parseToRows('xml', xsd);

    expect(rows.some((row) => row.field === 'xs:schema')).toBe(false);
    expect(rows.some((row) => row.field === 'CustomerInfoRequest' && row.sourceField === 'CustomerInfoRequest' && row.type === 'object')).toBe(true);
    expect(rows.some((row) => row.field === '@requestId' && row.sourceField === 'CustomerInfoRequest.@requestId' && row.required === '+' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'Header.SourceSystem' && row.sourceField === 'CustomerInfoRequest.Header.SourceSystem' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.field === 'Header.RequestDateTime' && row.sourceField === 'CustomerInfoRequest.Header.RequestDateTime' && row.type === 'datetime')).toBe(true);
    expect(rows.some((row) => row.field === 'Customer.CustomerId' && row.sourceField === 'CustomerInfoRequest.Customer.CustomerId' && row.type === 'long')).toBe(true);
    expect(rows.some((row) => row.field === 'Customer.IsResident' && row.sourceField === 'CustomerInfoRequest.Customer.IsResident' && row.required === '-' && row.type === 'boolean')).toBe(true);
    expect(rows.some((row) => row.field === 'Tags' && row.sourceField === 'CustomerInfoRequest.Tags' && row.required === '-' && row.type === 'array')).toBe(true);
  });

  it('parses curl payload, headers and url', () => {
    const curl =
      "curl -X POST \"https://api.example.com/method\" -H \"X-Trace-Id: 123\" -H \"Content-Type: application/json\" --data-raw '{\"id\":123,\"ok\":true}'";

    const rows = parseToRows('curl', curl);

    expect(rows.some((row) => row.source === 'url' && row.example === 'https://api.example.com/method')).toBe(true);
    expect(rows.some((row) => row.source === 'header' && row.field === 'X-Trace-Id')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'ok' && row.type === 'boolean')).toBe(true);
  });

  it('keeps quoted numbers as string in curl json body', () => {
    const curl =
      "curl -X POST \"https://api.example.com/method\" --data-raw '{\"externalId\":\"123\",\"amount\":123}'";

    const rows = parseToRows('curl', curl);

    expect(rows.some((row) => row.source === 'body' && row.field === 'externalId' && row.type === 'string')).toBe(true);
    expect(rows.some((row) => row.source === 'body' && row.field === 'amount' && row.type === 'int')).toBe(true);
  });

  it('extracts curl metadata (method and url)', () => {
    const meta = parseCurlMeta('curl -X PATCH "https://example.com/v1/user/42"');
    expect(meta.method).toBe('PATCH');
    expect(meta.url).toBe('https://example.com/v1/user/42');
  });

  it('defaults curl metadata method to GET without body', () => {
    const meta = parseCurlMeta('curl "https://example.com/v1/items"');
    expect(meta.method).toBe('GET');
  });

  it('defaults curl metadata method to POST when body is present', () => {
    const meta = parseCurlMeta("curl \"https://example.com/v1/items\" --data-raw '{\"id\":1}'");
    expect(meta.method).toBe('POST');
  });

  it('parses url with backslash continuation in curl', () => {
    const rows = parseToRows('curl', "curl \\\n\"https://example.com/v1/items?page=2\"");
    expect(rows.some((row) => row.source === 'url' && row.example === 'https://example.com/v1/items')).toBe(true);
    expect(rows.some((row) => row.source === 'query' && row.field === 'page' && row.example === '2')).toBe(true);
  });

  it('extracts query params from get curl url', () => {
    const curl = 'curl -X GET "https://example.com/v1/items?page=2&search=invoice"';
    const rows = parseToRows('curl', curl);
    const meta = parseCurlMeta(curl);

    expect(meta.method).toBe('GET');
    expect(meta.url).toBe('https://example.com/v1/items');
    expect(rows.some((row) => row.source === 'url' && row.example === 'https://example.com/v1/items')).toBe(true);
    expect(rows.some((row) => row.source === 'query' && row.field === 'page' && row.example === '2')).toBe(true);
    expect(rows.some((row) => row.source === 'query' && row.field === 'search' && row.example === 'invoice')).toBe(true);
  });

  it('throws when input is empty', () => {
    expect(() => parseToRows('json', '   ')).toThrow('Поле ввода пустое');
  });

  it('handles large payload for mvp stability', () => {
    const largeObject: Record<string, number> = {};
    for (let index = 0; index < 1200; index += 1) {
      largeObject[`field_${index}`] = index;
    }

    const rows = parseToRows('json', JSON.stringify(largeObject));
    expect(rows.length).toBe(1200);
    expect(rows[0].origin).toBe('parsed');
  });

  it('parses json schema to flattened rows', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['globId', 'items'],
      properties: {
        globId: { type: 'string', description: 'Global ID' },
        amount: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
              active: { type: 'boolean' }
            }
          }
        }
      }
    });

    const rows = parseJsonSchemaToRows(schema);

    expect(rows.some((row) => row.field === 'globId' && row.type === 'string' && row.required === '+')).toBe(true);
    expect(rows.some((row) => row.field === 'amount' && row.type === 'number' && row.required === '-')).toBe(true);
    expect(rows.some((row) => row.field === 'items' && row.type === 'array_object')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0]' && row.type === 'object')).toBe(false);
    expect(rows.some((row) => row.field === 'items[0].id' && row.type === 'int')).toBe(true);
    expect(rows.some((row) => row.field === 'items[0].active' && row.type === 'boolean')).toBe(true);
  });

  it('uses examples from json schema for flattened rows', () => {
    const schema = JSON.stringify({
      type: 'object',
      examples: [
        {
          globId: 'GLOB-100',
          amount: 2500,
          items: [
            {
              id: 10,
              status: 'ACTIVE'
            }
          ]
        }
      ],
      properties: {
        globId: { type: 'string' },
        amount: { type: 'integer' },
        currency: { type: 'string', examples: ['UZS'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              status: { type: 'string' }
            }
          }
        }
      }
    });

    const rows = parseJsonSchemaToRows(schema);

    expect(rows.find((row) => row.field === 'globId')?.example).toBe('GLOB-100');
    expect(rows.find((row) => row.field === 'amount')?.example).toBe('2500');
    expect(rows.find((row) => row.field === 'currency')?.example).toBe('UZS');
    expect(rows.find((row) => row.field === 'items')?.example).toBe('-');
    expect(rows.find((row) => row.field === 'items[0]')).toBeUndefined();
    expect(rows.find((row) => row.field === 'items[0].id')?.example).toBe('10');
    expect(rows.find((row) => row.field === 'items[0].status')?.example).toBe('ACTIVE');
  });

  it('resolves local json schema refs from $defs', () => {
    const schema = JSON.stringify({
      type: 'array',
      items: {
        $ref: '#/$defs/EmployeeResponse'
      },
      examples: [
        [
          {
            id: 1001,
            account: '22618000900000000001',
            mfo: '00444',
            fio: 'Ivanov Ivan'
          }
        ]
      ],
      $defs: {
        EmployeeResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: {
              type: 'integer',
              format: 'int64'
            },
            account: {
              type: 'string'
            },
            mfo: {
              type: 'string'
            },
            fio: {
              type: 'string'
            }
          }
        }
      }
    });

    const rows = parseJsonSchemaToRows(schema);

    expect(rows.some((row) => row.field === '$')).toBe(false);
    expect(rows.some((row) => row.field === '$[0]')).toBe(false);
    expect(rows.find((row) => row.field === 'id')).toMatchObject({ type: 'long', example: '1001' });
    expect(rows.find((row) => row.field === 'account')).toMatchObject({ type: 'string', example: '22618000900000000001' });
    expect(rows.find((row) => row.field === 'mfo')).toMatchObject({ type: 'string', example: '00444' });
    expect(rows.find((row) => row.field === 'fio')).toMatchObject({ type: 'string', example: 'Ivanov Ivan' });
  });

  it('keeps wrapped response json idempotent', () => {
    const wrappedOnce = wrapNonDomainResponseJson('{"code":"OK"}');
    const wrappedTwice = wrapNonDomainResponseJson(wrappedOnce);

    expect(wrappedTwice).toBe(wrappedOnce);
  });

  it('supports oneOf object branch in json schema', () => {
    const schema = JSON.stringify({
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
            note: { type: 'string' }
          }
        }
      ]
    });

    const rows = parseJsonSchemaToRows(schema);
    expect(rows.some((row) => row.field === 'id' && row.type === 'int' && row.required === '+')).toBe(true);
    expect(rows.some((row) => row.field === 'note' && row.type === 'string')).toBe(true);
  });

  it('supports anyOf array branch in json schema', () => {
    const schema = JSON.stringify({
      anyOf: [
        { type: 'null' },
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' }
            }
          }
        }
      ]
    });

    const rows = parseJsonSchemaToRows(schema);
    expect(rows.some((row) => row.field === '$')).toBe(false);
    expect(rows.some((row) => row.field === 'code' && row.type === 'string')).toBe(true);
  });
});
