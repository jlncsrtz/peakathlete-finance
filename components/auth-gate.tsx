"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function checkSession() {
      setReady(false);
      setSetupError("");

      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        const isLoginPage = pathname === "/login";

        if (!session && !isLoginPage) {
          router.replace("/login");
          return;
        }

        if (session && isLoginPage) {
          router.replace("/");
          return;
        }

        setReady(true);

        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;

          if (!nextSession && pathname !== "/login") {
            router.replace("/login");
          }

          if (nextSession && pathname === "/login") {
            router.replace("/");
          }
        });

        unsubscribe = () => data.subscription.unsubscribe();
      } catch (error) {
        if (!active) return;

        setSetupError(
          error instanceof Error
            ? error.message
            : "Supabase authentication is not configured.",
        );

        setReady(true);
      }
    }

    void checkSession();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [pathname, router]);

  if (setupError) {
    return (
      <main className="auth-loading auth-setup-error">
        <div>
          <strong>Login setup required</strong>
          <p>{setupError}</p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="auth-loading">
        <Loader2 className="spin" size={24} />
        <span>Checking session…</span>
      </main>
    );
  }

  return children;
}
