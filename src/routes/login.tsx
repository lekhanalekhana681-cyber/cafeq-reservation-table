import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, LogIn, Coffee, ShieldCheck, ArrowRight, KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { resetPasswordDirect, requestPasswordReset } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: (search["redirect"] as string) || undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTarget = search.redirect || "/reserve";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password mode
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "reset" | "done">("request");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Redirect if already logged in
  if (isAuthenticated && !isForgotMode) {
    navigate({ to: redirectTarget });
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await login({ email, password });
      if (res.success && res.user) {
        toast.success(`Welcome back, ${res.user.name}!`);
        navigate({ to: redirectTarget });
      } else {
        setErrorMessage(res.error || "Invalid credentials. Please try again.");
        toast.error(res.error || "Login failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your registered email address.");
      return;
    }

    setForgotLoading(true);
    try {
      if (forgotStep === "request") {
        await requestPasswordReset(forgotEmail);
        setForgotStep("reset");
        toast.info("Account verified. Please set your new password below.");
      } else if (forgotStep === "reset") {
        if (newPassword.length < 6) {
          toast.error("New password must be at least 6 characters.");
          return;
        }
        const res = await resetPasswordDirect(forgotEmail, newPassword);
        if (res.success) {
          setForgotStep("done");
          toast.success("Password reset successfully! You can now log in.");
        } else {
          toast.error(res.error || "Failed to reset password.");
        }
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <PageBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-xl backdrop-blur-md">
          {/* Brand header */}
          <div className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Coffee className="size-6 text-accent" />
            </div>
            <p className="eyebrow mt-4">Welcome to CafeQ</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-display font-semibold text-foreground">
              {isForgotMode ? "Reset Password" : "Sign In to Your Account"}
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
              {isForgotMode
                ? "Enter your email to verify and choose a new password."
                : "Manage your reservations, view booking history, and unlock priority table booking."}
            </p>
          </div>

          {/* Regular Login Form */}
          {!isForgotMode && (
            <>
              {errorMessage && (
                <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs sm:text-sm text-destructive font-medium">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
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
                    placeholder="you@example.com"
                    className="mt-1.5"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotMode(true);
                        setForgotEmail(email);
                        setForgotStep("request");
                      }}
                      className="text-xs text-accent hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pr-10"
                      autoComplete="current-password"
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

                <div className="pt-2">
                  <Button type="submit" disabled={loading} className="w-full font-medium shadow-md">
                    {loading ? (
                      "Signing In…"
                    ) : (
                      <>
                        <LogIn className="size-4 mr-2" /> Sign In
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-6 border-t border-border/70 pt-5 text-center text-xs text-muted-foreground">
                Don't have an account yet?{" "}
                <Link
                  to="/register"
                  search={{ redirect: redirectTarget }}
                  className="font-semibold text-accent hover:underline inline-flex items-center gap-1"
                >
                  Create an account <ArrowRight className="size-3" />
                </Link>
              </div>
            </>
          )}

          {/* Forgot Password Flow */}
          {isForgotMode && (
            <div className="mt-6">
              {forgotStep === "done" ? (
                <div className="text-center py-4 space-y-3">
                  <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-medium text-foreground">Password updated successfully!</p>
                  <Button
                    onClick={() => {
                      setIsForgotMode(false);
                      setForgotStep("request");
                    }}
                    className="w-full mt-4"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="forgotEmail" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Account Email
                    </Label>
                    <Input
                      id="forgotEmail"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5"
                      disabled={forgotStep === "reset"}
                    />
                  </div>

                  {forgotStep === "reset" && (
                    <div>
                      <Label htmlFor="newPassword" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        New Password
                      </Label>
                      <Input
                        id="newPassword"
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="mt-1.5"
                      />
                    </div>
                  )}

                  <div className="pt-2 flex flex-col gap-2">
                    <Button type="submit" disabled={forgotLoading} className="w-full">
                      {forgotLoading ? (
                        "Processing…"
                      ) : forgotStep === "request" ? (
                        <>
                          <KeyRound className="size-4 mr-2" /> Verify Email
                        </>
                      ) : (
                        "Set New Password"
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsForgotMode(false)}
                      className="w-full text-xs text-muted-foreground"
                    >
                      Back to Sign In
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="size-3.5 text-accent" />
            <span>Secure bcrypt-hashed authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
}
