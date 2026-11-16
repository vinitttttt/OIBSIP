import { useEffect, useRef, useState } from 'react';
import { postAuth } from './api.js';

export default function VerifyEmailPage() {
  const started = useRef(false);
  const [status, setStatus] = useState({ loading: true, success: false, message: 'Verifying your email…' });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setStatus({ loading: false, success: false, message: 'This verification link is missing its token.' }); return; }
    window.history.replaceState({}, '', window.location.pathname);
    postAuth('verify-email', { token }).then((result) => {
      setStatus({ loading: false, success: true, message: result.message });
    }).catch((error) => {
      setStatus({ loading: false, success: false, message: error.message });
    });
  }, []);

  return <main className="auth-page"><nav className="auth-nav"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><a href="/">Back to home</a></nav>
    <section className="auth-card verify-card" aria-live="polite">
      <p className="eyebrow"><span /> ONE LAST STEP</p>
      <div className={`success-icon ${status.success ? '' : status.loading ? 'is-loading' : 'is-error'}`} aria-hidden="true">{status.loading ? '…' : status.success ? '✓' : '!'}</div>
      <h1>{status.loading ? 'Hang tight.' : status.success ? 'You’re verified!' : 'We couldn’t verify that link.'}</h1>
      <p className={status.success ? 'form-success' : status.loading ? 'auth-intro' : 'form-error'}>{status.message}</p>
      {!status.loading && !status.success && <div className="verify-resend"><p>You can request a fresh verification email below.</p><ResendVerificationForm /></div>}
      {!status.loading && <a className="button button-dark submit-button" href="/">Return to PizzaHop <span aria-hidden="true">→</span></a>}
    </section><p className="auth-foot">Good things take dough. We make it worth the wait.</p>
  </main>;
}

function ResendVerificationForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ loading: false, message: '', error: '' });
  async function submit(event) {
    event.preventDefault(); setState({ loading: true, message: '', error: '' });
    try { const result = await postAuth('resend-verification', { email }); setState({ loading: false, message: result.message, error: '' }); }
    catch (error) { setState({ loading: false, message: '', error: error.message }); }
  }
  return <form className="resend-form" onSubmit={submit}><label className="field" htmlFor="verify-resend-email">Email address<input id="verify-resend-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <button className="button button-outline" disabled={state.loading}>{state.loading ? 'Sending…' : 'Resend verification email'}</button>
    {state.message && <p role="status" className="form-success">{state.message}</p>}{state.error && <p role="alert" className="form-error">{state.error}</p>}
  </form>;
}
