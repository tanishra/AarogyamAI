import { describe, expect, it } from 'vitest';
import en from './en';
import hi from './hi';

describe('i18n dictionary parity', () => {
  it('en and hi dictionaries contain identical keys', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty-string values in en', () => {
    const empty = Object.entries(en).filter(([, v]) => !v.trim());
    expect(empty).toEqual([]);
  });

  it('no empty-string values in hi', () => {
    const empty = Object.entries(hi).filter(([, v]) => !v.trim());
    expect(empty).toEqual([]);
  });
});
