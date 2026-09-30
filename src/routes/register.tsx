import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, UserPlus, Coffee, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: (search["redirect"] as string) || undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register: registerAuth, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTarget = search.redirect || "/reserve";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already logged in, redirect
  if (isAuthenticated) {
    navigate({ to: redirectTarget });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!phone.trim()) {
      setErrorMessage("Please enter your phone number.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please verify.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerAuth({
        name,
        email,
        phone,
        password,
        confirmPassword,
      });

      if (res.success && res.user) {
        toast.success(`Welcome to Cafeq, ${res.user.name}! Your account has been created.`);
        navigate({ to: redirectTarget });
      } else {
        setErrorMessage(res.error || "Failed to create account. Please try again.");
        toast.error(res.error || "Registration failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <PageBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Coffee className="size-6 text-accent" />
            </div>
            <p className="eyebrow mt-4">Join CafeQ</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-display font-semibold text-foreground">
              Create an Account
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
              Sign up to reserve tables, pre-order dishes, and access your personalized bookings.
            </p>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs sm:text-sm text-destructive font-medium">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1.5"
                autoComplete="name"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="mt-1.5"
                autoComplete="email"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1.5"
                autoComplete="tel"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confirm Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={loading} className="w-full font-medium shadow-md">
                {loading ? (
                  "Creating Account…"
                ) : (
                  <>
                    <UserPlus className="size-4 mr-2" /> Register & Continue
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Footer note */}
          <div className="mt-6 border-t border-border/70 pt-5 text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              search={{ redirect: redirectTarget }}
              className="font-semibold text-accent hover:underline inline-flex items-center gap-1"
            >
              Sign In <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="size-3.5 text-accent" />
            <span>Passwords are securely encrypted with bcrypt.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
