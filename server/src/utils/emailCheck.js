// Stops obviously fake sign-ups WITHOUT sending any email.
//
//  1. validateEmailDomain(email)  - synchronous: placeholder domains (example.com, test.com ...),
//                                   reserved TLDs (.test, .invalid ...) and throwaway-mailbox services.
//  2. domainCanReceiveMail(domain) - asynchronous DNS check: the domain must exist and accept mail.
//
// Neither check can prove that a specific MAILBOX exists (random123@gmail.com still passes).
// Only sending a confirmation email can do that - see "Known limitations" in the README.
const dns = require('dns').promises;

// Common throwaway-mailbox services. A starter list: extend it, or swap in the
// `disposable-email-domains` npm package for a much larger one.
const DISPOSABLE = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonbox.net', 'burnermail.io',
  'throwawaymail.com', 'discard.email', 'dispostable.com', 'emailondeck.com', 'fakeinbox.com',
  'fakemail.net', 'getairmail.com', 'getnada.com', 'nada.email', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'grr.la',
  'sharklasers.com', 'spam4.me', 'inboxbear.com', 'inboxkitten.com', 'maildrop.cc',
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailnesia.com', 'mailcatch.com',
  'mailtemp.info', 'mintemail.com', 'moakt.com', 'mohmal.com', 'mytemp.email',
  'nowmymail.com', 'spamgourmet.com', 'tempail.com', 'tempinbox.com', 'temp-mail.org',
  'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempmailaddress.com',
  'tempr.email', 'throwam.com', 'tmail.ws', 'tmpmail.net', 'tmpmail.org', 'trashmail.com',
  'trashmail.net', 'trashmail.de', 'trashmail.io', 'trash-mail.com', 'yopmail.com',
  'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.org', 'mailforspam.com', 'mailnull.com',
  'mytrashmail.com', 'mt2015.com', 'spambox.us', 'spamex.com', 'wegwerfmail.de', 'wegwerfmail.net',
  'emailfake.com', 'fakemailgenerator.com', 'generator.email', 'harakirimail.com', 'mailpoof.com',
  'linshiyouxiang.net', 'luxusmail.org', 'one-time.email', 'owlymail.com', 'minuteinbox.com',
  'dropmail.me', 'emltmp.com', 'tmailor.com', 'mail.tm', 'etranquil.com',
  'bccto.me', 'binkmail.com', 'safetymail.info', 'sogetthis.com', 'trbvm.com', 'vomoto.com',
]);

// Placeholder / documentation domains that no real person uses.
const PLACEHOLDER = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu', 'test.com', 'test.org', 'test.net',
  'domain.com', 'yourdomain.com', 'yourmail.com', 'youremail.com', 'sample.com', 'fake.com',
  'fakemail.com', 'noemail.com', 'nomail.com', 'none.com', 'email.test', 'mail.test',
]);

// Reserved by RFC 2606 / 6761 / 6762: can never be real public mailboxes.
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost', 'local', 'internal', 'lan', 'home', 'corp']);

const MSG_DISPOSABLE = 'Temporary or disposable email addresses are not allowed. Use your real email.';
const MSG_PLACEHOLDER = 'Enter your real email address. This domain is not valid for sign-up.';
const MSG_NO_MAIL = 'That email domain cannot receive mail. Check the spelling after the @.';

/** Domain part of an address (lower-case), or '' if there is no @. */
function domainOf(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  return at === -1 ? '' : s.slice(at + 1);
}

// "a.b.mailinator.com" -> ["a.b.mailinator.com", "b.mailinator.com", "mailinator.com", "com"]
function suffixes(domain) {
  const parts = domain.split('.');
  return parts.map((_, i) => parts.slice(i).join('.'));
}

/** Returns an error message, or null when the address is acceptable. Never throws. */
function validateEmailDomain(email) {
  const domain = domainOf(email);
  if (!domain) return null; // format problems are reported by the normal email validator
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (RESERVED_TLDS.has(tld)) return MSG_PLACEHOLDER;
  const chain = suffixes(domain);
  if (chain.some((d) => PLACEHOLDER.has(d))) return MSG_PLACEHOLDER;
  if (chain.some((d) => DISPOSABLE.has(d))) return MSG_DISPOSABLE;
  return null;
}

// Only these mean "this domain definitely has no such record". Anything else
// (timeout, SERVFAIL, no network) is treated as "unknown" so a DNS hiccup never blocks a real user.
const DEFINITIVE = new Set(['ENOTFOUND', 'ENODATA']);

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * True when the domain can receive mail (has a usable MX record, or falls back to A/AAAA per RFC 5321).
 * False only when DNS definitively says it cannot. Fails OPEN on timeouts and other DNS errors.
 * `resolver` is injectable so tests do not need the network.
 */
async function domainCanReceiveMail(domain, { resolver = dns, timeoutMs = 3000 } = {}) {
  // 1. MX records
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), timeoutMs);
    // A lone "." MX is the explicit "this domain accepts no mail" record (RFC 7505).
    if (mx.length > 0) return mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (err) {
    if (!DEFINITIVE.has(err.code)) return true; // unknown -> do not block the user
  }
  // 2. No MX: mail falls back to the domain's own address record
  for (const lookup of ['resolve4', 'resolve6']) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const addrs = await withTimeout(resolver[lookup](domain), timeoutMs);
      if (addrs.length > 0) return true;
    } catch (err) {
      if (!DEFINITIVE.has(err.code)) return true;
    }
  }
  return false;
}

module.exports = { validateEmailDomain, domainCanReceiveMail, domainOf, MSG_NO_MAIL };
