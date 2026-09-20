"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign in. Check your email and password.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-emblem">PA</span>
          <div>
            <strong>
              PEAK<span>ATHLETE</span>
            </strong>
            <p>Finance Portal</p>
          </div>
        </div>

        <div className="login-heading">
          <p>SECURE ACCESS</p>
          <h1>Welcome back</h1>
          <span>Sign in to manage PeakAthlete finance records.</span>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <div className="login-input-wrap">
              <Mail size={17} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@peakathlete.com"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="login-input-wrap">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {errorMessage && <div className="login-error">{errorMessage}</div>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading && <Loader2 className="spin" size={17} />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-note">
          Accounts are created by the PeakAthlete administrator. Public sign-up is disabled.
        </p>
      </section>
    </main>
  );
}
