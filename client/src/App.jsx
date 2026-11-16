import RegisterPage from './RegisterPage.jsx';
import VerifyEmailPage from './VerifyEmailPage.jsx';

const pizzas = [
  { name: 'The Margherita', detail: 'Tomato, mozzarella, fresh basil', price: '₹249', art: '🍅', tone: 'tomato' },
  { name: 'Garden Hop', detail: 'Bell pepper, olives, sweet corn', price: '₹329', art: '🫑', tone: 'garden' },
  { name: 'Smoky Mushroom', detail: 'Roasted mushroom, herbs, cheese', price: '₹349', art: '🍄', tone: 'mushroom' },
];

function App() {
  if (window.location.pathname === '/register') return <RegisterPage />;
  if (window.location.pathname === '/verify-email') return <VerifyEmailPage />;
  return (
    <main>
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand" href="#home" aria-label="PizzaHop home"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a>
        <div className="nav-links"><a href="#menu">Our menu</a><a href="#about">How it works</a></div>
        <a className="nav-cta" href="/register">Join PizzaHop <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero wrap" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span /> FRESH FROM THE OVEN</p>
          <h1>Good pizza.<br />Right on <em>time.</em></h1>
          <p className="hero-text">Made with the good stuff, baked until golden, and hopping straight to your door.</p>
          <div className="hero-actions"><a className="button button-dark" href="#menu">Find your pizza <span>→</span></a><span className="delivery-note">⌁ &nbsp; Hot at your doorstep</span></div>
          <div className="social-proof"><span className="avatars">🍕 🧑🏽‍🍳 🍅</span><span><strong>Made fresh, always</strong><br />A little joy in every slice</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration of a freshly baked pizza" role="img">
          <div className="sunburst" />
          <div className="orbit orbit-one">MADE WITH LOVE · BAKED FRESH · </div>
          <div className="pizza"><div className="pizza-cheese"><i>🍅</i><i>🫒</i><i>🌿</i><i>🍅</i><i>🫒</i><i>🌿</i><i>🍄</i><i>🫒</i></div></div>
          <div className="floating-card"><span>✦</span><div><strong>Freshly baked</strong><small>Every single order</small></div></div>
          <span className="spark spark-one">✳</span><span className="spark spark-two">✦</span>
        </div>
      </section>

      <section className="menu-section" id="menu"><div className="wrap">
        <div className="section-heading"><div><p className="eyebrow">THE CROWD PLEASERS</p><h2>A good place to <em>start.</em></h2></div><a className="text-link" href="#menu">See the menu <span>→</span></a></div>
        <div className="pizza-grid">{pizzas.map((pizza) => <article className="pizza-card" key={pizza.name}><div className={`card-art ${pizza.tone}`}><span>{pizza.art}</span><b>FRESH PICK</b></div><div className="card-info"><div><h3>{pizza.name}</h3><p>{pizza.detail}</p></div><strong>{pizza.price}</strong></div><a className="card-link" href="#menu" aria-label={`Explore ${pizza.name}`}>Explore pizza <span>↗</span></a></article>)}</div>
      </div></section>
      <footer id="about"><div className="wrap footer-inner"><a className="brand" href="#home"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><span>Good things take dough. We make it worth the wait.</span><span>© 2026 PizzaHop</span></div></footer>
    </main>
  );
}

export default App;
