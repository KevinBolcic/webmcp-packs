/*! webmcp-packs/booking — opening hours, available slots, booking request.
 * data-endpoint="/contact.php" data-services='["Cleaning","Whitening"]' data-slot="30"
 * data-hours='[{"dayOfWeek":["Monday","Tuesday"],"opens":"08:00","closes":"16:00"}]'  (or taken from LocalBusiness JSON-LD)
 * data-availability="/api/slots" (optional; GET ?date=YYYY-MM-DD → ["09:00","09:30"]) */
(function (w, d) {
  var P = w.WebMCPPacks; if (!P) return;
  var cfg = P.config('booking', d.currentScript);
  var endpoint = cfg.endpoint || '/contact.php';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function spec() {
    if (cfg.hours) return cfg.hours;
    var o = P.ldType(['LocalBusiness', 'Dentist', 'MedicalBusiness', 'HealthAndBeautyBusiness', 'Store', 'ProfessionalService', 'Restaurant', 'AutoRepair'])[0];
    return o && o.openingHoursSpecification ? o.openingHoursSpecification : [];
  }
  function hoursFor(dateStr) {
    var dow = DAYS[new Date(dateStr + 'T12:00:00').getDay()];
    var s = [].concat(spec()).filter(function (x) { return [].concat(x.dayOfWeek || []).some(function (dd) { return String(dd).replace(/^.*\//, '') === dow; }); })[0];
    return s ? { opens: s.opens, closes: s.closes } : null;
  }
  function slots(h, step) {
    var out = [], m = toMin(h.opens), end = toMin(h.closes);
    for (; m + step <= end; m += step) out.push(pad(m / 60 | 0) + ':' + pad(m % 60));
    return out;
  }
  function toMin(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  P.register({
    name: 'get_opening_hours', annotations: { readOnlyHint: true },
    description: 'Opening hours of this business per weekday.',
    inputSchema: { type: 'object', properties: {} },
    execute: function () { var s = spec(); return s.length ? { hours: P.hours(s) } : { hours: null, note: 'No published opening hours.' }; }
  });

  P.register({
    name: 'list_available_slots', annotations: { readOnlyHint: true },
    description: 'Possible appointment start times on a given date' + (cfg.availability ? ' (live availability).' : ' (based on opening hours; the business confirms by email).') + (cfg.services ? ' Services: ' + [].concat(cfg.services).join(', ') + '.' : ''),
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, service: { type: 'string' } }, required: ['date'] },
    execute: function (a) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) return { error: 'date must be YYYY-MM-DD' };
      if (cfg.availability) return fetch(cfg.availability + (cfg.availability.indexOf('?') === -1 ? '?' : '&') + 'date=' + a.date + (a.service ? '&service=' + encodeURIComponent(a.service) : '')).then(function (r) { return r.json(); }).then(function (j) { return { date: a.date, slots: j, confirmed: true }; });
      var h = hoursFor(a.date);
      if (!h) return { date: a.date, slots: [], note: 'Closed on that day.' };
      return { date: a.date, slots: slots(h, +cfg.slot || 30), confirmed: false, note: 'Unconfirmed — the business confirms after request_booking.' };
    }
  });

  P.register({
    name: 'request_booking',
    description: 'Request an appointment. Sends a booking request the business confirms by email/phone. Ask the user for consent before sending their details.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
        service: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM' },
        notes: { type: 'string' }, consent: { type: 'boolean' }
      },
      required: ['name', 'email', 'date', 'time', 'consent']
    },
    execute: function (a) {
      if (a.consent !== true) return { sent: false, error: 'consent_required' };
      var msg = 'BOOKING REQUEST\nService: ' + (a.service || '-') + '\nDate: ' + a.date + ' ' + a.time + '\nPhone: ' + (a.phone || '-') + '\nNotes: ' + (a.notes || '-');
      return P.post(endpoint, { name: a.name, email: a.email, phone: a.phone || '', company: '', message: msg, lang: cfg.lang || d.documentElement.lang || 'en', consent: '1', type: 'booking' })
        .then(function (r) { var ok = r.ok && !(r.body && r.body.ok === false); return ok ? { sent: true, status: 'requested', note: 'Not confirmed yet — the business will confirm to ' + a.email + '.' } : { sent: false, status: r.status, error: (r.body && r.body.error) || 'send_failed' }; });
    }
  });
})(window, document);
