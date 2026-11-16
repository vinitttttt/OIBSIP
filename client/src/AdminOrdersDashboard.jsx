import { useEffect, useState } from 'react';
import { authRequest } from './api.js';

const statuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const nextStatus = Object.freeze({ PLACED: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' });
const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise ?? 0) / 100);
const label = (status) => status?.replaceAll('_', ' ').toLowerCase() ?? 'placed';

export default function AdminOrdersDashboard({ onLogout }) {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState({ orders: [], summary: {}, loading: true, error: '', message: '' });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const result = await authRequest(`/admin/orders${query}`);
      setData((current) => ({ ...current, ...result, loading: false, error: '' }));
    } catch (error) { setData((current) => ({ ...current, loading: false, error: error.message })); }
  }
  useEffect(() => { void load(); }, [filter]);

  async function inspect(orderId) {
    setData((current) => ({ ...current, error: '', message: '' }));
    try { setSelected((await authRequest(`/admin/orders/${orderId}`)).order); }
    catch (error) { setData((current) => ({ ...current, error: error.message })); }
  }

  async function advance() {
    if (!selected || !nextStatus[selected.fulfillmentStatus]) return;
    setBusy(true); setData((current) => ({ ...current, error: '', message: '' }));
    try {
      const { order } = await authRequest(`/admin/orders/${selected.id}/status`, { method: 'PATCH', body: { status: nextStatus[selected.fulfillmentStatus] } });
      setSelected(order); setData((current) => ({ ...current, message: 'Order status updated.' }));
      await load();
    } catch (error) { setData((current) => ({ ...current, error: error.message })); }
    finally { setBusy(false); }
  }

  return <main className="admin-inventory-page">
    <header className="admin-inventory-top"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><div><a href="/admin/inventory">Inventory</a><button onClick={onLogout}>Sign out</button></div></header>
    <section className="admin-inventory-content admin-orders-content">
      <div className="admin-inventory-heading"><div><p className="eyebrow"><span/> ADMIN WORKSPACE</p><h1>Customer <em>orders.</em></h1><p>Review paid orders and move each one through fulfillment.</p></div><a className="admin-order-link" href="/admin/inventory">Manage inventory</a></div>
      {data.error && <p className="form-error admin-orders-notice" role="alert">{data.error}</p>}{data.message && <p className="form-success admin-orders-notice" role="status">{data.message}</p>}
      <div className="admin-order-metrics">{[
        ['Total orders', Object.values(data.summary).reduce((sum, count) => sum + count, 0)],
        ['Pending', data.summary.PLACED ?? 0], ['Preparing', data.summary.PREPARING ?? 0], ['Out for delivery', data.summary.OUT_FOR_DELIVERY ?? 0],
      ].map(([title, count]) => <article key={title}><span>{title}</span><strong>{count}</strong></article>)}</div>
      <section className="admin-order-panel"><div className="admin-order-panel-head"><div><h2>Order queue</h2><p>Showing the latest 100 orders.</p></div><label className="category-filter">Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label></div>
        {data.loading ? <p className="inventory-loading">Loading orders…</p> : <div className="inventory-table-wrap"><table className="inventory-table admin-orders-table"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
          {data.orders.map((order) => <tr key={order.id}><td><strong>#{order.id.slice(-8).toUpperCase()}</strong></td><td><strong>{order.customer?.name ?? 'Customer'}</strong><small>{order.customer?.email}</small></td><td>{money(order.totalPaise)}</td><td><span className={`order-payment-badge ${order.paymentStatus}`}>{label(order.paymentStatus)}</span></td><td><span className={`order-status-badge ${order.fulfillmentStatus?.toLowerCase()}`}>{label(order.fulfillmentStatus)}</span></td><td>{new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td><td><button className="inventory-adjust-toggle" onClick={() => inspect(order.id)}>Inspect</button></td></tr>)}
          {!data.orders.length && <tr><td colSpan="7" className="inventory-empty">No orders match this filter.</td></tr>}
        </tbody></table></div>}
      </section>
      {selected && <section className="admin-order-detail" aria-label="Order details"><div className="admin-order-detail-head"><div><p className="eyebrow"><span/> ORDER DETAILS</p><h2>#{selected.id.slice(-8).toUpperCase()}</h2></div><button className="inventory-adjust-toggle" onClick={() => setSelected(null)}>Close</button></div>
        <div className="admin-order-customer"><strong>{selected.customer?.name}</strong><span>{selected.customer?.email}</span><span>Created {new Date(selected.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
        <div className="admin-order-detail-grid"><div><h3>Items</h3>{selected.items.map((item) => <article className="admin-order-item" key={item.id}><div><strong>{item.product.name} × {item.quantity}</strong><small>{item.ingredients.map((ingredient) => ingredient.name).join(' · ')}</small></div><strong>{money(item.lineTotalPaise)}</strong></article>)}</div><aside><span>Payment: {label(selected.paymentStatus)}</span><span>Total: <strong>{money(selected.totalPaise)}</strong></span><span>Order status: <strong>{label(selected.fulfillmentStatus)}</strong></span>
          {nextStatus[selected.fulfillmentStatus] && <button className="button button-dark" onClick={advance} disabled={busy || selected.paymentStatus !== 'succeeded'}>{busy ? 'Updating…' : `Move to ${label(nextStatus[selected.fulfillmentStatus])}`}</button>}
          {selected.paymentStatus !== 'succeeded' && <small>Fulfillment can advance after successful payment.</small>}
        </aside></div>
        <div className="admin-order-history"><h3>Status history</h3>{selected.statusHistory.map((event, index) => <p key={`${event.status}-${index}`}><strong>{label(event.status)}</strong><span>{new Date(event.changedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {event.actorRole}</span></p>)}</div>
      </section>}
    </section>
  </main>;
}
