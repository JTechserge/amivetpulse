import { describe, test, expect, beforeEach } from 'vitest';
import { signatureKey } from '../../src/signatures.js';
import { store } from '../../src/store.js';
import { isMonthSigned, getSignatureDetail } from '../../src/signatures.js';

describe('signatureKey', () => {
  test('construit la clé correcte', () => {
    expect(signatureKey('carla', 2026, 6)).toBe('carla|2026|6');
  });
  test('mois 0 → clé avec 0', () => {
    expect(signatureKey('david', 2026, 0)).toBe('david|2026|0');
  });
  test('mois 11', () => {
    expect(signatureKey('stephane', 2025, 11)).toBe('stephane|2025|11');
  });
});

describe('isMonthSigned / getSignatureDetail', () => {
  beforeEach(() => {
    store.SIGNATURES.clear();
    store.signatureDetails.clear();
  });

  test('mois non signé → false', () => {
    expect(isMonthSigned('carla', 2026, 6)).toBe(false);
  });

  test('mois signé → true', () => {
    store.SIGNATURES.add(signatureKey('carla', 2026, 6));
    expect(isMonthSigned('carla', 2026, 6)).toBe(true);
  });

  test('mois signé d\'une autre personne → false pour carla', () => {
    store.SIGNATURES.add(signatureKey('david', 2026, 6));
    expect(isMonthSigned('carla', 2026, 6)).toBe(false);
  });

  test('getSignatureDetail sans détail → null', () => {
    expect(getSignatureDetail('carla', 2026, 6)).toBeNull();
  });

  test('getSignatureDetail avec détail enregistré', () => {
    const key = signatureKey('carla', 2026, 6);
    const detail = { signedName: 'Carla D.', signedAt: '2026-07-01T10:00:00Z' };
    store.signatureDetails.set(key, detail);
    expect(getSignatureDetail('carla', 2026, 6)).toEqual(detail);
  });
});
