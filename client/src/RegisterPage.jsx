import { useState } from 'react';
import { postAuth } from './api.js';

function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete }) {
  return <label className="field" htmlFor={id}>{label}
    <span className="password-wrap"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required />
      <button className="visibility-button" type="button" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button>
    </span>
  </label>;
}

function ResendForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ loading: false, message: '', error: '' });
  async function submit(event) {
    event.preventDefault();
    setState({ loading: true, message: '', error: '' });
    try {
      const result = await postAuth('resend-verification', { email });
      setState({ loading: false, message: result.message, error: '' });
    } catch (error) {
      setState({ loading: false, message: '', error: error.message });
    }
  }
  return <form className="resend-form" onSubmit={submit}><label className="field" htmlFor="resend-email">Need another email?
    <input id="resend-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
  </label><button className="button button-outline" disabled={state.loading}>{state.loading ? 'Sending…' : 'Resend verification email'}</button>
    {state.message && <p className="form-success" role="status">{state.message}</p>}{state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>;
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  function change(key) { return (event) => setForm((current) => ({ ...current, [key]: event.target.value })); }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Your passwords do not match.'); return; }
    if (new TextEncoder().encode(form.password).length > 72) { setError('Password must be at most 72 UTF-8 bytes.'); return; }
    if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) {
      setError('Use a lowercase letter, uppercase letter, number and symbol in your password.'); return;
    }
    setLoading(true);
    try {
      await postAuth('register', { name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password });
      setRegistered(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally { setLoading(false); }
  }

  return <main className="auth-page"><nav className="auth-nav"><a className="brand" href="/"><span className="brand-mark">P</span> PizzaHop<span className="brand-dot">.</span></a><a href="/">Back to home</a></nav>
    <section className="auth-card" aria-labelledby="register-title">
      <p className="eyebrow"><span /> YOUR NEXT SLICE STARTS HERE</p>
      {registered ? <div className="success-panel"><div className="success-icon" aria-hidden="true">✓</div><h1 id="register-title">Check your inbox.</h1><p>Your PizzaHop account is ready. Use the verification link we emailed you before signing in.</p><ResendForm /><a className="text-link" href="/">Return to PizzaHop <span>→</span></a></div> : <>
        <h1 id="register-title">Create your account.</h1><p className="auth-intro">A little pizza joy is just around the corner.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field" htmlFor="name">Full name<input id="name" name="name" autoComplete="name" maxLength={100} value={form.name} onChange={change('name')} required /></label>
          <label className="field" htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={change('email')} required /></label>
          <PasswordField id="password" label="Password" value={form.password} onChange={change('password')} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" />
          <PasswordField id="confirm-password" label="Confirm password" value={form.confirmPassword} onChange={change('confirmPassword')} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} autoComplete="new-password" />
          <p className="password-hint">At least 12 characters, with lowercase, uppercase, number and symbol.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark submit-button" disabled={loading}>{loading ? 'Creating your account…' : 'Create account'} <span aria-hidden="true">→</span></button>
        </form>
      </>}
    </section><p className="auth-foot">Good things take dough. We make it worth the wait.</p>
  </main>;
}
