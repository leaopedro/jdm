import { describe, it, expect } from 'vitest';

import { encryptField, decryptField } from '../../src/services/crypto/field-encryption.js';

const TEST_KEY = 'ab'.repeat(32); // 64 hex chars = 32 bytes

describe('field-encryption', () => {
  it('encrypts and decrypts a string', () => {
    const plain = 'Olá, preciso de ajuda com meu ingresso';
    const cipher = encryptField(plain, TEST_KEY);
    expect(cipher).not.toBe(plain);
    expect(cipher.startsWith('v1:')).toBe(true);
    const decrypted = decryptField(cipher, TEST_KEY);
    expect(decrypted).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'same input';
    const a = encryptField(plain, TEST_KEY);
    const b = encryptField(plain, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', () => {
    const cipher = encryptField('test', TEST_KEY);
    const parts = cipher.split(':');
    parts[2] = parts[2].slice(0, -2) + 'ff';
    expect(() => decryptField(parts.join(':'), TEST_KEY)).toThrow();
  });

  it('rejects wrong key', () => {
    const cipher = encryptField('test', TEST_KEY);
    const wrongKey = 'cd'.repeat(32);
    expect(() => decryptField(cipher, wrongKey)).toThrow();
  });

  it('handles empty string', () => {
    const cipher = encryptField('', TEST_KEY);
    expect(decryptField(cipher, TEST_KEY)).toBe('');
  });

  it('handles unicode and emoji', () => {
    const plain = 'Mensagem com acentuação e 🚗';
    const cipher = encryptField(plain, TEST_KEY);
    expect(decryptField(cipher, TEST_KEY)).toBe(plain);
  });

  it('handles max-length input (2000 chars)', () => {
    const plain = 'A'.repeat(2000);
    const cipher = encryptField(plain, TEST_KEY);
    expect(decryptField(cipher, TEST_KEY)).toBe(plain);
  });

  it('returns null for null input', () => {
    expect(decryptField(null, TEST_KEY)).toBeNull();
  });
});
