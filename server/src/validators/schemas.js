// Zod schemas. Server-side validation is the source of truth; the client has a mirrored copy for UX only.
const { z } = require('zod');
const { STATUSES, COMPLAINT_TYPES } = require('../constants');
const { validateEmailDomain } = require('../utils/emailCheck');

// Treat '' as "not provided" for optional text fields
const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional()
  );

const register = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(120)
      // Blocks placeholder domains (example.com), reserved TLDs and disposable-mailbox services.
      .superRefine((value, ctx) => {
        const message = validateEmailDomain(value);
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }),
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

const verifyEmail = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

const resendCode = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const login = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(72),
});

// The location is NOT free text: it must be a signed token from /geo/search or /geo/reverse.
const createComplaint = z.object({
  locationToken: z
    .string({ required_error: 'Choose a location from the search results', invalid_type_error: 'Choose a location from the search results' })
    .trim()
    .min(1, 'Choose a location from the search results')
    .max(800, 'Choose a location from the search results'),
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

// Marking a complaint Resolved requires a note saying what was actually done.
const updateStatus = z
  .object({
    status: z.enum(STATUSES, { errorMap: () => ({ message: `Status must be one of: ${STATUSES.join(', ')}` }) }),
    resolutionNote: optionalText(500),
  })
  .superRefine((d, ctx) => {
    if (d.status === 'Resolved' && (d.resolutionNote || '').length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolutionNote'],
        message: 'Describe what was fixed (at least 10 characters) before marking this Resolved',
      });
    }
  })
  // The note belongs to a resolution only; ignore it for any other status.
  .transform((d) => (d.status === 'Resolved' ? d : { status: d.status }));

const objectId = (message) => z.string({ required_error: message, invalid_type_error: message }).trim().regex(/^[a-f0-9]{24}$/i, message);

const assignTechnician = z.object({ technicianId: objectId('Choose a technician from the list') });

const technicianName = z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name must be at most 60 characters');
const technicianPhone = z.string().trim().regex(/^(\d{10})?$/, 'Phone must be exactly 10 digits');
const technicianArea = z.string().trim().max(60, 'Area must be at most 60 characters');

const technicianCreate = z.object({ name: technicianName, phone: technicianPhone.optional(), area: technicianArea.optional() });

const technicianUpdate = z
  .object({ name: technicianName.optional(), phone: technicianPhone.optional(), area: technicianArea.optional(), active: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

const technicianIdParam = z.object({ technicianId: objectId('Invalid technician id') });

const imageIdParam = z.object({ imageId: objectId('Invalid image id') });
const complaintImageParams = z.object({
  complaintId: complaintIdParam.shape.complaintId,
  imageId: objectId('Invalid image id'),
});

const geoSearchQuery = z.object({ q: z.string().trim().min(3, 'Type at least 3 characters to search').max(100, 'Search is too long') });
const geoReverseQuery = z.object({
  lat: z.coerce.number({ invalid_type_error: 'Invalid latitude' }).min(-90).max(90),
  lng: z.coerce.number({ invalid_type_error: 'Invalid longitude' }).min(-180).max(180),
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
  verifyEmail,
  resendCode,
  login,
  createComplaint,
  complaintIdParam,
  updateStatus,
  assignTechnician,
  technicianCreate,
  technicianUpdate,
  technicianIdParam,
  imageIdParam,
  complaintImageParams,
  geoSearchQuery,
  geoReverseQuery,
  updateNote,
  adminListQuery,
  exportQuery,
};
