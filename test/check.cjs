// Self-check: load core + packs in a fake DOM, assert tools register with valid schemas and run.
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const registered = [];
const ldBlocks = [JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Do you ship to Italy?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, 2-3 days.' } }] }),
  JSON.stringify({ '@type': 'ProfessionalService', name: 'ACME', telephone: '+386 1 000', openingHoursSpecification: [{ dayOfWeek: ['Monday', 'Tuesday'], opens: '08:00', closes: '12:00' }] })];
const posts = [];
const doc = {
  title: 'ACME site', documentElement: { lang: 'sl' }, head: { appendChild() {} }, currentScript: null,
  modelContext: { registerTool(t) { registered.push(t); return Promise.resolve(); } },
  createElement() { return {}; },
  querySelector() { return null; },
  querySelectorAll(sel) { return sel.indexOf('ld+json') !== -1 ? ldBlocks.map(t => ({ textContent: t })) : []; }
};
const ctx = { window: null, document: doc, navigator: {}, console, location: { origin: 'https://acme.test' }, FormData: class { append() {} },
  fetch: async (url, opts) => { posts.push({ url, opts }); return { ok: true, status: 200, text: async () => '{"ok":true}' }; } };
ctx.window = ctx; ctx.window.WebMCPPacksConfig = { booking: { slot: 60 }, lead: { pricing: [{ tier: 'A', price: '1' }] } };
vm.createContext(ctx);
for (const f of ['core.js', 'packs/site.js', 'packs/lead.js', 'packs/booking.js', 'packs/quote.js', 'packs/restaurant.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
(async () => {
  const names = registered.map(t => t.name);
  assert.deepStrictEqual(names.sort(), ['find_page', 'get_menu', 'get_opening_hours', 'get_opening_hours', 'get_pricing', 'get_site_info', 'list_available_slots', 'list_products', 'list_services', 'request_booking', 'request_product_quote', 'request_quote', 'request_table_reservation', 'search_faq'].sort());
  for (const t of registered) { assert.strictEqual(t.inputSchema.type, 'object', t.name); assert.ok(t.description.length > 20, t.name); JSON.stringify(t.inputSchema); }
  const P = ctx.WebMCPPacks;
  const faq = JSON.parse(await P.call('search_faq', { query: 'shipping italy' })); assert.strictEqual(faq.found, 1);
  const info = JSON.parse(await P.call('get_site_info')); assert.strictEqual(info.name, 'ACME'); assert.strictEqual(info.openingHours.length, 1);
  const slots = JSON.parse(await P.call('list_available_slots', { date: '2026-08-31' })); assert.deepStrictEqual(slots.slots, ['08:00', '09:00', '10:00', '11:00']); // Monday
  const closed = JSON.parse(await P.call('list_available_slots', { date: '2026-08-30' })); assert.strictEqual(closed.slots.length, 0); // Sunday
  const noConsent = JSON.parse(await P.call('request_quote', { name: 'A', email: 'a@b.co', message: 'x' })); assert.strictEqual(noConsent.error, 'consent_required');
  const sent = JSON.parse(await P.call('request_quote', { name: 'A', email: 'a@b.co', message: 'x', consent: true })); assert.strictEqual(sent.sent, true); assert.strictEqual(posts[0].url, '/contact.php');
  const price = JSON.parse(await P.call('get_pricing')); assert.strictEqual(price.pricing[0].tier, 'A');
  console.log('OK', registered.length, 'tools registered, all checks passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
