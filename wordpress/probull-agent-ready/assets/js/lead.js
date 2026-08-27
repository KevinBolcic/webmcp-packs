/*! webmcp-packs/lead — enquiry / quote request via an existing contact endpoint.
 * <script src="lead.js" data-endpoint="/contact.php" data-company="ACME" data-lang="en"
 *         data-pricing='[{"tier":"Launch","price":"€1,400"}]' defer></script>
 * Endpoint receives POST fields: name, email, company, phone, message, lang, consent=1 (matches probull contact.php). */
(function (w, d) {
  var P = w.WebMCPPacks; if (!P) return;
  var cfg = P.config('lead', d.currentScript);
  var endpoint = cfg.endpoint || '/contact.php';
  var company = cfg.company || d.title;

  P.register({
    name: 'request_quote',
    description: 'Send an enquiry or quote request to ' + company + '. The business replies by email. Ask the user for explicit consent to send their details before calling; set consent=true only if they agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the person enquiring' },
        email: { type: 'string', description: 'Reply-to email address' },
        company: { type: 'string' },
        phone: { type: 'string' },
        message: { type: 'string', description: 'What they need, quantities, deadlines, budget' },
        consent: { type: 'boolean', description: 'User agreed that their details are sent to ' + company }
      },
      required: ['name', 'email', 'message', 'consent']
    },
    annotations: { readOnlyHint: false },
    execute: function (a) {
      if (a.consent !== true) return { sent: false, error: 'consent_required', hint: 'Ask the user to confirm sending their details, then call again with consent=true.' };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.email || ''))) return { sent: false, error: 'invalid_email' };
      var fields = { name: a.name, email: a.email, company: a.company || '', phone: a.phone || '', message: a.message, lang: cfg.lang || d.documentElement.lang || 'en', consent: '1' };
      if (cfg.extra) Object.keys(cfg.extra).forEach(function (k) { fields[k] = cfg.extra[k]; });
      return P.post(endpoint, fields).then(function (r) {
        var ok = r.ok && !(r.body && r.body.ok === false);
        return ok ? { sent: true, message: 'Enquiry sent to ' + company + '. They will reply to ' + a.email + '.' }
                  : { sent: false, status: r.status, error: (r.body && r.body.error) || 'send_failed' };
      });
    }
  });

  if (cfg.pricing) {
    P.register({
      name: 'get_pricing', annotations: { readOnlyHint: true },
      description: 'Published price list / packages of ' + company + ' (ex-VAT unless stated).',
      inputSchema: { type: 'object', properties: {} },
      execute: function () { return { pricing: cfg.pricing, note: cfg.pricingNote || null }; }
    });
  }
})(window, document);
