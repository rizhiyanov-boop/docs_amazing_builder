import { describe, expect, it } from 'vitest';
import { createParameterRenameContext, mappingsAfterSourceSync, renameParameter } from './parameterRename';
import { getMappedClientField, getParsedRowKey, getRequestRows } from './requestHeaders';
import { makeParsedRow, makeRequestSection } from './test/fixtures';

const row = (field: string, type = 'string') => makeParsedRow({ field, sourceField: field, type, description: field, maskInLogs: true });

describe('parameter rename', () => {
  it('renames one leaf while protecting its parent and source key', () => {
    const section = makeRequestSection({ rows: [row('customer', 'object'), row('customer.name')] });
    const result = renameParameter(createParameterRenameContext(section, 'server'), 'customer.name', 'fullName');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[1]).toEqual({ ...section.rows[1], field: 'customer.fullName' });
    expect(result.rows[0]).toBe(section.rows[0]);
    expect(result.changedCount).toBe(1);
  });

  it('cascades across objects and nested arrays without touching similar prefixes or headers', () => {
    const section = makeRequestSection({ rows: [row('customer', 'object'), row('customer.orders', 'array_object'),
      row('customer.orders[0].amount'), row('customer.orders[0].lines', 'array_object'), row('customer.orders[0].lines[0].id'),
      row('customerInfo.id'), { ...row('customer.name'), source: 'header' }] });
    const result = renameParameter(createParameterRenameContext(section, 'server'), 'customer', 'buyer');
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.map(r => r.field)).toEqual(['buyer', 'buyer.orders', 'buyer.orders[0].amount', 'buyer.orders[0].lines', 'buyer.orders[0].lines[0].id', 'customerInfo.id', 'customer.name']);
    expect(result.descendantCount).toBe(4);
    expect(result.rows.map(getParsedRowKey)).toEqual(section.rows.map(getParsedRowKey));
    expect(section.rows[0].field).toBe('customer');
  });

  it('renames an array container and leaves anonymous array elements uneditable', () => {
    const section = makeRequestSection({ rows: [row('orders', 'array'), row('orders[0]'), row('orders[0].id'), row('$', 'array')] });
    const context = createParameterRenameContext(section, 'server');
    expect(context.names.get('orders[0]')?.editable).toBe(false);
    expect(context.names.get('$')?.editable).toBe(false);
    const result = renameParameter(context, 'orders', 'purchases');
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.map(r => r.field)).toEqual(['purchases', 'purchases[0]', 'purchases[0].id', '$']);
  });

  it('rejects sibling and descendant collisions atomically, but allows names in different parents', () => {
    const section = makeRequestSection({ rows: [row('customer', 'object'), row('customer.id'), row('customer.name'), row('client.id')] });
    const context = createParameterRenameContext(section, 'server');
    expect(renameParameter(context, 'customer.name', 'id').ok).toBe(false);
    expect(renameParameter(context, 'customer', 'client').ok).toBe(false);
    expect(renameParameter(context, 'customer.name', 'reference').ok).toBe(true);
    expect(section.rows[0].field).toBe('customer');
  });

  it('rejects empty names and path insertion without restricting ordinary JSON property characters', () => {
    const context = createParameterRenameContext(makeRequestSection({ rows: [row('customer.name')] }), 'server');
    for (const name of ['', ' ', 'other.name', 'name[1]']) expect(renameParameter(context, 'customer.name', name).ok).toBe(false);
    expect(renameParameter(context, 'customer.name', 'имя клиента-@:$')).toMatchObject({ ok: true });
    expect(renameParameter(context, 'customer.name', 'name')).toMatchObject({ ok: true, changedCount: 0 });
  });

  it('treats headers and query names as literal names, not nested paths', () => {
    const section = makeRequestSection({ rows: [{ ...row('customer.name'), source: 'query' }, row('customer.id')] });
    const context = createParameterRenameContext(section, 'server');
    expect(context.names.get('customer.name')).toMatchObject({ prefix: '', name: 'customer.name', structured: false });
    expect(renameParameter(context, 'customer.name', 'filter.name')).toMatchObject({ ok: true, rows: [{ field: 'filter.name' }, { field: 'customer.id' }] });
  });

  it('refuses ambiguous literal dotted keys in JSON and schema rather than guessing a hierarchy', () => {
    for (const source of [
      { input: '{"customer":{"first.name":"Ann"}}' },
      { schemaInput: '{"type":"object","properties":{"customer":{"properties":{"first.name":{"type":"string"}}}}}' },
      { format: 'curl' as const, input: 'curl -X POST https://example.com --data-raw \'{"customer":{"first.name":"Ann"}}\'' }
    ]) {
      const section = makeRequestSection({ rows: [row('customer', 'object'), row('customer.first.name')], ...source });
      const context = createParameterRenameContext(section, 'server');
      expect(context.names.get('customer.first.name')?.editable).toBe(false);
      expect(renameParameter(context, 'customer', 'buyer').ok).toBe(false);
    }
  });

  it('keeps client mappings stable for legacy manual rows without source keys', () => {
    const section = makeRequestSection({ rows: [{ ...row('customer', 'object'), origin: 'manual', sourceField: undefined },
      { ...row('customer.id'), origin: 'manual', sourceField: undefined }],
      clientRows: [{ ...row('request', 'object'), sourceField: undefined }, { ...row('request.key'), sourceField: undefined }],
      clientMappings: { 'customer.id': 'request.key' } });
    const server = renameParameter(createParameterRenameContext(section, 'server'), 'customer', 'buyer');
    if (!server.ok) throw new Error(server.error);
    const next = { ...section, rows: server.rows };
    const client = renameParameter(createParameterRenameContext(next, 'client'), 'request', 'payload');
    if (!client.ok) throw new Error(client.error);
    const final = { ...next, clientRows: client.rows };
    expect(getMappedClientField(final, final.rows[1])).toBe('request.key');
    expect(getRequestRows(final).find(r => r.field === 'buyer.id')?.clientField).toBe('payload.key');
    expect(final.clientMappings).toBe(section.clientMappings);
    expect(final.input).toBe(section.input);
    const serverSynced = { ...final, clientMappings: mappingsAfterSourceSync(final, 'server'),
      rows: final.rows.map(item => ({ ...item, sourceField: item.field })) };
    const bothSynced = { ...serverSynced, clientMappings: mappingsAfterSourceSync(serverSynced, 'client'),
      clientRows: final.clientRows.map(item => ({ ...item, sourceField: item.field })) };
    expect(getMappedClientField(bothSynced, bothSynced.rows[1])).toBe('payload.key');
    expect(bothSynced.clientMappings).toEqual({ 'buyer.id': 'payload.key' });
  });

  it('protects XML attribute and namespace markers and leaves text nodes read only', () => {
    const section = makeRequestSection({ format: 'xml', rows: [row('person', 'object'), row('person.@ns:id'), row('person.#text')] });
    const context = createParameterRenameContext(section, 'server');
    expect(context.names.get('person.@ns:id')).toMatchObject({ prefix: 'person.@ns:', name: 'id' });
    expect(context.names.get('person.#text')?.editable).toBe(false);
    const result = renameParameter(context, 'person.@ns:id', 'номер');
    if (!result.ok) throw new Error(result.error);
    expect(result.rows[1].field).toBe('person.@ns:номер');
  });
});
