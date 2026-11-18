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
      {message && <p role="status">{message}</p>}
      <button className="auth-mode-toggle" type="button" onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}>
        {isSignUp ? 'Already have an account? Sign in' : 'New to TerraRun? Create an account'}
      </button>
    </section>
  </main>;
}