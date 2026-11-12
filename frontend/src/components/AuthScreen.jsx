import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, Wallet } from "lucide-react";
import api, { saveTokens } from "../api";

function readableError(error) {
  const data = error.response?.data;
  if (!data) return "We couldn't reach SaveWise. Please try again.";
  if (typeof data.detail === "string") return data.detail;
  return Object.values(data).flat().join(" ");
}

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await api.post("auth/register/", form);
      }
      const { data } = await api.post("auth/token/", {
        email: form.email,
        password: form.password,
      });
      saveTokens(data);
      onAuthenticated();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand-light"><span className="brand-mark"><Leaf size={18} /></span> savewise</div>
        <div className="auth-story-copy">
          <span className="eyebrow eyebrow-light">A little more clarity. A lot more confidence.</span>
          <h1>Your money,<br /><em>in balance.</em></h1>
          <p>Make room for what matters. Keep your everyday spending, savings, and goals in one calm, clear place.</p>
        </div>
        <div className="auth-story-bottom">
          <div className="story-orbit"><span /><span /><span /><Wallet size={28} /></div>
          <span>Built for your life in Uganda <b>·</b> UGX by default</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand brand"><span className="brand-mark"><Leaf size={18} /></span> savewise</div>
        <div className="auth-form-wrap">
          <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "YOUR NEXT CHAPTER"}</span>
          <h2>{mode === "login" ? "Good to see you." : "Let's get started."}</h2>
          <p className="auth-description">{mode === "login" ? "Sign in to pick up right where you left off." : "Create your account and take the first step towards financial clarity."}</p>
          <div className="auth-switch" role="tablist" aria-label="Account options">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <div className="field-row">
                <label className="field"><span>First name</span><input name="first_name" autoComplete="given-name" value={form.first_name} onChange={update} placeholder="Amina" /></label>
                <label className="field"><span>Last name</span><input name="last_name" autoComplete="family-name" value={form.last_name} onChange={update} placeholder="Nabirye" /></label>
              </div>
            )}
            <label className="field">
              <span>Email address</span>
              <span className="input-icon"><Mail size={17} /><input type="email" name="email" aria-label="Email address" autoComplete="email" required value={form.email} onChange={update} placeholder="you@example.com" /></span>
            </label>
            <div className="field">
              <span>Password</span>
              <span className="input-icon"><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} name="password" aria-label="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={form.password} onChange={update} placeholder="At least 8 characters" /><button className="reveal-button" type="button" aria-label={showPassword ? "Hide secret" : "Reveal secret"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "One moment..." : mode === "login" ? "Sign in to SaveWise" : "Create my account"}{!busy && <ArrowRight size={17} />}</button>
          </form>
          <p className="auth-privacy">Your financial data is private and securely tied to your account.</p>
        </div>
        <div className="auth-footer"><span>© {new Date().getFullYear()} SaveWise</span><span>Thoughtful money management</span></div>
      </section>
    </main>
  );
}
