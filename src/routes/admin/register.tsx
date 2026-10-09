import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowLeft, KeyRound, User, Phone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { registerAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/register")({
  component: AdminRegisterPage,
});

function AdminRegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter your administrator full name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your work email.");
      return;
    }
    if (!adminCode.trim()) {
      setErrorMessage("Please provide the Administrator Authorization Passcode.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerAdmin({
        name,
        email,
        phone,
        adminCode,
        password,
        confirmPassword,
      });

      if (res.success && res.user) {
        toast.success(`Admin account for ${res.user.name} created successfully!`);
        navigate({ to: "/admin" });
      } else {
        setErrorMessage(res.error || "Failed to create administrator account.");
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 -left-20 size-96 rounded-full bg-amber-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 size-96 rounded-full bg-amber-800/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg mb-6 flex justify-between items-center z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to CafeQ Site
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-neutral-500 font-mono">
          STAFF ONBOARDING
        </span>
      </div>

      <div className="w-full max-w-lg bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-4 shadow-inner">
            <ShieldCheck className="size-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
            Staff Authorization
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold tracking-tight text-neutral-50">
            Admin Account Registration
          </h1>
          <p className="mt-2 text-xs text-neutral-400">
            Create an administrator account with your cafe management authorization passcode.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 text-xs text-red-300">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Staff Name
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Manager Name"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 h-10"
                />
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Work Email
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cafeq.com"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 h-10"
                />
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Contact Phone
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 90000 00000"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 h-10"
                />
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Admin Auth Passcode
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type={showCode ? "text" : "password"}
                  required
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Master Passcode"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 pr-10 h-10"
                />
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 focus:outline-none"
                  aria-label={showCode ? "Hide passcode" : "Show passcode"}
                >
                  {showCode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 chars"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 pr-10 h-10"
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

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Confirm Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="bg-neutral-950/80 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 h-10"
                />
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            Default system authorization passcode is: <span className="font-mono text-amber-400">CafeQAdmin2026!</span>
          </p>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold h-11 transition-colors shadow-lg shadow-amber-950/50"
            >
              {loading ? "Creating Administrator Account…" : "Register Administrator & Open Dashboard"}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-neutral-800/80 text-center">
          <p className="text-xs text-neutral-400">
            Already have an admin account?{" "}
            <Link to="/admin/login" className="font-semibold text-amber-500 hover:underline">
              Sign In to Console
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
