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

module.exports = { STATUSES, COMPLAINT_TYPES, ROLES };
