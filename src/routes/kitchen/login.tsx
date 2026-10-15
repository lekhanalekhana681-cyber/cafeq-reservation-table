import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChefHat, Eye, EyeOff, Lock, UserCheck, ArrowLeft, AlertCircle, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { loginKitchen, getCurrentKitchen, seedDefaultKitchen } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/kitchen/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: (search["redirect"] as string) || undefined,
  }),
  component: KitchenLoginPage,
});

function KitchenLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTarget = search.redirect || "/kitchen";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto seed in browser if not already seeded
  useEffect(() => {
    seedDefaultKitchen();
    const currentKitchen = getCurrentKitchen();
    if (currentKitchen) {
      navigate({ to: redirectTarget });
    }
  }, [navigate, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim()) {
      setErrorMessage("Please enter your kitchen staff username or email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your kitchen password.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginKitchen({ identifier, password });
      if (res.success && res.user) {
        toast.success(`Kitchen Terminal Unlocked. Welcome, ${res.user.name}`);
        navigate({ to: redirectTarget });
      } else {
        setErrorMessage(res.error || "Authentication failed. Invalid kitchen staff credentials.");
        toast.error(res.error || "Kitchen login failed.");
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
      {/* Background radial glow */}
      <div className="absolute top-1/4 -left-20 size-96 rounded-full bg-orange-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 size-96 rounded-full bg-amber-800/10 blur-3xl pointer-events-none" />

      {/* Return to main site */}
      <div className="w-full max-w-md mb-6 flex justify-between items-center z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-orange-400 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to CafeQ Site
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-neutral-500 font-mono">
          KDS STATION V2.0
        </span>
      </div>

      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 mb-4 shadow-inner">
            <ChefHat className="size-8" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-500">
            Kitchen Operations
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold tracking-tight text-neutral-50">
            Kitchen Display Login
          </h1>
          <p className="mt-2 text-xs text-neutral-400">
            Access live order tickets, prep timers, item checklist & station routing
          </p>
        </div>

        {/* Development default hint */}
        <div className="mt-6 p-3.5 rounded-xl bg-orange-950/40 border border-orange-800/40 text-[12px] text-orange-200">
          <p className="font-semibold flex items-center gap-1.5 text-orange-300">
            <UtensilsCrossed className="size-3.5" /> Development Default Credentials:
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2 text-neutral-300 font-mono text-[11px]">
            <div>User: <span className="text-orange-300 font-bold">Kitchen</span></div>
            <div>Pass: <span className="text-orange-300 font-bold">Kitchen@123</span></div>
          </div>
          <p className="mt-1.5 text-[10px] text-neutral-400 italic">
            Configured via KITCHEN_USERNAME / KITCHEN_PASSWORD environment variables.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kitchen-id" className="text-xs text-neutral-300 font-medium">
              Kitchen Username or Email
            </Label>
            <div className="relative">
              <Input
                id="kitchen-id"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Kitchen or kitchen@cafeq.com"
                className="bg-neutral-950/60 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-orange-500 h-11 text-sm pl-3.5"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="kitchen-password" className="text-xs text-neutral-300 font-medium">
                Kitchen Password
              </Label>
            </div>
            <div className="relative">
              <Input
                id="kitchen-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="bg-neutral-950/60 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-orange-500 h-11 text-sm pl-3.5 pr-10"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-2 bg-orange-600 hover:bg-orange-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-orange-950/50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ChefHat className="size-4" />
            )}
            <span>{loading ? "Authenticating..." : "Unlock Kitchen Console"}</span>
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-neutral-800 text-center text-xs text-neutral-500">
          <p>Restricted terminal for authorised kitchen staff & management only.</p>
        </div>
      </div>
    </div>
  );
}
