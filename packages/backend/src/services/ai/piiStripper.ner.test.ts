import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { stripPIIAsync } from './piiStripper';

/**
 * NER hook contract — PII_NER_URL unset: pure regex. Set: external call,
 * and EVERY failure mode (timeout, non-200, malformed body) must throw so
 * the caller aborts instead of shipping partially-stripped text.
 */
describe('stripPIIAsync NER hook', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.PII_NER_URL;
    vi.unstubAllGlobals();
  });

  it('runs regex-only when PII_NER_URL is unset', async () => {
    delete process.env.PII_NER_URL;
    const result = await stripPIIAsync('Call me on 9876543210');
    expect(result.strippedText).toBe('Call me on [REDACTED]');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts entity spans returned by the NER service', async () => {
    process.env.PII_NER_URL = 'http://ner.local/entities';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ entities: [{ text: 'Ramesh Kumar' }, { text: 'Sitapur' }] }), { status: 200 }),
    );
    const result = await stripPIIAsync('Ramesh Kumar from Sitapur reported fever');
    expect(result.strippedText).not.toContain('Ramesh Kumar');
    expect(result.strippedText).not.toContain('Sitapur');
    expect(result.categoriesFound).toContain('ner_entity');
  });

  it('still applies regex stripping before the NER call', async () => {
    process.env.PII_NER_URL = 'http://ner.local/entities';
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entities: [] }), { status: 200 }));
    const result = await stripPIIAsync('Phone 9876543210, no name here');
    expect(result.strippedText).toContain('[REDACTED]');
    expect(result.categoriesFound).toContain('phone');
    // NER receives the already-stripped text, never the raw input
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.text).not.toContain('9876543210');
  });

  it('throws on NER timeout (fail closed)', async () => {
    process.env.PII_NER_URL = 'http://ner.local/entities';
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
          );
        }),
    );
    await expect(stripPIIAsync('hello world')).rejects.toThrow();
  });

  it('throws on non-200 NER response (fail closed)', async () => {
    process.env.PII_NER_URL = 'http://ner.local/entities';
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    await expect(stripPIIAsync('hello world')).rejects.toThrow('503');
  });

  it('throws on malformed NER body (fail closed)', async () => {
    process.env.PII_NER_URL = 'http://ner.local/entities';
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(stripPIIAsync('hello world')).rejects.toThrow('malformed');
  });
});
