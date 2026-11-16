import { useEffect, useState } from 'react';
import { authRequest, ensureCustomerSession } from './api.js';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise ?? 0) / 100);

function OrdersNav() {
  return <nav className="nav wrap catalogue-nav"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><div className="catalogue-nav-actions"><a className="nav-cta" href="/catalogue">Menu</a><a className="nav-cta" href="/orders">Order history</a><a className="nav-cta" href="/cart">Cart</a></div></nav>;
}

function OrderLines({ order }) {
  return <div className="order-lines">{order.items.map((item) => <article className="order-line" key={item.id}>
    <img src={item.product.image} alt=""/><div><h3>{item.product.name} <span>× {item.quantity}</span></h3><p>{item.ingredients.map((ingredient) => ingredient.name).join(' · ')}</p><small>{money(item.unitPricePaise)} each</small></div><strong>{money(item.lineTotalPaise)}</strong>
  </article>)}</div>;
}

function useCustomerOrder(orderId) {
  const [state, setState] = useState({ order: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    ensureCustomerSession().then((token) => authRequest(`/orders/${orderId}`, { token })).then(({ order }) => {
      if (active) setState({ order, loading: false, error: '' });
    }).catch((error) => { if (active) setState({ order: null, loading: false, error: error.message }); });
    return () => { active = false; };
  }, [orderId]);
  return state;
}

export function CheckoutPage({ orderId }) {
  const { order, loading, error } = useCustomerOrder(orderId);
  const [attempt, setAttempt] = useState(null);
  const [state, setState] = useState({ busy: false, error: '' });

  async function initialize() {
    setState({ busy: true, error: '' });
    try {
      const token = await ensureCustomerSession();
      const result = await authRequest('/payments/mock/initialize', { method: 'POST', body: { orderId }, token });
      setAttempt(result); setState({ busy: false, error: '' });
    } catch (requestError) { setState({ busy: false, error: requestError.message }); }
  }

  async function simulate(outcome) {
    if (!attempt) return;
    setState({ busy: true, error: '' });
    try {
      const token = await ensureCustomerSession();
      const result = await authRequest('/payments/mock/confirm', {
        method: 'POST', token,
        body: { attemptId: attempt.attempt.id, confirmationToken: attempt.confirmationToken, outcome },
      });
      window.location.assign(`/payment-result/${orderId}?result=${result.order.paymentStatus}`);
    } catch (requestError) { setState({ busy: false, error: requestError.message }); }
  }

  if (loading) return <main className="catalogue-page"><OrdersNav/><p className="wrap catalogue-status">Loading your order…</p></main>;
  if (error || !order) return <main className="catalogue-page"><OrdersNav/><section className="order-state-card"><p className="form-error" role="alert">{error || 'Order not found.'}</p><a className="button button-dark" href="/orders">View order history <span>→</span></a></section></main>;

  return <main className="catalogue-page"><OrdersNav/><header className="catalogue-heading wrap order-heading"><p className="eyebrow"><span/> CHECKOUT</p><h1>Review your <em>order.</em></h1></header><section className="wrap order-checkout-grid">
    <div className="order-panel"><h2>Order summary</h2><p className="order-id">Order #{order.id.slice(-8).toUpperCase()}</p><OrderLines order={order}/></div>
    <aside className="cart-summary checkout-summary"><p>PAYMENT SUMMARY</p><div><span>Subtotal</span><strong>{money(order.subtotalPaise)}</strong></div><div><span>Delivery</span><strong>{money(order.deliveryPaise)}</strong></div><div className="checkout-total"><span>Total</span><strong>{money(order.totalPaise)}</strong></div>
      <div className="simulated-payment-banner"><strong>TEST PAYMENT / SIMULATED PAYMENT</strong><span>This is a development simulation. No money is transferred.</span></div>
      {!attempt ? <button className="button button-dark" onClick={initialize} disabled={state.busy || order.paymentStatus !== 'pending'}>{state.busy ? 'Preparing test payment…' : 'Open test payment'} <span>→</span></button> : <div className="mock-payment-controls"><p>Choose a simulated result:</p><button className="button button-dark" onClick={() => simulate('success')} disabled={state.busy}>{state.busy ? 'Processing…' : 'Simulate success'} <span>✓</span></button><button className="button mock-fail-button" onClick={() => simulate('failure')} disabled={state.busy}>Simulate failure <span>×</span></button></div>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
    </aside>
  </section></main>;
}

export function PaymentResultPage({ orderId }) {
  const { order, loading, error } = useCustomerOrder(orderId);
  const result = new URLSearchParams(window.location.search).get('result');
  const succeeded = order?.paymentStatus === 'succeeded';
  const failed = order?.paymentStatus === 'failed' || order?.paymentStatus === 'expired';
  return <main className="catalogue-page"><OrdersNav/>{loading ? <p className="wrap catalogue-status">Checking payment status…</p> : <section className="order-state-card">
    <div className={`order-state-icon ${succeeded ? 'success' : failed ? 'failure' : ''}`}>{succeeded ? '✓' : failed ? '!' : '…'}</div>
    <p className="eyebrow"><span/> TEST PAYMENT RESULT</p>
    <h1>{error ? 'We could not load that order.' : succeeded ? 'Payment simulated successfully.' : failed ? 'Payment was not completed.' : 'Payment is still pending.'}</h1>
    <p>{error || (succeeded ? 'Your order is confirmed. No money was transferred.' : failed ? 'The reservation was released. You can choose another pizza and try again.' : 'Your order remains reserved until its checkout window expires.')}</p>
    {order && <a className="button button-dark" href={`/orders/${order.id}`}>View order confirmation <span>→</span></a>}
    {failed && <a className="text-link" href="/catalogue">Return to menu <span>→</span></a>}
    {!order && <a className="button button-dark" href="/orders">View order history <span>→</span></a>}
    {result && result !== order?.paymentStatus && <small className="form-error">Current server status: {order?.paymentStatus}</small>}
  </section>}</main>;
}

export function OrderConfirmationPage({ orderId }) {
  const [state, setState] = useState({ tracking: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    let timer;
    const loadTracking = async () => {
      try {
        const token = await ensureCustomerSession();
        const { tracking } = await authRequest(`/orders/${orderId}/tracking`, { token });
        if (!active) return;
        setState({ tracking, loading: false, error: '' });
        if (tracking.fulfillmentStatus !== 'DELIVERED') timer = window.setTimeout(loadTracking, 10_000);
      } catch (error) {
        if (!active) return;
        setState((current) => ({ ...current, loading: false, error: error.message }));
        timer = window.setTimeout(loadTracking, 10_000);
      }
    };
    void loadTracking();
    return () => { active = false; window.clearTimeout(timer); };
  }, [orderId]);
  const tracking = state.tracking;
  const progress = ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const currentIndex = Math.max(0, progress.indexOf(tracking?.fulfillmentStatus ?? 'PLACED'));
  const placedAt = tracking?.statusHistory?.find((entry) => entry.status === 'PLACED')?.changedAt ?? tracking?.createdAt;
  return <main className="catalogue-page"><OrdersNav/>{state.loading && !tracking ? <p className="wrap catalogue-status">Loading order tracking…</p> : !tracking ? <section className="order-state-card"><p className="form-error" role="alert">{state.error || 'Order not found.'}</p><a className="button button-dark" href="/orders">View order history <span>→</span></a></section> : <>
    <header className="catalogue-heading wrap order-heading"><p className="eyebrow"><span/> ORDER #{tracking.id.slice(-8).toUpperCase()}</p><h1>Track your <em>order.</em></h1><p>Placed {new Date(placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · Payment {tracking.paymentStatus.replaceAll('_', ' ')}</p></header>
    <section className="wrap tracking-panel"><div className="tracking-heading"><div><h2>{tracking.fulfillmentStatus.replaceAll('_', ' ')}</h2><p>We’ll update this page automatically while your order is in progress.</p></div><span className="tracking-live"><i/> AUTO REFRESH · 10 SEC</span></div>
      {state.error && <p className="tracking-refresh-error" role="status">Could not refresh right now. We’ll try again shortly.</p>}
      <ol className="order-timeline">{progress.map((status, index) => {
        const event = tracking.statusHistory?.find((entry) => entry.status === status);
        const complete = index <= currentIndex;
        const title = ['Order placed', 'Confirmed', 'Preparing', 'Out for delivery', 'Delivered'][index];
        return <li className={complete ? 'complete' : ''} key={status}><span className="timeline-marker">{complete ? '✓' : index + 1}</span><div><strong>{title}</strong><small>{event ? new Date(event.changedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : index === 0 ? new Date(placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Waiting for update'}</small></div></li>;
      })}</ol>
      <div className="tracking-footer"><span>Order total</span><strong>{money(tracking.totalPaise)}</strong><a href="/orders">All orders</a></div>
      {tracking.paymentStatus === 'pending' && <a className="button button-dark tracking-pay-link" href={`/checkout/${tracking.id}`}>Complete payment <span>→</span></a>}
    </section>
  </>}</main>;
}

export function OrderHistoryPage() {
  const [state, setState] = useState({ orders: [], loading: true, error: '' });
  useEffect(() => {
    let active = true;
    ensureCustomerSession().then((token) => authRequest('/orders', { token })).then(({ orders }) => { if (active) setState({ orders, loading: false, error: '' }); }).catch((error) => { if (active) setState({ orders: [], loading: false, error: error.message }); });
    return () => { active = false; };
  }, []);
  return <main className="catalogue-page"><OrdersNav/><header className="catalogue-heading wrap order-heading"><p className="eyebrow"><span/> YOUR PIZZAHOP ACCOUNT</p><h1>Order <em>history.</em></h1><p>Your recent orders and payment status.</p></header><section className="wrap order-history-list">
    {state.loading ? <p className="catalogue-status">Loading order history…</p> : state.error ? <div className="order-state-card"><p className="form-error" role="alert">{state.error}</p><a className="button button-dark" href={`/login?next=${encodeURIComponent('/orders')}`}>Sign in <span>→</span></a></div> : state.orders.length ? state.orders.map((order) => <a className="history-order-card" href={`/orders/${order.id}`} key={order.id}><div><small>ORDER #{order.id.slice(-8).toUpperCase()}</small><strong>{new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</strong><span>{order.items.length} pizza{order.items.length === 1 ? '' : 's'} · {order.orderStatus.replaceAll('_', ' ')}</span></div><strong>{money(order.totalPaise)}</strong><span className="history-status">{order.paymentStatus.replaceAll('_', ' ')}</span></a>) : <div className="order-state-card"><h2>No orders yet.</h2><p>Your first custom pizza is a few clicks away.</p><a className="button button-dark" href="/catalogue">Explore the menu <span>→</span></a></div>}
  </section></main>;
}
