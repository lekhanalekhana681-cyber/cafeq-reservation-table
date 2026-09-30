import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { loginAdmin, getCurrentAdmin, seedDefaultAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: (search["redirect"] as string) || undefined,
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTarget = search.redirect || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto seed in browser if not already seeded
  useEffect(() => {
    seedDefaultAdmin();
    const currentAdmin = getCurrentAdmin();
    if (currentAdmin) {
      navigate({ to: redirectTarget });
    }
  }, [navigate, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage("Please enter your administrator email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your administrator password.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginAdmin({ email, password });
      if (res.success && res.user) {
        toast.success(`Welcome to Management Console, ${res.user.name}`);
        navigate({ to: redirectTarget });
      } else {
        setErrorMessage(res.error || "Authentication failed. Invalid administrator credentials.");
        toast.error(res.error || "Admin login failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected authentication error occurred.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 -left-20 size-96 rounded-full bg-amber-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 size-96 rounded-full bg-amber-800/10 blur-3xl pointer-events-none" />

      {/* Return to main site */}
      <div className="w-full max-w-md mb-6 flex justify-between items-center z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to CafeQ Site
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-neutral-500 font-mono">
          PORTAL V2.4
        </span>
      </div>

      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-4 shadow-inner">
            <ShieldCheck className="size-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
            Internal Operations
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold tracking-tight text-neutral-50">
            Admin Console
          </h1>
          <p className="mt-2 text-xs text-neutral-400">
            Restricted access portal for CafeQ restaurant managers and staff.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label
              htmlFor="admin-email"
              className="text-xs font-semibold uppercase tracking-wider text-neutral-400"
            >
              Admin Email
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@cafeq.com"
                className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 pl-10 h-11"
                autoComplete="email"
              />
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
            </div>
          </div>

          <div>
            <Label
              htmlFor="admin-password"
              className="text-xs font-semibold uppercase tracking-wider text-neutral-400"
            >
              Master Password
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 pl-10 pr-10 h-11"
                autoComplete="current-password"
              />
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold h-11 transition-colors shadow-lg shadow-amber-950/50"
            >
              {loading ? "Verifying Credentials…" : "Authenticate & Open Console"}
            </Button>
          </div>
        </form>

        {/* Security notice */}
        <div className="mt-6 pt-5 border-t border-neutral-800/80 text-center">
          <p className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
            <Lock className="size-3 text-amber-500/70" />
            <span>2-Hour Session Timeout · Rate-limited login monitoring</span>
          </p>
        </div>
      </div>
    </div>
  );
}
