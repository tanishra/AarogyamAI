import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prevent real provider clients from being constructed
vi.mock('../config', () => ({
  config: {
    ai: { provider: 'none', openaiApiKey: undefined, model: 'test-model' },
    aws: { bedrock: { region: 'us-east-1' } },
  },
}));

import { LLMService } from './LLMService';
import { LLMOutputBlockedError, PIIStripError } from '../lib/errors';
import * as piiStripper from './ai/piiStripper';
import * as outputFilter from './ai/outputFilter';

function makeService(): LLMService {
  return new LLMService();
}

/** Stub the private dispatch layer so tests never hit a real provider. */
function stubDispatch(service: LLMService, content = 'Safe advisory response') {
  const dispatch = vi
    .spyOn(service as any, 'dispatch')
    .mockResolvedValue({ content });
  return dispatch;
}

describe('LLMService safety pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('strips PII from messages before dispatching to the provider', async () => {
    const service = makeService();
    const dispatch = stubDispatch(service);

    await service.chat([
      { role: 'user', content: 'My phone is 9876543210 and email is a@b.com' },
    ]);

    const sentMessages = dispatch.mock.calls[0][0] as Array<{ content: string }>;
    expect(sentMessages[0].content).not.toContain('9876543210');
    expect(sentMessages[0].content).not.toContain('a@b.com');
    expect(sentMessages[0].content).toContain('[REDACTED]');
  });

  it('never sends the original unstripped text to the provider', async () => {
    const service = makeService();
    const strip = vi.spyOn(piiStripper, 'stripPII');
    const dispatch = stubDispatch(service);
    const original = 'call me at 9876543210';

    await service.chat([{ role: 'user', content: original }]);

    expect(strip).toHaveBeenCalledWith(original);
    const sentMessages = dispatch.mock.calls[0][0] as Array<{ content: string }>;
    expect(sentMessages[0].content).not.toBe(original);
  });

  it('fails closed when PII stripping throws', async () => {
    const service = makeService();
    const dispatch = stubDispatch(service);
    vi.spyOn(piiStripper, 'stripPII').mockImplementation(() => {
      throw new Error('strip failure');
    });

    await expect(
      service.chat([{ role: 'user', content: 'some text' }])
    ).rejects.toBeInstanceOf(PIIStripError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('blocks unsafe LLM output and throws LLMOutputBlockedError', async () => {
    const service = makeService();
    const dispatch = stubDispatch(
      service,
      'The diagnosis is diabetes and you should take 500mg metformin'
    );

    await expect(
      service.chat([{ role: 'user', content: 'symptoms?' }])
    ).rejects.toBeInstanceOf(LLMOutputBlockedError);
    expect(dispatch).toHaveBeenCalled();
  });

  it('lets safe advisory framing through the filter', async () => {
    const service = makeService();
    stubDispatch(
      service,
      'Consider possible hypertension for physician review'
    );

    const response = await service.chat([
      { role: 'user', content: 'bp is high' },
    ]);
    expect(response.content).toBe(
      'Consider possible hypertension for physician review'
    );
  });

  it('fails closed when the output filter throws', async () => {
    const service = makeService();
    stubDispatch(service, 'anything');
    vi.spyOn(outputFilter, 'filterLLMOutput').mockReturnValue({
      blocked: true,
      text: '',
      matchedCategories: ['filter_error'],
      outputHash: 'x',
    });

    await expect(
      service.chat([{ role: 'user', content: 'hi' }])
    ).rejects.toBeInstanceOf(LLMOutputBlockedError);
  });

  it('patientChat returns a fixed safe fallback when the pipeline fails', async () => {
    const service = makeService();
    stubDispatch(service, 'you should take 500mg aspirin immediately');

    const reply = await service.patientChat([], 'my head hurts');
    expect(reply).not.toContain('aspirin');
    expect(reply).toContain('doctor');
  });

  it('patientChat falls back when the provider itself fails', async () => {
    const service = makeService();
    vi.spyOn(service as any, 'dispatch').mockRejectedValue(
      new Error('provider down')
    );

    const reply = await service.patientChat([], 'hello');
    expect(reply).toContain('doctor');
  });

  it('passes messages with empty content through without stripping', async () => {
    const service = makeService();
    const dispatch = stubDispatch(service);
    const strip = vi.spyOn(piiStripper, 'stripPII');

    await service.chat([{ role: 'assistant', content: '' }]);

    expect(strip).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
  });
});
