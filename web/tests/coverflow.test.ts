import { describe, expect, it } from 'vitest';
import { fanPose, middleIndex } from '../src/lib/coverflow';

describe('fanPose', () => {
  it('faces the pack in the middle straight on, in front of all others', () => {
    expect(fanPose(0)).toEqual({
      transform: 'translateX(0px) translateZ(0px) rotateY(0deg)',
      zIndex: 100,
    });
  });

  it('turns packs on the right towards the left and the other way round', () => {
    expect(fanPose(1).transform).toBe('translateX(0px) translateZ(-110px) rotateY(-58deg)');
    expect(fanPose(-1).transform).toBe('translateX(0px) translateZ(-110px) rotateY(58deg)');
    expect(fanPose(0.5).transform).toBe('translateX(0px) translateZ(-55px) rotateY(-29deg)');
  });

  it('only moves packs further out closer in, so the sides stack up', () => {
    expect(fanPose(3).transform).toBe('translateX(-52px) translateZ(-110px) rotateY(-58deg)');
    expect(fanPose(-3).transform).toBe('translateX(52px) translateZ(-110px) rotateY(58deg)');
  });

  it('puts nearer packs in front of further ones', () => {
    expect(fanPose(0.4).zIndex).toBeGreaterThan(fanPose(1).zIndex);
    expect(fanPose(-1).zIndex).toBeGreaterThan(fanPose(2.5).zIndex);
  });
});

describe('middleIndex', () => {
  it('finds the pack closest to the middle on either side', () => {
    expect(middleIndex([-2.1, -1.1, -0.1, 0.9])).toBe(2);
    expect(middleIndex([-0.6, 0.4])).toBe(1);
    expect(middleIndex([3])).toBe(0);
  });
});
