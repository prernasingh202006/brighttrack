import { describe, expect, it } from 'vitest';
import { complaintIdSchema, complaintSchema, parse, registerSchema } from './schemas';

describe('client validation', () => {
  it('accepts a valid complaint', () => {
    const r = parse(complaintSchema, { location: 'MG Road', type: 'Flickering', description: 'Flickers every night', unsafe: false });
    expect(r.errors).toBeUndefined();
  });

  it('rejects short description and missing type', () => {
    const r = parse(complaintSchema, { location: 'MG Road', type: '', description: 'short', unsafe: false });
    expect(r.errors.description).toBeTruthy();
    expect(r.errors.type).toBe('Choose a problem type');
  });

  it('checks password confirmation and phone', () => {
    const r = parse(registerSchema, { name: 'Asha', email: 'a@b.co', phone: '123', password: 'longenough', confirmPassword: 'different' });
    expect(r.errors.confirmPassword).toBe('Passwords do not match');
    expect(r.errors.phone).toBeTruthy();
  });

  it('normalises complaint ids', () => {
    expect(complaintIdSchema.parse(' bt-ab12c ')).toBe('BT-AB12C');
    expect(complaintIdSchema.safeParse('xyz').success).toBe(false);
  });
});
