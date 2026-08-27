# webmcp-packs

Drop-in [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tool packs for ordinary business websites — booking, quotes, enquiries, restaurant menus, FAQ — so a visitor's own AI agent (Gemini in Chrome, Claude, ChatGPT…) can *use* the site instead of scraping it.

No build step, no dependencies, ~2 KB per pack. Feature-detects `document.modelContext`; does nothing on browsers without WebMCP.

```html
<script src="https://probull.eu/webmcp/core.js" defer></script>
<script src="https://probull.eu/webmcp/site.js" defer></script>                       <!-- zero-config: reads your JSON-LD + nav -->
<script src="https://probull.eu/webmcp/lead.js" data-endpoint="/contact.php"
        data-company="ACME d.o.o." data-lang="sl" defer></script>
```

| Pack | Tools | Config (`data-*` on the script tag or `window.WebMCPPacksConfig.<pack>`) |
|---|---|---|
| `site.js` | `get_site_info`, `search_faq`, `list_services`, `find_page` | none — built from Organization/LocalBusiness/FAQPage JSON-LD and navigation links; optional `services`, `email`, `telephone`, `hours` |
| `lead.js` | `request_quote`, `get_pricing` | `endpoint` (POST: name,email,company,phone,message,lang,consent), `company`, `lang`, `pricing` (JSON), `extra` |
| `booking.js` | `get_opening_hours`, `list_available_slots`, `request_booking` | `endpoint`, `hours` (schema.org openingHoursSpecification JSON) or LocalBusiness JSON-LD, `slot` minutes, `services`, `availability` (GET ?date= → ["09:00"]) |
| `quote.js` | `list_products`, `request_product_quote` | `endpoint`, `products` (JSON), `fields` (e.g. `["quantity","size","material","deadline"]`) |
| `restaurant.js` | `get_menu`, `get_opening_hours`, `request_table_reservation` | `endpoint`, `menu` (JSON URL) or schema.org Menu JSON-LD, `hours` |

All `request_*` tools require `consent: true` — the agent must ask the user before personal data leaves the browser — and POST to your existing contact endpoint, so nothing new to host. Read-only tools carry `annotations.readOnlyHint`.

Registered tools are also listed at `window.WebMCPPacks.list()` and callable via `WebMCPPacks.call(name, args)` for bridges, tests and checkers. Test: `node test/check.cjs`.

Check any site's agent-readiness: https://probull.eu/ai-ready/ · Made by [PROBULL](https://probull.eu). MIT.
