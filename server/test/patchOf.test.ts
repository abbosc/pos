import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { patchOf } from '../src/lib/validators.js';

describe('patchOf', () => {
  it('leaves fields that are not sent undefined, even with defaults', () => {
    const s = z.object({ a: z.string().default('x'), b: z.boolean().default(false), c: z.number(), n: z.number().nullable().default(null) });
    expect(patchOf(s).parse({ c: 1 })).toEqual({ c: 1 });
    expect(patchOf(s).parse({ n: null, b: true })).toEqual({ n: null, b: true });
    expect(() => patchOf(s).parse({ c: 'no' })).toThrow();
  });
});
