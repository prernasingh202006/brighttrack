const { validateEmailDomain, domainCanReceiveMail } = require('../src/utils/emailCheck');

const dnsError = (code) => async () => {
  const e = new Error(code);
  e.code = code;
  throw e;
};
const resolver = ({ mx = dnsError('ENODATA'), a = dnsError('ENODATA'), aaaa = dnsError('ENODATA') } = {}) => ({
  resolveMx: mx,
  resolve4: a,
  resolve6: aaaa,
});

describe('validateEmailDomain', () => {
  test.each(['asha@gmail.com', 'asha@outlook.co.in', 'a@my-company.org', 'a@notmailinator.com'])('accepts %s', (email) => {
    expect(validateEmailDomain(email)).toBeNull();
  });

  test.each([
    ['a@mailinator.com', /disposable/i],
    ['a@sub.mailinator.com', /disposable/i],
    ['A@YOPMAIL.COM', /disposable/i],
    ['a@example.com', /real email/i],
    ['a@mail.example.org', /real email/i],
    ['a@something.test', /real email/i],
    ['a@brighttrack.local', /real email/i],
  ])('rejects %s', (email, message) => {
    expect(validateEmailDomain(email)).toMatch(message);
  });

  test('never throws on malformed input (format errors belong to the normal validator)', () => {
    expect(validateEmailDomain('nope')).toBeNull();
    expect(validateEmailDomain('')).toBeNull();
    expect(validateEmailDomain(undefined)).toBeNull();
  });
});

describe('domainCanReceiveMail', () => {
  test('true for a domain with MX records', async () => {
    const r = resolver({ mx: async () => [{ exchange: 'smtp.google.com', priority: 10 }] });
    expect(await domainCanReceiveMail('gmail.com', { resolver: r })).toBe(true);
  });

  test('true when there is no MX but the domain has an address record (RFC 5321 fallback)', async () => {
    const r = resolver({ a: async () => ['203.0.113.7'] });
    expect(await domainCanReceiveMail('small-site.in', { resolver: r })).toBe(true);
  });

  test('false when the domain does not exist', async () => {
    const r = resolver({ mx: dnsError('ENOTFOUND'), a: dnsError('ENOTFOUND'), aaaa: dnsError('ENOTFOUND') });
    expect(await domainCanReceiveMail('gmial-typo.zz', { resolver: r })).toBe(false);
  });

  test('false for a null-MX domain that explicitly refuses mail', async () => {
    const r = resolver({ mx: async () => [{ exchange: '', priority: 0 }] });
    expect(await domainCanReceiveMail('no-mail.example', { resolver: r })).toBe(false);
  });

  test('fails open when DNS itself is broken, so a resolver outage never blocks real users', async () => {
    expect(await domainCanReceiveMail('x.com', { resolver: resolver({ mx: dnsError('ESERVFAIL') }) })).toBe(true);
    expect(await domainCanReceiveMail('x.com', { resolver: resolver({ mx: dnsError('ECONNREFUSED') }) })).toBe(true);
  });

  test('fails open on timeout', async () => {
    const hang = () => new Promise(() => {});
    expect(await domainCanReceiveMail('x.com', { resolver: resolver({ mx: hang }), timeoutMs: 50 })).toBe(true);
  });
});
