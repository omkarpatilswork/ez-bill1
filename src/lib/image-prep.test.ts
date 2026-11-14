import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_EDGE } from './image-prep';

describe('fitWithin', () => {
  it('shrinks a phone photo to the limit on its long side, keeping the shape', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: MAX_EDGE });
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1500 });
  });
  it('scales a very tall image by its long side', () => {
    expect(fitWithin(1000, 6000)).toEqual({ width: 333, height: 2000 });
  });
  it('never enlarges a small image', () => {
    expect(fitWithin(800, 1200)).toEqual({ width: 800, height: 1200 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });
});
