// Zod schemas. Server-side validation is the source of truth; the client has a mirrored copy for UX only.
const { z } = require('zod');
const { STATUSES, COMPLAINT_TYPES } = require('../constants');

// Treat '' as "not provided" for optional text fields
const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional()
  );

const register = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
    phone: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().regex(/^\d{10}$/, 'Phone must be exactly 10 digits').optional()
    ),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const login = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(72),
});

const createComplaint = z.object({
  location: z.string().trim().min(3, 'Location must be at least 3 characters').max(120),
  pole: optionalText(30),
  type: z.enum(COMPLAINT_TYPES, { errorMap: () => ({ message: 'Choose a problem type' }) }),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(400, 'Description must be at most 400 characters'),
  unsafe: z.boolean().default(false),
});

const complaintIdParam = z.object({
  complaintId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BT-[A-Z0-9]{5}$/, 'Complaint ID looks like BT-AB12C'),
});

const updateStatus = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: `Status must be one of: ${STATUSES.join(', ')}` }) }),
});

const updateNote = z.object({
  note: z.string().trim().max(500, 'Note must be at most 500 characters'),
});

const adminListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  unsafe: z.enum(['true', 'false']).optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'status', 'location']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const exportQuery = adminListQuery.pick({ search: true, status: true, unsafe: true });

module.exports = {
  register,
  login,
  createComplaint,
  complaintIdParam,
  updateStatus,
  updateNote,
  adminListQuery,
  exportQuery,
};
