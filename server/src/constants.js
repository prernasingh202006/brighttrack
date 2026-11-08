// Shared enums. Keep in sync with client/src/lib/constants.js
const STATUSES = ['Pending', 'In Progress', 'Resolved'];
const COMPLAINT_TYPES = [
  'Not working',
  'Flickering',
  'On during daytime',
  'Damaged pole',
  'Exposed wires',
];
const ROLES = ['resident', 'admin'];

// Complaint photos
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

module.exports = { STATUSES, COMPLAINT_TYPES, ROLES, MAX_IMAGES, MAX_IMAGE_BYTES };
