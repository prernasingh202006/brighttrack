const crypto = require('crypto');

// Unambiguous alphabet (no 0/O/1/I) so IDs are easy to read out over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateComplaintId() {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `BT-${out}`;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Prevent CSV/Excel formula injection when admins open the export.
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

module.exports = { generateComplaintId, escapeRegex, csvCell };
