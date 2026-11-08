import { describe, expect, it } from 'vitest';
import { assignSchema, complaintIdSchema, complaintSchema, parse, registerSchema, resolveSchema, technicianSchema, verifyCodeSchema } from './schemas';

describe('client validation', () => {
  it('accepts a valid complaint', () => {
    const r = parse(complaintSchema, { locationToken: 'signed.token', type: 'Flickering', description: 'Flickers every night', unsafe: false });
    expect(r.errors).toBeUndefined();
  });

  it('rejects short description and missing type', () => {
    const r = parse(complaintSchema, { locationToken: 'signed.token', type: '', description: 'short', unsafe: false });
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

  it('cannot be submitted without a verified place (typed text is not enough)', () => {
    const base = { type: 'Flickering', description: 'Flickers every night', unsafe: false };
    expect(parse(complaintSchema, base).errors.locationToken).toBe('Search for the place and choose it from the list');
    expect(parse(complaintSchema, { ...base, locationToken: '   ' }).errors.locationToken).toBeTruthy();
    expect(parse(complaintSchema, { ...base, locationToken: undefined }).errors.locationToken).toBeTruthy();
  });

  it('requires a technician to be chosen from the list (a 24-character id)', () => {
    expect(parse(assignSchema, { technicianId: '64b7f0c2a1d3e4f5a6b7c8d9' }).errors).toBeUndefined();
    expect(parse(assignSchema, { technicianId: '' }).errors.technicianId).toBe('Choose a technician from the list');
    expect(parse(assignSchema, { technicianId: 'Ramesh' }).errors.technicianId).toBeTruthy();
    expect(parse(assignSchema, {}).errors.technicianId).toBeTruthy();
  });

  it('validates technician details: name needed, phone optional but exactly 10 digits', () => {
    expect(parse(technicianSchema, { name: 'Ramesh Patil', phone: '', area: '' }).errors).toBeUndefined();
    expect(parse(technicianSchema, { name: 'Ramesh Patil', phone: '9876543210', area: 'Bandra' }).errors).toBeUndefined();
    expect(parse(technicianSchema, { name: 'R', phone: '', area: '' }).errors.name).toBeTruthy();
    expect(parse(technicianSchema, { name: 'Ramesh', phone: '12345', area: '' }).errors.phone).toBeTruthy();
    expect(parse(technicianSchema, { name: 'Ramesh', phone: '', area: 'x'.repeat(61) }).errors.area).toBeTruthy();
  });

  it('checks the 6-digit email code', () => {
    expect(parse(verifyCodeSchema, { email: 'a@gmail.com', code: '012345' }).errors).toBeUndefined();
    expect(parse(verifyCodeSchema, { email: 'a@gmail.com', code: ' 012345 ' }).data.code).toBe('012345');
    for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
      expect(parse(verifyCodeSchema, { email: 'a@gmail.com', code }).errors.code).toBe('Enter the 6-digit code from your email');
    }
    expect(parse(verifyCodeSchema, { email: 'nope', code: '123456' }).errors.email).toBeTruthy();
  });

  it('requires a real resolution note before a complaint can be resolved', () => {
    expect(parse(resolveSchema, { resolutionNote: 'Replaced the lamp and tested it.' }).errors).toBeUndefined();
    expect(parse(resolveSchema, { resolutionNote: 'done' }).errors.resolutionNote).toBeTruthy();
    expect(parse(resolveSchema, { resolutionNote: '          ' }).errors.resolutionNote).toBeTruthy();
    expect(parse(resolveSchema, { resolutionNote: 'x'.repeat(501) }).errors.resolutionNote).toBeTruthy();
  });
});
