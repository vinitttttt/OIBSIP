import { useEffect, useState } from 'react';
import RegisterPage from './RegisterPage.jsx';
import VerifyEmailPage from './VerifyEmailPage.jsx';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from './AuthPages.jsx';
import { CartPage, CataloguePage, CataloguePreview, PizzaDetailPage } from './CataloguePages.jsx';
import InventoryDashboard from './InventoryDashboard.jsx';
import { authRequest, setAccessToken } from './api.js';

function App() {
  const [account, setAccount] = useState(null);
  const [authState, setAuthState] = useState('loading');
  const path = window.location.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const protectedPage = isAdmin || path === '/account';
  const pizzaRoute = /^\/pizza\/([^/]+)$/.exec(path);

  useEffect(() => {
    if (!protectedPage) return;
    const base = isAdmin ? '/admin/auth' : '/auth';
    authRequest(`${base}/refresh`, { method: 'POST', token: null }).then((session) => {
      setAccessToken(session.accessToken);
      return authRequest(`${base}/me`);
    }).then((result) => { setAccount(result.user); setAuthState('ready'); }).catch(() => setAuthState('signed-out'));
  }, []);

  if (path === '/login') return <LoginPage />;
  if (path === '/admin/login') return <LoginPage admin />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/register') return <RegisterPage />;
  if (path === '/verify-email') return <VerifyEmailPage />;
  if (path === '/catalogue') return <CataloguePage />;
  if (path === '/cart') return <CartPage />;
  if (pizzaRoute) return <PizzaDetailPage productId={decodeURIComponent(pizzaRoute[1])} />;
  if (protectedPage) {
    if (authState === 'loading') return <main className="auth-page"><section className="auth-card">Checking your session…</section></main>;
    if (authState === 'signed-out') return <LoginPage admin={isAdmin} />;
    const logout = async () => {
      try { await authRequest(`${isAdmin ? '/admin/auth' : '/auth'}/logout`, { method: 'POST', token: null }); } finally { setAccessToken(null); setAccount(null); setAuthState('signed-out'); }
    };
    if (isAdmin) return <InventoryDashboard onLogout={logout}/>;
    return <main className="auth-page"><nav className="auth-nav"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><button className="button button-outline" onClick={logout}>Sign out</button></nav><section className="auth-card"><p className="eyebrow"><span /> {isAdmin ? 'ADMIN ACCESS' : 'YOUR ACCOUNT'}</p><h1>{isAdmin ? 'Welcome, admin.' : `Welcome, ${account.name}.`}</h1><p className="auth-intro">Signed in as {account.email}</p><p className="auth-intro">{isAdmin ? 'Your admin authentication is ready.' : 'Your PizzaHop account is ready.'}</p></section></main>;
  }

  return <main>
    <nav className="nav wrap" aria-label="Main navigation">
      <a className="brand" href="#home" aria-label="PizzaHop home"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a>
      <div className="nav-links"><a href="#menu">Our menu</a><a href="#about">How it works</a></div>
      <div className="catalogue-nav-actions"><a className="nav-cta" href="/cart">Your cart</a><a className="nav-cta" href="/login">Sign in</a><a className="nav-cta" href="/register">Join PizzaHop</a></div>
    </nav>
    <section className="hero wrap" id="home">
      <div className="hero-copy"><p className="eyebrow"><span /> FRESH FROM THE OVEN</p><h1>Good pizza.<br />Right on <em>time.</em></h1><p className="hero-text">Made with the good stuff, baked until golden, and hopping straight to your door.</p><div className="hero-actions"><a className="button button-dark" href="/catalogue">Find your pizza <span>→</span></a><span className="delivery-note">Hot at your doorstep</span></div><div className="social-proof"><span className="avatars">🍕 👩🏽‍🍳 🍅</span><span><strong>Made fresh, always</strong><br />A little joy in every slice</span></div></div>
      <div className="hero-art" aria-label="Illustration of a freshly baked pizza" role="img"><div className="sunburst"/><div className="orbit orbit-one">MADE WITH LOVE · BAKED FRESH · </div><div className="pizza"><div className="pizza-cheese"><i>🍅</i><i>🫒</i><i>🌿</i><i>🍅</i><i>🫒</i><i>🌿</i><i>🍄</i><i>🫒</i></div></div><div className="floating-card"><span>✦</span><div><strong>Freshly baked</strong><small>Every single order</small></div></div><span className="spark spark-one">✳</span><span className="spark spark-two">✦</span></div>
    </section>
    <CataloguePreview />
    <footer id="about"><div className="wrap footer-inner"><a className="brand" href="#home"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><span>Good things take dough. We make it worth the wait.</span><span>© 2026 PizzaHop</span></div></footer>
  </main>;
}

export default App;
