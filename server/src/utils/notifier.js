// FUTURE SCOPE HOOK: email / SMS notifications.
// Controllers emit domain events; to add notifications, register a listener here
// (e.g. send an email when 'complaint.statusChanged' fires). Nothing is sent today.
const { EventEmitter } = require('events');
const logger = require('./logger');

const events = new EventEmitter();

events.on('complaint.created', (c) => logger.info({ complaintId: c.complaintId }, 'complaint created'));
events.on('complaint.assigned', (c, previous) =>
  logger.info({ complaintId: c.complaintId, assignedTo: c.assignedTo, previous }, 'complaint assigned')
);
events.on('complaint.statusChanged', (c, from, to) =>
  logger.info({ complaintId: c.complaintId, from, to }, 'complaint status changed')
);

module.exports = events;
