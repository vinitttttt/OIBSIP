import { useEffect, useMemo, useState } from 'react';
import { apiRequest, authRequest, ensureCustomerSession } from './api.js';

const money = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

function SiteNav() {
  return <nav className="nav wrap catalogue-nav" aria-label="Main navigation">
    <a className="brand" href="/" aria-label="PizzaHop home"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a>
    <div className="nav-links"><a href="/catalogue">Our menu</a><a href="/#about">Our story</a></div>
    <div className="catalogue-nav-actions"><a className="nav-cta" href="/login">Sign in</a><a className="nav-cta cart-nav" href="/cart">Your cart <span aria-hidden="true">↗</span></a></div>
  </nav>;
}

function ProductGrid({ products, compact = false }) {
  if (!products.length) return <p className="catalogue-empty">No pizzas are available right now. Please check back soon.</p>;
  return <div className={`pizza-grid catalogue-grid${compact ? ' is-compact' : ''}`}>{products.map((product) => <article className="pizza-card catalogue-card" key={product.id}>
    <a className="catalogue-image" href={`/pizza/${product.id}`}><img src={product.image} alt={`${product.name} pizza`} loading="lazy" /><span>{product.badge}</span></a>
    <div className="card-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><strong>{money(product.basePrice)}</strong></div>
    <a className="card-link" href={`/pizza/${product.id}`}>Make it yours <span>→</span></a>
  </article>)}</div>;
}

function useCatalogue() {
  const [state, setState] = useState({ products: [], loading: true, error: '' });
  useEffect(() => { let active = true; apiRequest('/catalogue').then((products) => { if (active) setState({ products, loading: false, error: '' }); }).catch((error) => { if (active) setState({ products: [], loading: false, error: error.message }); }); return () => { active = false; }; }, []);
  return state;
}

export function CataloguePreview() {
  const { products, loading, error } = useCatalogue();
  return <section className="menu-section" id="menu"><div className="wrap">
    <div className="section-heading"><div><p className="eyebrow">THE CROWD PLEASERS</p><h2>A good place to <em>start.</em></h2></div><a className="text-link" href="/catalogue">See the full menu <span>→</span></a></div>
    {loading ? <p className="catalogue-status">Loading fresh favorites…</p> : error ? <p className="form-error" role="alert">{error}</p> : <ProductGrid products={products.slice(0, 3)} compact />}
  </div></section>;
}

export function CataloguePage() {
  const { products, loading, error } = useCatalogue();
  return <main className="catalogue-page"><SiteNav/><header className="catalogue-heading wrap"><p className="eyebrow"><span/> BAKED FRESH, YOUR WAY</p><h1>Find your next <em>favorite.</em></h1><p>Start with one of our kitchen favorites, then make it yours.</p></header>
    <section className="wrap catalogue-list">{loading ? <p className="catalogue-status">Loading the menu…</p> : error ? <p className="form-error" role="alert">{error}</p> : <ProductGrid products={products}/>}</section>
  </main>;
}

const groups = [
  { key: 'base', label: 'Choose your base', hint: 'Five ways to start your slice.' },
  { key: 'sauce', label: 'Pick a sauce', hint: 'A good pizza starts with a good sauce.' },
  { key: 'cheese', label: 'Choose your cheese', hint: 'One cheesy favorite per pizza.' },
];

function IngredientChoice({ group, option, selected, onChange }) {
  return <label className={`ingredient-choice${selected ? ' selected' : ''}`}><input type="radio" name={group} checked={selected} onChange={onChange}/><span>{option.name}</span><small>{option.price ? `+${money(option.price)}` : 'Included'}</small></label>;
}

export function PizzaDetailPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [options, setOptions] = useState(null);
  const [selection, setSelection] = useState(null);
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: '', message: '', adding: false });

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest(`/catalogue/${productId}`), apiRequest('/customizer/options')]).then(([pizza, choices]) => {
      if (!active) return;
      setProduct(pizza); setOptions(choices);
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('pizzahop-pending-pizza')); } catch { saved = null; }
      const validSaved = saved?.productId === pizza.id && choices.base.some((item) => item.id === saved.baseId) && choices.sauce.some((item) => item.id === saved.sauceId) && choices.cheese.some((item) => item.id === saved.cheeseId);
      setSelection(validSaved ? { ...saved, vegetableIds: saved.vegetableIds.filter((id) => choices.vegetable.some((item) => item.id === id)) } : {
        productId: pizza.id, baseId: choices.base[0]?.id, sauceId: choices.sauce[0]?.id, cheeseId: choices.cheese[0]?.id, vegetableIds: [],
      });
      setStatus({ loading: false, error: '', message: '', adding: false });
    }).catch((error) => { if (active) setStatus({ loading: false, error: error.message, message: '', adding: false }); });
    return () => { active = false; };
  }, [productId]);

  const selectionKey = useMemo(() => selection ? `${selection.productId}:${selection.baseId}:${selection.sauceId}:${selection.cheeseId}:${selection.vegetableIds.join(',')}` : '', [selection]);
  useEffect(() => {
    if (!selection || !selection.baseId || !selection.sauceId || !selection.cheeseId) return;
    let active = true;
    apiRequest('/customizer/price', { method: 'POST', body: selection }).then((nextQuote) => { if (active) setQuote(nextQuote); }).catch((error) => { if (active) setStatus((current) => ({ ...current, error: error.message })); });
    return () => { active = false; };
  }, [selectionKey]);

  function setChoice(key, value) { setSelection((current) => ({ ...current, [key]: value })); setStatus((current) => ({ ...current, message: '', error: '' })); }
  function toggleVegetable(id) { setSelection((current) => ({ ...current, vegetableIds: current.vegetableIds.includes(id) ? current.vegetableIds.filter((value) => value !== id) : [...current.vegetableIds, id] })); setStatus((current) => ({ ...current, message: '', error: '' })); }

  async function addToCart() {
    if (!selection) return;
    setStatus({ loading: false, error: '', message: '', adding: true });
    sessionStorage.setItem('pizzahop-pending-pizza', JSON.stringify(selection));
    try {
      const token = await ensureCustomerSession();
      await authRequest('/cart/items', { method: 'POST', body: { ...selection, quantity: 1 }, token });
      sessionStorage.removeItem('pizzahop-pending-pizza');
      window.location.assign('/cart');
    } catch (error) {
      setStatus({ loading: false, error: error.message, message: '', adding: false });
    }
  }

  return <main className="catalogue-page"><SiteNav/>{status.loading ? <p className="wrap catalogue-status">Preparing your pizza…</p> : status.error && !product ? <p className="wrap form-error">{status.error}</p> : product && options && selection ? <>
    <div className="wrap detail-back"><a href="/catalogue">← Back to the menu</a></div>
    <section className="wrap pizza-detail"><div className="detail-photo"><img src={product.image} alt={`${product.name} pizza`} /><span>{product.badge}</span></div>
      <div className="detail-copy"><p className="eyebrow"><span/> YOUR PIZZA, YOUR WAY</p><h1>{product.name}</h1><p className="detail-description">{product.description}</p>
        {groups.map(({ key, label, hint }) => <fieldset className="ingredient-group" key={key}><legend>{label}</legend><p>{hint}</p><div className="ingredient-list">{options[key].map((option) => <IngredientChoice key={option.id} group={key} option={option} selected={selection[`${key}Id`] === option.id} onChange={() => setChoice(`${key}Id`, option.id)}/>)}</div></fieldset>)}
        <fieldset className="ingredient-group vegetable-group"><legend>Add vegetables <span className="optional">(optional)</span></legend><p>Pick a few extra garden favorites.</p><div className="ingredient-list">{options.vegetable.map((option) => <label className={`ingredient-choice${selection.vegetableIds.includes(option.id) ? ' selected' : ''}`} key={option.id}><input type="checkbox" checked={selection.vegetableIds.includes(option.id)} onChange={() => toggleVegetable(option.id)}/><span>{option.name}</span><small>+{money(option.price)}</small></label>)}</div></fieldset>
        {status.error && <p className="form-error" role="alert">{status.error} {status.error.includes('Authentication') && <a href={`/login?next=${encodeURIComponent(`/pizza/${product.id}`)}`}>Sign in</a>}</p>}
        <div className="detail-add"><div><small>YOUR PIZZA</small><strong>{quote ? money(quote.unitPrice) : '…'}</strong></div><button className="button button-dark" onClick={addToCart} disabled={status.adding || !quote}>{status.adding ? 'Adding…' : 'Add to cart'} <span>→</span></button></div>
      </div>
    </section>
  </> : null}</main>;
}

export function CartPage() {
  const [cart, setCart] = useState(null);
  const [state, setState] = useState({ loading: true, error: '' });
  async function loadCart() {
    try {
      const token = await ensureCustomerSession();
      const result = await authRequest('/cart', { token });
      setCart(result); setState({ loading: false, error: '' });
    } catch (error) { setState({ loading: false, error: error.message }); }
  }
  useEffect(() => { loadCart(); }, []);
  async function setQuantity(item, quantity) {
    try { const token = await ensureCustomerSession(); setCart(await authRequest(`/cart/items/${item.id}`, { method: 'PATCH', body: { quantity: Number(quantity) }, token })); }
    catch (error) { setState({ loading: false, error: error.message }); }
  }
  async function removeItem(item) {
    try { const token = await ensureCustomerSession(); setCart(await authRequest(`/cart/items/${item.id}`, { method: 'DELETE', token })); }
    catch (error) { setState({ loading: false, error: error.message }); }
  }
  const authError = state.error.toLowerCase().includes('authentication') || state.error.toLowerCase().includes('customer account');
  return <main className="catalogue-page"><SiteNav/><header className="catalogue-heading wrap cart-heading"><p className="eyebrow"><span/> YOUR NEXT SLICE</p><h1>Your <em>cart.</em></h1></header><section className="wrap cart-layout">
    {state.loading ? <p className="catalogue-status">Loading your cart…</p> : state.error ? <div className="cart-empty"><p className="form-error" role="alert">{state.error}</p><a className="button button-dark" href={authError ? `/login?next=${encodeURIComponent('/cart')}` : '/catalogue'}>{authError ? 'Sign in to your cart' : 'Browse the menu'} <span>→</span></a></div> : !cart?.items.length ? <div className="cart-empty"><h2>Your cart is taking a little break.</h2><p>Pick a kitchen favorite and make it yours.</p><a className="button button-dark" href="/catalogue">Explore pizzas <span>→</span></a></div> : <>
      <div className="cart-lines">{cart.items.map((item) => <article className="cart-line" key={item.id}><img src={item.product.image} alt=""/><div className="cart-line-main"><a href={`/pizza/${item.product.id}`}><h2>{item.product.name}</h2></a><p>{item.ingredients.map((ingredient) => ingredient.name).join(' · ')}</p><button className="remove-item" onClick={() => removeItem(item)}>Remove</button></div><label className="quantity-picker">Qty<select value={item.quantity} onChange={(event) => setQuantity(item, event.target.value)}>{Array.from({ length: 20 }, (_, index) => index + 1).map((quantity) => <option key={quantity}>{quantity}</option>)}</select></label><strong className="line-subtotal">{money(item.subtotal)}</strong></article>)}</div>
      <aside className="cart-summary"><p>ORDER SUMMARY</p><div><span>Subtotal</span><strong>{money(cart.subtotal)}</strong></div><small>Delivery and checkout will be available in a later milestone.</small><a className="button button-dark" href="/catalogue">Add another pizza <span>→</span></a></aside>
    </>}
  </section></main>;
}
