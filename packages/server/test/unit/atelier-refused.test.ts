import { describe, expect, it } from 'vitest';
import { AtelierError, ATELIER_ERRORS } from '../../src/images/atelier.js';
import { atelierRefused } from '../../src/images/jobs.js';

// An error Atelier answered is shown as «Atelier refused: <its message>», so
// the reader knows which app speaks (atelier-image-provider D10, step 1).

describe('Atelier’s own errors in a job’s sentence', () => {
  it('says Atelier refused, a «This …» message reading on with a small letter', () => {
    const cap = new AtelierError(
      409,
      'cap_reached',
      'This would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month.',
    );
    expect(atelierRefused(cap)).toBe(
      'Atelier refused: this would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month.',
    );
    const busy = new AtelierError(429, 'too_many_running', 'Three generations are already running. Wait for one to finish.');
    expect(atelierRefused(busy)).toBe('Atelier refused: Three generations are already running. Wait for one to finish.');
    // Only «This » is lowered: a word that merely starts so keeps its capital.
    expect(atelierRefused(new AtelierError(400, 'invalid_request', 'Thistle is not a model.'))).toBe(
      'Atelier refused: Thistle is not a model.',
    );
  });

  it('leaves alone what Atelier did not answer itself', () => {
    expect(atelierRefused(new AtelierError(0, 'atelier_unreachable', ATELIER_ERRORS.unreachable))).toBeNull();
    expect(atelierRefused(new AtelierError(200, 'atelier_bad_answer', ATELIER_ERRORS.badAnswer))).toBeNull();
    expect(atelierRefused(new AtelierError(502, 'atelier_refused', ATELIER_ERRORS.refused(502)))).toBeNull();
    expect(atelierRefused(new Error('boom'))).toBeNull();
    expect(atelierRefused('This is not an error')).toBeNull();
  });
});
