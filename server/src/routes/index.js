const express = require('express');

const router = express.Router();
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { loginLimiter, registerLimiter, verifyLimiter, resendLimiter, geoLimiter, uploadLimiter } = require('../middleware/security');
const s = require('../validators/schemas');
const auth = require('../controllers/authController');
const complaints = require('../controllers/complaintController');
const admin = require('../controllers/adminController');
const technicians = require('../controllers/technicianController');
const geo = require('../controllers/geoController');
const images = require('../controllers/imageController');

// Photos are uploaded as raw image bytes (no multipart library needed). Bounded at 2 MB.
const imageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' });

// ---- Auth ----
router.post('/auth/register', registerLimiter, validate(s.register), auth.register);
router.post('/auth/verify-email', verifyLimiter, validate(s.verifyEmail), auth.verifyEmail);
router.post('/auth/resend-code', resendLimiter, validate(s.resendCode), auth.resendCode);
router.post('/auth/login', loginLimiter, validate(s.login), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, auth.me);

// ---- Real-place lookup (login required, so the shared public geocoder cannot be abused anonymously) ----
router.get('/geo/search', authenticate, geoLimiter, validate(s.geoSearchQuery, 'query'), geo.search);
router.get('/geo/reverse', authenticate, geoLimiter, validate(s.geoReverseQuery, 'query'), geo.reverse);

// ---- Complaints: public ----
router.get('/complaints/recent', complaints.recent);
router.get('/complaints/stats', complaints.stats);
router.get('/complaints/track/:complaintId', validate(s.complaintIdParam, 'params'), complaints.track);

// ---- Complaints: authenticated resident (or admin) ----
router.post('/complaints', authenticate, validate(s.createComplaint), complaints.create);
router.get('/complaints/mine', authenticate, complaints.listMine);
router.get('/complaints/mine/:complaintId', authenticate, validate(s.complaintIdParam, 'params'), complaints.getMine);

// ---- Photos: owner (or admin) only ----
router.post('/complaints/:complaintId/images', authenticate, uploadLimiter, validate(s.complaintIdParam, 'params'), imageBody, images.upload);
router.delete('/complaints/:complaintId/images/:imageId', authenticate, validate(s.complaintImageParams, 'params'), images.remove);
router.get('/images/:imageId', authenticate, validate(s.imageIdParam, 'params'), images.get);

// ---- Admin only ----
const adminOnly = [authenticate, requireRole('admin')];
router.get('/admin/complaints/export', adminOnly, validate(s.exportQuery, 'query'), admin.exportCsv);
router.get('/admin/complaints', adminOnly, validate(s.adminListQuery, 'query'), admin.list);
router.get('/admin/hotspots', adminOnly, admin.hotspots);
router.get('/admin/technicians', adminOnly, technicians.list);
router.post('/admin/technicians', adminOnly, validate(s.technicianCreate), technicians.create);
router.patch('/admin/technicians/:technicianId', adminOnly, validate(s.technicianIdParam, 'params'), validate(s.technicianUpdate), technicians.update);
router.patch('/admin/complaints/:complaintId/status', adminOnly, validate(s.complaintIdParam, 'params'), validate(s.updateStatus), admin.updateStatus);
router.patch('/admin/complaints/:complaintId/assign', adminOnly, validate(s.complaintIdParam, 'params'), validate(s.assignTechnician), admin.assign);
router.patch('/admin/complaints/:complaintId/note', adminOnly, validate(s.complaintIdParam, 'params'), validate(s.updateNote), admin.updateNote);
router.delete('/admin/complaints/:complaintId', adminOnly, validate(s.complaintIdParam, 'params'), admin.remove);

module.exports = router;
