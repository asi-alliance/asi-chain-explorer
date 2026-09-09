import { getBlockPath } from './blockPath';

describe('getBlockPath', () => {
  it('uses the unique block hash when available', () => {
    expect(getBlockPath('abc123', 42)).toBe('/block/hash/abc123');
  });

  it('keeps block-number URLs as a legacy fallback', () => {
    expect(getBlockPath(undefined, 42)).toBe('/block/42');
  });
});
