/*! webmcp-packs core v0.1 — probull.eu — MIT.
 * Tiny wrapper around the WebMCP browser API (document.modelContext).
 * - feature-detects; no-ops silently on browsers without WebMCP
 * - keeps a page-level registry (window.WebMCPPacks.tools) so bridges/checkers can see tools
 * - packs call WebMCPPacks.register({name, description, inputSchema, execute, annotations})
 */
(function (w, d) {
  'use strict';
  if (w.WebMCPPacks) return;
  var mc = d.modelContext || (w.navigator && w.navigator.modelContext) || null;
  var native = !!(mc && typeof mc.registerTool === 'function');
  var registry = {};

  function asText(v) { return typeof v === 'string' ? v : JSON.stringify(v); }

  function register(tool) {
    if (!tool || !tool.name || typeof tool.execute !== 'function') return false;
    var t = {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      annotations: tool.annotations || {},
      execute: function (args, ctx) {
        return Promise.resolve().then(function () { return tool.execute(args || {}, ctx); }).then(asText);
      }
    };
    registry[t.name] = t;
    if (native) {
      try {
        var p = mc.registerTool(t);
        if (p && p.catch) p.catch(function (e) { console.warn('[webmcp] registerTool', t.name, e); });
      } catch (e) { console.warn('[webmcp] registerTool', t.name, e); }
    }
    return true;
  }

  // Parsed JSON-LD on the page (flattens @graph). Packs read hours, FAQ, offers, menus from here.
  function ld() {
    var out = [];
    var nodes = d.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      try {
        var j = JSON.parse(nodes[i].textContent);
        var arr = Array.isArray(j) ? j : (j['@graph'] ? j['@graph'] : [j]);
        for (var k = 0; k < arr.length; k++) out.push(arr[k]);
      } catch (e) { /* ignore broken JSON-LD */ }
    }
    return out;
  }
  function ldType(types) {
    types = [].concat(types);
    return ld().filter(function (n) {
      var t = [].concat(n['@type'] || []);
      return t.some(function (x) { return types.indexOf(x) !== -1; });
    });
  }

  // POST form fields to an endpoint (FormData → works with plain PHP handlers). Returns text or JSON.
  function post(endpoint, fields) {
    var fd = new FormData();
    Object.keys(fields || {}).forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== null) fd.append(k, String(fields[k]));
    });
    return fetch(endpoint, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) {
      return r.text().then(function (t) {
        try { return { ok: r.ok, status: r.status, body: JSON.parse(t) }; }
        catch (e) { return { ok: r.ok, status: r.status, body: t.slice(0, 500) }; }
      });
    });
  }

  // Config for a pack: window.WebMCPPacksConfig[pack] merged over data-* attributes of its <script> tag.
  function config(pack, script) {
    var cfg = {};
    if (script && script.dataset) {
      Object.keys(script.dataset).forEach(function (k) {
        var v = script.dataset[k];
        try { cfg[k] = JSON.parse(v); } catch (e) { cfg[k] = v; }
      });
    }
    var g = (w.WebMCPPacksConfig || {})[pack] || {};
    Object.keys(g).forEach(function (k) { cfg[k] = g[k]; });
    return cfg;
  }

  // Human-readable opening hours from schema.org openingHoursSpecification.
  function hours(spec) {
    return [].concat(spec || []).map(function (s) {
      var days = [].concat(s.dayOfWeek || []).map(function (x) { return String(x).replace(/^.*\//, ''); }).join(', ');
      return days + ': ' + (s.opens || '?') + '–' + (s.closes || '?');
    });
  }

  var api = w.WebMCPPacks = {
    version: '0.1.0', native: native, tools: registry,
    register: register, ld: ld, ldType: ldType, post: post, config: config, hours: hours,
    call: function (name, args) {
      var t = registry[name];
      return t ? t.execute(args || {}) : Promise.reject(new Error('unknown tool ' + name));
    },
    list: function () {
      return Object.keys(registry).map(function (n) {
        var t = registry[n];
        return { name: n, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
      });
    }
  };
  // Discovery marker for scanners that only see static HTML after JS ran.
  if (d.head) { var m = d.createElement('meta'); m.name = 'webmcp-packs'; m.content = api.version; d.head.appendChild(m); }
})(window, document);
