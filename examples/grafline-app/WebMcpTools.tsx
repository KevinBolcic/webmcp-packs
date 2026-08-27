'use client';
// WebMCP tools — lets the user's OWN AI agent (Gemini in Chrome, Claude/ChatGPT via a bridge) drive Grafline through
// document.modelContext. Runs only when logged in; silent no-op in browsers without WebMCP. Reads use the session token via api.ts.
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { contacts, invoices, orders, dashboardExtended } from '@/lib/api';

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown>; execute: (args: any) => Promise<unknown> };
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const d = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : null);
const RO = { readOnlyHint: true };

export default function WebMcpTools() {
  const { token } = useAuth();
  useEffect(() => {
    if (!token || typeof document === 'undefined') return;
    const mc: any = (document as any).modelContext ?? (navigator as any).modelContext;
    if (!mc?.registerTool) return;
    const ac = new AbortController();
    const today = () => new Date().toISOString().slice(0, 10);
    const tools: Tool[] = [
      {
        name: 'list_open_invoices', annotations: RO,
        description: 'Issued invoices that are sent but not yet paid (status SENT), newest first, with overdue flag. Use for "who still owes us", "open invoices", "overdue".',
        inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 20 }, overdue_only: { type: 'boolean' } } },
        execute: async (a) => {
          const rows: any[] = await invoices.getAll({ status: 'SENT', docType: 'INVOICE' });
          const t = today();
          const out = rows.map((r) => ({ id: r.id, number: r.number ?? r.invoiceNumber ?? null, customer: r.contact?.name ?? r.clientName ?? null, total: n(r.total ?? r.totalAmount), issueDate: d(r.issueDate), dueDate: d(r.dueDate), overdue: !!(d(r.dueDate) && (d(r.dueDate) as string) < t) }))
            .filter((r) => !a.overdue_only || r.overdue).slice(0, a.limit || 20);
          return { count: out.length, total_open: out.reduce((s, r) => s + (r.total || 0), 0), invoices: out };
        },
      },
      {
        name: 'find_customer', annotations: RO,
        description: 'Search customers/suppliers (contacts) by name, company, email or phone.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: async (a) => {
          const rows: any[] = await contacts.getAll({ search: String(a.query || '') });
          return { count: rows.length, contacts: rows.slice(0, 20).map((c) => ({ id: c.id, name: c.name, company: c.company ?? null, email: c.email ?? null, phone: c.phone ?? null, type: c.type })) };
        },
      },
      {
        name: 'get_order_status', annotations: RO,
        description: 'Find orders by order code, customer name or email and return their status, priority and items.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: async (a) => {
          const rows: any[] = await orders.getAll({ search: String(a.query || '') });
          return { count: rows.length, orders: rows.slice(0, 10).map((o) => ({ id: o.id, code: o.code ?? null, status: o.status, priority: o.priority ?? null, customer: o.contact?.name ?? o.customerName ?? null, createdAt: d(o.createdAt), items: (o.items || []).slice(0, 10).map((i: any) => ({ name: i.name ?? i.description ?? null, quantity: n(i.quantity) })) })) };
        },
      },
      {
        name: 'list_recent_orders', annotations: RO,
        description: 'Most recent orders, optionally filtered by status (e.g. NEW, IN_PROGRESS, DONE).',
        inputSchema: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'integer', default: 20 } } },
        execute: async (a) => {
          const rows: any[] = await orders.getAll(a.status ? { status: String(a.status) } : undefined);
          return { count: rows.length, orders: rows.slice(0, a.limit || 20).map((o) => ({ id: o.id, code: o.code ?? null, status: o.status, customer: o.contact?.name ?? o.customerName ?? null, createdAt: d(o.createdAt) })) };
        },
      },
      {
        name: 'list_supplier_invoices_due', annotations: RO,
        description: 'Supplier (received) invoices we still have to pay, due within N days. Use for "what do we owe", "payments due".',
        inputSchema: { type: 'object', properties: { days: { type: 'integer', default: 14 } } },
        execute: async (a) => {
          const rows: any[] = await dashboardExtended.getDueInvoices(a.days || 14);
          return { count: rows.length, total_due: rows.reduce((s, r) => s + (n(r.amount) || 0), 0), invoices: rows.slice(0, 30).map((r) => ({ supplier: r.supplierName, number: r.invoiceNumber, amount: n(r.amount), dueDate: d(r.dueDate), daysUntilDue: r.daysUntilDue, status: r.status })) };
        },
      },
      {
        name: 'create_document',
        description: 'Create a sales document with line items: QUOTE (ponudba, default, safe) or INVOICE (račun — assigns the next invoice number, cannot be undone). Always show the user the lines and total and get their explicit confirmation before calling; pass confirm=true only then. Use find_customer first to get contactId.',
        inputSchema: {
          type: 'object',
          properties: {
            docType: { type: 'string', enum: ['QUOTE', 'PROFORMA', 'INVOICE'], default: 'QUOTE' },
            contactId: { type: 'integer' }, clientName: { type: 'string', description: 'Used if no contactId' },
            dueDays: { type: 'integer', default: 30 },
            lines: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, unitPrice: { type: 'number', description: 'net price per unit, EUR' }, taxRate: { type: 'number', default: 22 } }, required: ['description', 'quantity', 'unitPrice'] } },
            confirm: { type: 'boolean' },
          },
          required: ['lines', 'confirm'],
        },
        execute: async (a) => {
          if (a.confirm !== true) return { created: false, error: 'confirm_required', hint: 'Show the user the document summary and call again with confirm=true.' };
          if (!a.contactId && !a.clientName) return { created: false, error: 'contactId or clientName required' };
          const lines = (a.lines || []).map((l: any) => ({ kind: 'ITEM', description: String(l.description), quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, taxRate: l.taxRate == null ? 22 : Number(l.taxRate) }));
          if (!lines.length) return { created: false, error: 'at least one line required' };
          const subtotal = lines.reduce((s: number, l: any) => s + l.quantity * l.unitPrice, 0);
          const taxTotal = lines.reduce((s: number, l: any) => s + l.quantity * l.unitPrice * (l.taxRate / 100), 0);
          const issue = new Date(); const due = new Date(issue.getTime() + (a.dueDays || 30) * 86400000);
          const doc: any = await invoices.create({ docType: a.docType || 'QUOTE', contactId: a.contactId || undefined, clientName: a.clientName || undefined, issueDate: issue.toISOString().slice(0, 10), dueDate: due.toISOString().slice(0, 10), subtotal: +subtotal.toFixed(2), taxTotal: +taxTotal.toFixed(2), total: +(subtotal + taxTotal).toFixed(2), lines } as any);
          return { created: true, id: doc?.id ?? null, number: doc?.number ?? doc?.invoiceNumber ?? null, docType: a.docType || 'QUOTE', total: +(subtotal + taxTotal).toFixed(2), url: doc?.id ? `${location.origin}/invoices?id=${doc.id}` : null };
        },
      },
    ];
    for (const t of tools) {
      const def = { ...t, execute: async (args: any) => { try { const r = await t.execute(args || {}); return typeof r === 'string' ? r : JSON.stringify(r); } catch (e: any) { return JSON.stringify({ error: e?.message || String(e) }); } } };
      try { Promise.resolve(mc.registerTool(def, { signal: ac.signal })).catch(() => { try { mc.registerTool(def); } catch { /* noop */ } }); } catch { try { mc.registerTool(def); } catch { /* noop */ } }
    }
    return () => ac.abort();
  }, [token]);
  return null;
}
