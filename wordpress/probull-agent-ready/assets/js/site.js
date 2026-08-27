/*! webmcp-packs/site — zero-config tools built from the page's own JSON-LD + navigation. */
(function (w, d) {
  var P = w.WebMCPPacks; if (!P) return;
  var cfg = P.config('site', d.currentScript);
  var ro = { readOnlyHint: true };

  function org() {
    return P.ldType(['Organization', 'LocalBusiness', 'ProfessionalService', 'Store', 'Restaurant', 'Dentist', 'MedicalBusiness', 'AutoRepair', 'LegalService', 'HomeAndConstructionBusiness', 'Hotel', 'LodgingBusiness'])[0] || null;
  }
  function meta(n) { var e = d.querySelector('meta[name="' + n + '"]'); return e ? e.content : ''; }

  P.register({
    name: 'get_site_info', annotations: ro,
    description: 'Who runs this website: business name, what they do, contact details, address, opening hours. Use first when the user asks what this site/company is or how to reach them.',
    inputSchema: { type: 'object', properties: {} },
    execute: function () {
      var o = org() || {};
      var tel = d.querySelector('a[href^="tel:"]'), mail = d.querySelector('a[href^="mailto:"]');
      return {
        name: o.name || cfg.name || d.title,
        description: o.description || meta('description'),
        url: o.url || location.origin,
        email: o.email || (mail ? mail.getAttribute('href').replace(/^mailto:/, '').split('?')[0] : cfg.email || null),
        telephone: o.telephone || (tel ? tel.getAttribute('href').replace(/^tel:/, '') : cfg.telephone || null),
        address: o.address || cfg.address || null,
        openingHours: o.openingHoursSpecification ? P.hours(o.openingHoursSpecification) : (cfg.hours || null),
        languages: d.documentElement.lang || null
      };
    }
  });

  P.register({
    name: 'search_faq', annotations: ro,
    description: 'Search this site\'s frequently asked questions. Returns the best matching questions with their answers. Use before asking the business a question that may already be answered.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the user wants to know' } }, required: ['query'] },
    execute: function (a) {
      var q = String(a.query || '').toLowerCase().split(/\W+/).filter(function (x) { return x.length > 2; });
      var items = [];
      P.ldType('FAQPage').forEach(function (f) {
        [].concat(f.mainEntity || []).forEach(function (e) {
          var ans = e.acceptedAnswer ? (e.acceptedAnswer.text || '') : '';
          items.push({ q: e.name || '', a: String(ans).replace(/<[^>]+>/g, '') });
        });
      });
      if (!items.length) return { found: 0, note: 'This page has no FAQ data.' };
      items.forEach(function (it) {
        var hay = (it.q + ' ' + it.a).toLowerCase();
        it.score = q.reduce(function (s, t) { return s + (hay.indexOf(t) !== -1 ? 1 : 0); }, 0);
      });
      var hits = items.filter(function (i) { return i.score > 0; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 5);
      return { found: hits.length, results: hits.map(function (h) { return { question: h.q, answer: h.a }; }) };
    }
  });

  P.register({
    name: 'list_services', annotations: ro,
    description: 'List the services or product categories this business offers, with prices where published.',
    inputSchema: { type: 'object', properties: {} },
    execute: function () {
      var out = [];
      if (cfg.services) return { services: cfg.services };
      P.ld().forEach(function (n) {
        var cat = n.hasOfferCatalog; if (!cat) return;
        [].concat(cat.itemListElement || []).forEach(function (el) {
          var item = el.itemOffered || el;
          out.push({ name: item.name || el.name, description: item.description || el.description || null, price: el.price ? el.price + ' ' + (el.priceCurrency || '') : null });
        });
      });
      P.ldType(['Service', 'Offer', 'Product']).forEach(function (n) { out.push({ name: n.name, description: n.description || null, price: n.offers && n.offers.price ? n.offers.price + ' ' + (n.offers.priceCurrency || '') : null }); });
      return { services: out.slice(0, 40), note: out.length ? undefined : 'No structured service list; use find_page("services").' };
    }
  });

  P.register({
    name: 'find_page', annotations: ro,
    description: 'Find pages on this website by topic (e.g. "pricing", "contact", "returns policy"). Returns matching links from the site navigation.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    execute: function (a) {
      var q = String(a.query || '').toLowerCase();
      var seen = {}, out = [];
      var links = d.querySelectorAll('nav a[href], header a[href], footer a[href], a[href^="/"]');
      for (var i = 0; i < links.length && out.length < 8; i++) {
        var l = links[i], txt = (l.textContent || '').trim(), href = l.href;
        if (!txt || seen[href] || /^javascript:/.test(href)) continue;
        if ((txt + ' ' + href).toLowerCase().indexOf(q) !== -1) { seen[href] = 1; out.push({ title: txt.slice(0, 80), url: href }); }
      }
      return { results: out };
    }
  });
})(window, document);
