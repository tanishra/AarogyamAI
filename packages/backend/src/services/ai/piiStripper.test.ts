import { describe, expect, it } from 'vitest';

import { stripPII } from './piiStripper';

describe('stripPII', () => {
  it('redacts Indian mobile numbers', () => {
    const result = stripPII('Call me on 9876543210 anytime');
    expect(result.strippedText).toBe('Call me on [REDACTED] anytime');
    expect(result.categoriesFound).toContain('phone');
    expect(result.wasModified).toBe(true);
  });

  it('redacts phone numbers with +91 prefix', () => {
    const result = stripPII('Reach me at +91 9876543210');
    expect(result.strippedText).not.toContain('9876543210');
    expect(result.categoriesFound).toContain('phone');
  });

  it('redacts email addresses', () => {
    const result = stripPII('My email is patient@example.com please');
    expect(result.strippedText).toBe('My email is [REDACTED] please');
    expect(result.categoriesFound).toContain('email');
  });

  it('redacts Aadhaar numbers', () => {
    const result = stripPII('Aadhaar: 1234 5678 9012');
    expect(result.strippedText).toBe('Aadhaar: [REDACTED]');
    expect(result.categoriesFound).toContain('aadhaar');
  });

  it('redacts PAN numbers', () => {
    const result = stripPII('PAN is ABCDE1234F thanks');
    expect(result.strippedText).toBe('PAN is [REDACTED] thanks');
    expect(result.categoriesFound).toContain('pan');
  });

  it('redacts DOB in dd/mm/yyyy format', () => {
    const result = stripPII('Born on 15/08/1990');
    expect(result.strippedText).toBe('Born on [REDACTED]');
    expect(result.categoriesFound).toContain('dob');
  });

  it('redacts names with honorific prefixes', () => {
    const result = stripPII('I am Dr Sharma and patient is Mrs Gupta');
    expect(result.strippedText).not.toContain('Dr Sharma');
    expect(result.categoriesFound).toContain('name_prefix');
  });

  it('redacts address fragments', () => {
    const result = stripPII('I live at flat 203 sunrise tower');
    expect(result.categoriesFound).toContain('address');
  });

  it('returns unmodified text with no PII', () => {
    const text = 'Chest pain for two days, worse with exertion';
    const result = stripPII(text);
    expect(result.strippedText).toBe(text);
    expect(result.categoriesFound).toHaveLength(0);
    expect(result.wasModified).toBe(false);
  });

  it('produces a stable sha256 input hash', () => {
    const a = stripPII('some text');
    const b = stripPII('some text');
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('finds multiple PII categories in one text', () => {
    const result = stripPII('I am Mr Patel, email patel@test.in, phone 9876543210');
    expect(result.categoriesFound).toContain('phone');
    expect(result.categoriesFound).toContain('email');
    expect(result.categoriesFound).toContain('name_prefix');
  });

  it('throws on empty input', () => {
    expect(() => stripPII('')).toThrow();
  });
});
