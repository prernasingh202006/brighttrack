import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_SIDE } from './image';

describe('fitWithin (photo shrinking)', () => {
  it('shrinks a large landscape photo so the long side is 1600 px, keeping the shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it('shrinks a large portrait photo the same way', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_SIDE, 100)).toEqual({ width: MAX_SIDE, height: 100 });
  });

  it('never returns a zero-sized image, even for extreme panoramas', () => {
    const out = fitWithin(30000, 5);
    expect(out.width).toBe(1600);
    expect(out.height).toBeGreaterThan(0);
  });
});
