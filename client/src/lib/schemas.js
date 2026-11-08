// Client-side validation mirrors the server (which remains the source of truth).
import { z } from 'zod';
import { COMPLAINT_TYPES } from './constants';

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z.string().trim().regex(/^(\d{10})?$/, 'Phone must be exactly 10 digits').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyCodeSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

// The location is not free text: it is a token the server signs for a place found through the address search.
export const complaintSchema = z.object({
  locationToken: z
    .string({ required_error: 'Search for the place and choose it from the list', invalid_type_error: 'Search for the place and choose it from the list' })
    .trim()
    .min(1, 'Search for the place and choose it from the list'),
  pole: z.string().trim().max(30).optional(),
  type: z.enum(COMPLAINT_TYPES, { errorMap: () => ({ message: 'Choose a problem type' }) }),
  description: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(400, 'Keep it under 400 characters'),
  unsafe: z.boolean(),
});

// Admin workflow: choose a technician from the managed list, then resolve with a note saying what was fixed.
export const assignSchema = z.object({
  technicianId: z.string({ required_error: 'Choose a technician from the list' }).trim().regex(/^[a-f0-9]{24}$/i, 'Choose a technician from the list'),
});

export const technicianSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name must be at most 60 characters'),
  phone: z.string().trim().regex(/^(\d{10})?$/, 'Phone must be exactly 10 digits'),
  area: z.string().trim().max(60, 'Area must be at most 60 characters'),
});

export const resolveSchema = z.object({
  resolutionNote: z.string().trim().min(10, 'Describe what was fixed (at least 10 characters)').max(500, 'Keep it under 500 characters'),
});

export const complaintIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^BT-[A-Z0-9]{5}$/, 'Complaint IDs look like BT-AB12C');

/** Returns { data } on success or { errors: { field: message } } on failure. */
export function parse(schema, values) {
  const r = schema.safeParse(values);
  if (r.success) return { data: r.data };
  const errors = {};
  r.error.issues.forEach((i) => {
    const k = i.path.join('.') || '_';
    if (!errors[k]) errors[k] = i.message;
  });
  return { errors };
}
