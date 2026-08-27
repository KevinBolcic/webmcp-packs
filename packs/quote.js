/*! webmcp-packs/quote — structured product/service quote for configurable goods (print, signage, parts, machines).
 * data-endpoint="/contact.php" data-products='[{"name":"DTF print","unit":"pcs","min":10}]' data-fields='["quantity","size","material","deadline"]' */
(function (w, d) {
  var P = w.WebMCPPacks; if (!P) return;
  var cfg = P.config('quote', d.currentScript);
  var endpoint = cfg.endpoint || '/contact.php';
  var fields = cfg.fields || ['quantity', 'size', 'material', 'colors', 'deadline'];

  P.register({
    name: 'list_products', annotations: { readOnlyHint: true },
    description: 'Products / services that can be quoted, with units and minimum quantities.',
    inputSchema: { type: 'object', properties: {} },
    execute: function () {
      if (cfg.products) return { products: cfg.products };
      var ld = P.ldType(['Product', 'Service']).map(function (n) { return { name: n.name, description: n.description || null, url: n.url || null }; });
      return { products: ld.slice(0, 50) };
    }
  });

  var props = { product: { type: 'string', description: 'Product or service name' }, name: { type: 'string' }, email: { type: 'string' }, company: { type: 'string' }, phone: { type: 'string' }, notes: { type: 'string' }, consent: { type: 'boolean' } };
  fields.forEach(function (f) { props[f] = { type: f === 'quantity' ? 'number' : 'string' }; });

  P.register({
    name: 'request_product_quote',
    description: 'Ask for a price quote for a specific product/service with quantity and specs. The business replies by email with a price. Get user consent first.',
    inputSchema: { type: 'object', properties: props, required: ['product', 'quantity', 'name', 'email', 'consent'] },
    execute: function (a) {
      if (a.consent !== true) return { sent: false, error: 'consent_required' };
      var spec = fields.map(function (f) { return f + ': ' + (a[f] === undefined ? '-' : a[f]); }).join('\n');
      var msg = 'QUOTE REQUEST\nProduct: ' + a.product + '\n' + spec + '\nNotes: ' + (a.notes || '-');
      return P.post(endpoint, { name: a.name, email: a.email, company: a.company || '', phone: a.phone || '', message: msg, lang: cfg.lang || d.documentElement.lang || 'en', consent: '1', type: 'quote' })
        .then(function (r) { var ok = r.ok && !(r.body && r.body.ok === false); return ok ? { sent: true, note: 'Quote request sent; reply goes to ' + a.email } : { sent: false, status: r.status, error: (r.body && r.body.error) || 'send_failed' }; });
    }
  });
})(window, document);
