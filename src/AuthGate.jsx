import { useEffect, useState } from 'react';
import { Footprints, Mail } from 'lucide-react';
import App from './App.jsx';
import { neonClient } from './utils/neon.js';

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(neonClient));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!neonClient) return undefined;
    // Surface OAuth callback errors (e.g. ?error=account_not_linked) and clean the URL.
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      setMessage(oauthError === 'account_not_linked'
        ? 'This email is already registered with a password. Sign in with your email and password instead.'
        : `Sign-in failed: ${oauthError.replace(/_/g, ' ')}.`);
      params.delete('error');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    }
    let active = true;
    neonClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : 'Unable to check your session.');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = isSignUp
        ? await neonClient.auth.signUp.email({ name: nickname.trim() || cleanEmail.split('@')[0] || 'Runner', email: cleanEmail, password })
        : await neonClient.auth.signIn.email({ email: cleanEmail, password });
      if (result.error) throw new Error(result.error.message);
      const sessionResult = await neonClient.auth.getSession();
      setUser(sessionResult.data?.session ? sessionResult.data.user : null);
      if (!sessionResult.data?.session && isSignUp) setMessage('Account created. Check your email to verify it, then sign in.');
      else if (!sessionResult.data?.session) setMessage('No active session was returned. Please try signing in again.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setSubmitting(true);
    setMessage('');
    try {
      const result = await neonClient.auth.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + window.location.pathname,
      });
      if (result?.error) throw new Error(result.error.message || 'Google sign-in failed.');
      // The browser is being redirected to Google; keep the UI disabled meanwhile.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in with Google.');
      setSubmitting(false);
    }
  }

  async function signOut() {
    const { error } = await neonClient.auth.signOut();
    if (error) setMessage(error.message);
    else setUser(null);
  }

  if (!neonClient) return <App />;
  if (loading) return <main className="auth-screen"><p role="status">Checking your session…</p></main>;
  if (user) return <App key={user.id} user={user} client={neonClient} onSignOut={signOut} authMessage={message} />;

  return <main className="auth-screen">
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-brand"><Footprints size={22} /> TerraRun</div>
      <h1 id="auth-title">Sign in to your account</h1>
      <p>Access your private routes and territory preview.</p>
      <form onSubmit={submitAuth}>
        {isSignUp && <>
          <label htmlFor="auth-nickname">Nickname</label>
          <input id="auth-nickname" type="text" autoComplete="nickname" maxLength={32} placeholder="How other runners will see you" value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </>}
        <label htmlFor="auth-email">Email address</label>
        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={submitting}><Mail size={17} /> {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <div className="auth-divider" aria-hidden="true">or</div>
      <button className="auth-social" type="button" onClick={signInWithGoogle} disabled={submitting}>
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
      </button>
      {message && <p role="status">{message}</p>}
      <button className="auth-mode-toggle" type="button" onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}>
        {isSignUp ? 'Already have an account? Sign in' : 'New to TerraRun? Create an account'}
      </button>
    </section>
  </main>;
}