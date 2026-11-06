const router = require('express').Router();
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/security');
const s = require('../validators/schemas');
const auth = require('../controllers/authController');
const complaints = require('../controllers/complaintController');
const admin = require('../controllers/adminController');

// ---- Auth ----
router.post('/auth/register', registerLimiter, validate(s.register), auth.register);
router.post('/auth/login', loginLimiter, validate(s.login), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, auth.me);

// ---- Complaints: public ----
router.get('/complaints/recent', complaints.recent);
router.get('/complaints/stats', complaints.stats);
router.get('/complaints/track/:complaintId', validate(s.complaintIdParam, 'params'), complaints.track);

// ---- Complaints: authenticated resident (or admin) ----
router.post('/complaints', authenticate, validate(s.createComplaint), complaints.create);
router.get('/complaints/mine', authenticate, complaints.listMine);
router.get('/complaints/mine/:complaintId', authenticate, validate(s.complaintIdParam, 'params'), complaints.getMine);

// ---- Admin only ----
const adminOnly = [authenticate, requireRole('admin')];
router.get('/admin/complaints/export', adminOnly, validate(s.exportQuery, 'query'), admin.exportCsv);
router.get('/admin/complaints', adminOnly, validate(s.adminListQuery, 'query'), admin.list);
router.get('/admin/hotspots', adminOnly, admin.hotspots);
router.patch('/admin/complaints/:complaintId/status', adminOnly, validate(s.complaintIdParam, 'params'), validate(s.updateStatus), admin.updateStatus);
router.patch('/admin/complaints/:complaintId/note', adminOnly, validate(s.complaintIdParam, 'params'), validate(s.updateNote), admin.updateNote);
router.delete('/admin/complaints/:complaintId', adminOnly, validate(s.complaintIdParam, 'params'), admin.remove);

module.exports = router;
