import { useState } from 'react';
import { authRequest, postAuth } from './api.js';

function Shell({ title, children, note }) {
  return <main className="auth-page"><nav className="auth-nav"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><a href="/">Back to home</a></nav><section className="auth-card"><p className="eyebrow"><span /> PIZZAHOP ACCOUNT</p><h1>{title}</h1>{note && <p className="auth-intro">{note}</p>}{children}</section><p className="auth-foot">Good things take dough. We make it worth the wait.</p></main>;
}

export function LoginPage({ admin = false }) {
  const [form, setForm] = useState({ email: '', password: '' }); const [state, setState] = useState({ busy: false, error: '' });
  async function submit(event) {
    event.preventDefault(); setState({ busy: true, error: '' });
    try {
      const result = admin
        ? await authRequest('/admin/auth/login', { method: 'POST', body: form, token: null })
        : await postAuth('login', form);
      window.location.assign(admin ? '/admin' : '/account');
    } catch (error) { setState({ busy: false, error: error.message }); }
  }
  return <Shell title={admin ? 'Admin sign in.' : 'Welcome back.'} note={admin ? 'Sign in to the PizzaHop admin area.' : 'Sign in to pick up where your next slice left off.'}><form className="auth-form" onSubmit={submit}>
    <label className="field">Email address<input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
    <label className="field">Password<input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="button button-dark submit-button" disabled={state.busy}>{state.busy ? 'Signing in…' : 'Sign in'} <span>→</span></button>
    {!admin && <p className="auth-intro"><a className="text-link" href="/forgot-password">Forgot your password?</a> · <a className="text-link" href="/register">Create account</a></p>}
  </form></Shell>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [state, setState] = useState({ busy: false, message: '', error: '' });
  async function submit(event) { event.preventDefault(); setState({ busy: true, message: '', error: '' }); try { const result = await postAuth('forgot-password', { email }); setState({ busy: false, message: result.message, error: '' }); } catch (error) { setState({ busy: false, message: '', error: error.message }); } }
  return <Shell title="Reset your password." note="Enter your account email and we’ll send a reset link if it matches."><form className="auth-form" onSubmit={submit}><label className="field">Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>{state.message && <p className="form-success" role="status">{state.message}</p>}{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="button button-dark submit-button" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send reset link'} <span>→</span></button></form></Shell>;
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [state, setState] = useState({ busy: false, message: '', error: '' });
  async function submit(event) { event.preventDefault(); if (password !== confirm) { setState({ busy: false, message: '', error: 'Your passwords do not match.' }); return; } setState({ busy: true, message: '', error: '' }); try { const token = new URLSearchParams(location.search).get('token'); await postAuth('reset-password', { token, password }); history.replaceState({}, '', location.pathname); setState({ busy: false, message: 'Password reset. You can now sign in.', error: '' }); } catch (error) { setState({ busy: false, message: '', error: error.message }); } }
  return <Shell title="Choose a new password." note="Use at least 12 characters, including lowercase, uppercase, a number and a symbol."><form className="auth-form" onSubmit={submit}><label className="field">New password<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><label className="field">Confirm password<input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>{state.message && <p className="form-success" role="status">{state.message} <a href="/login">Sign in</a></p>}{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="button button-dark submit-button" disabled={state.busy}>{state.busy ? 'Saving…' : 'Reset password'} <span>→</span></button></form></Shell>;
}
