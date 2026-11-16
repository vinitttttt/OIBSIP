import { useEffect, useMemo, useState } from 'react';
import { authRequest } from './api.js';

const filters = ['all', 'base', 'sauce', 'cheese', 'vegetable'];

export default function InventoryDashboard({ onLogout }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalIngredients: 0, lowStockCount: 0, outOfStockCount: 0 });
  const [filter, setFilter] = useState('all');
  const [adjustment, setAdjustment] = useState(null);
  const [state, setState] = useState({ loading: true, busy: false, error: '', message: '' });

  async function load() {
    try {
      const [inventory, metrics] = await Promise.all([authRequest('/admin/inventory'), authRequest('/admin/inventory/summary')]);
      setItems(inventory.items); setSummary(metrics); setState((current) => ({ ...current, loading: false, error: '' }));
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error.message })); }
  }
  useEffect(() => { load(); }, []);

  const visibleItems = useMemo(() => filter === 'all' ? items : items.filter((item) => item.category === filter), [filter, items]);

  async function saveAdjustment(event) {
    event.preventDefault();
    if (!adjustment) return;
    setState((current) => ({ ...current, busy: true, error: '', message: '' }));
    try {
      await authRequest(`/admin/inventory/${adjustment.id}`, { method: 'PATCH', body: { delta: Number(adjustment.delta), reason: adjustment.reason } });
      setAdjustment(null);
      setState((current) => ({ ...current, busy: false, message: 'Stock adjustment saved.' }));
      await load();
    } catch (error) { setState((current) => ({ ...current, busy: false, error: error.message })); }
  }

  return <main className="admin-inventory-page">
    <header className="admin-inventory-top"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><div><a href="/admin/orders">Orders</a><a href="/catalogue">View menu</a><button onClick={onLogout}>Sign out</button></div></header>
    <section className="admin-inventory-content">
      <div className="admin-inventory-heading"><div><p className="eyebrow"><span/> ADMIN WORKSPACE</p><h1>Ingredient <em>inventory.</em></h1><p>Keep an eye on ingredients and record stock changes.</p></div><span className="inventory-live"><i/> LIVE STOCK</span></div>
      <div className="inventory-metrics">
        <article><span>Total ingredients</span><strong>{summary.totalIngredients}</strong><small>Tracked in the catalogue</small></article>
        <article className={summary.lowStockCount ? 'metric-warning' : ''}><span>Low stock</span><strong>{summary.lowStockCount}</strong><small>Below the set threshold</small></article>
        <article className={summary.outOfStockCount ? 'metric-out' : ''}><span>Out of stock</span><strong>{summary.outOfStockCount}</strong><small>Nothing currently available</small></article>
      </div>
      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><h2>Ingredient levels</h2><p>Available stock excludes quantities reserved for future orders.</p></div><label className="category-filter">Category<select value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((value) => <option key={value} value={value}>{value === 'all' ? 'All ingredients' : `${value[0].toUpperCase()}${value.slice(1)}s`}</option>)}</select></label></div>
        {state.error && <p className="form-error inventory-message" role="alert">{state.error}</p>}{state.message && <p className="form-success inventory-message" role="status">{state.message}</p>}
        {state.loading ? <p className="inventory-loading">Loading inventory…</p> : <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Ingredient</th><th>Category</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Threshold</th><th>Status</th><th></th></tr></thead><tbody>
          {visibleItems.map((item) => <InventoryRow key={item.id} item={item} adjustment={adjustment} setAdjustment={setAdjustment} onSubmit={saveAdjustment} busy={state.busy}/>)}
          {!visibleItems.length && <tr><td colSpan="8" className="inventory-empty">No ingredients in this category.</td></tr>}
        </tbody></table></div>}
      </section>
      <p className="inventory-footnote">Every manual adjustment is recorded with the admin account and reason. Stock is not reserved by adding pizzas to a cart.</p>
    </section>
  </main>;
}

function InventoryRow({ item, adjustment, setAdjustment, onSubmit, busy }) {
  const editing = adjustment?.id === item.id;
  const setField = (key, value) => setAdjustment((current) => ({ ...current, [key]: value }));
  return <>
    <tr className={`inventory-row${item.stockStatus !== 'healthy' ? ` is-${item.stockStatus}` : ''}`}>
      <td><strong>{item.name}</strong><small>{item.sku}</small></td><td><span className="ingredient-category">{item.category}</span></td>
      <td>{item.onHand}</td><td>{item.reserved}</td><td><strong>{item.available}</strong></td><td>{item.threshold}</td>
      <td><span className={`stock-badge ${item.stockStatus}`}>{item.stockStatus === 'out' ? 'Out of stock' : item.stockStatus === 'low' ? 'Low stock' : 'Healthy'}</span></td>
      <td><button className="inventory-adjust-toggle" onClick={() => setAdjustment(editing ? null : { id: item.id, delta: '', reason: '' })}>{editing ? 'Cancel' : 'Adjust'}</button></td>
    </tr>
    {editing && <tr className="adjustment-row"><td colSpan="8"><form onSubmit={onSubmit}>
      <label>Change by<input type="number" step="1" value={adjustment.delta} onChange={(event) => setField('delta', event.target.value)} placeholder="e.g. 25 or -4" required/></label>
      <label>Reason<input type="text" maxLength="240" value={adjustment.reason} onChange={(event) => setField('reason', event.target.value)} placeholder="Delivery received, waste, correction…" required/></label>
      <button className="button button-dark" disabled={busy || !Number(adjustment.delta)}>{busy ? 'Saving…' : 'Save adjustment'}</button>
    </form></td></tr>}
  </>;
}
