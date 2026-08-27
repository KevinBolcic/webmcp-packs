/*! webmcp-packs/restaurant — menu from schema.org Menu JSON-LD (or data-menu JSON URL), hours, table reservation request. */
(function (w, d) {
  var P = w.WebMCPPacks; if (!P) return;
  var cfg = P.config('restaurant', d.currentScript);
  var endpoint = cfg.endpoint || '/contact.php';

  function menuFromLd() {
    var out = [];
    function items(sec, secName) {
      [].concat(sec.hasMenuItem || []).forEach(function (it) {
        out.push({ section: secName || sec.name || null, name: it.name, description: it.description || null, price: it.offers && it.offers.price ? it.offers.price + ' ' + (it.offers.priceCurrency || '') : null });
      });
      [].concat(sec.hasMenuSection || []).forEach(function (s) { items(s, s.name); });
    }
    P.ldType(['Menu']).forEach(function (m) { items(m, null); });
    P.ldType(['Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'BarOrPub']).forEach(function (r) { [].concat(r.hasMenu || []).forEach(function (m) { if (typeof m === 'object') items(m, null); }); });
    return out;
  }

  P.register({
    name: 'get_menu', annotations: { readOnlyHint: true },
    description: 'The restaurant menu with prices, optionally filtered by section (e.g. "pizza", "desserts") or keyword.',
    inputSchema: { type: 'object', properties: { section: { type: 'string' }, query: { type: 'string' } } },
    execute: function (a) {
      var p = cfg.menu ? fetch(cfg.menu).then(function (r) { return r.json(); }) : Promise.resolve(menuFromLd());
      return p.then(function (items) {
        var q = (a.query || a.section || '').toLowerCase();
        if (q) items = items.filter(function (i) { return ((i.section || '') + ' ' + i.name + ' ' + (i.description || '')).toLowerCase().indexOf(q) !== -1; });
        return { count: items.length, items: items.slice(0, 60) };
      });
    }
  });

  P.register({
    name: 'get_opening_hours', annotations: { readOnlyHint: true },
    description: 'Opening hours per weekday.',
    inputSchema: { type: 'object', properties: {} },
    execute: function () { var o = P.ldType(['Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'BarOrPub', 'LocalBusiness'])[0]; return o && o.openingHoursSpecification ? { hours: P.hours(o.openingHoursSpecification) } : { hours: cfg.hours || null }; }
  });

  P.register({
    name: 'request_table_reservation',
    description: 'Request a table reservation (date, time, number of guests). The restaurant confirms by phone or email. Get user consent first.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM' }, guests: { type: 'integer', minimum: 1 }, notes: { type: 'string' }, consent: { type: 'boolean' } }, required: ['name', 'phone', 'date', 'time', 'guests', 'consent'] },
    execute: function (a) {
      if (a.consent !== true) return { sent: false, error: 'consent_required' };
      var msg = 'TABLE RESERVATION\nDate: ' + a.date + ' ' + a.time + '\nGuests: ' + a.guests + '\nPhone: ' + a.phone + '\nNotes: ' + (a.notes || '-');
      return P.post(endpoint, { name: a.name, email: a.email || (cfg.fallbackEmail || 'noreply@example.com'), phone: a.phone, company: '', message: msg, lang: cfg.lang || d.documentElement.lang || 'en', consent: '1', type: 'reservation' })
        .then(function (r) { var ok = r.ok && !(r.body && r.body.ok === false); return ok ? { sent: true, status: 'requested', note: 'Not confirmed yet.' } : { sent: false, status: r.status, error: (r.body && r.body.error) || 'send_failed' }; });
    }
  });
})(window, document);
