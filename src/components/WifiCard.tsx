import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, Eye, EyeOff, Loader2, Lock, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildWifiQrValue,
  fetchWifiAccess,
  requestWifiSession,
  WifiApiError,
  type WifiAccess,
} from "@/lib/wifi";

const POLL_MS = 60_000;

const timeIst = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "";

/**
 * "Cafe WiFi" card for one reservation. Renders nothing for guests, other order types or
 * cancelled bookings. The password is only ever received from /api/wifi when the server
 * says the reservation is inside its access window.
 */
export function WifiCard({ code, refreshKey, className = "" }: { code: string; refreshKey?: unknown; className?: string }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<WifiAccess | null>(null);
  const [problem, setProblem] = useState<"login" | "unavailable" | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const result = await fetchWifiAccess(user.id, [code]);
      setAccess(result[code] ?? null);
      setProblem(null);
    } catch (err) {
      setAccess(null);
      setProblem(err instanceof WifiApiError && err.code === "LOGIN_REQUIRED" ? "login" : "unavailable");
      if (!(err instanceof WifiApiError && err.code === "LOGIN_REQUIRED")) {
        console.warn("[wifi] access check failed:", err instanceof Error ? err.message : err);
      }
    } finally {
      setLoading(false);
    }
  }, [user, code]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Re-check until the details unlock; hide them again when the window closes.
  useEffect(() => {
    if (!access) return;
    if (access.status === "available" && access.available_until) {
      const ms = new Date(access.available_until).getTime() - Date.now() + 1000;
      const t = setTimeout(load, Math.min(Math.max(ms, 1000), 2_147_000_000));
      return () => clearTimeout(t);
    }
    if (["not_yet", "awaiting_confirmation", "awaiting_payment", "not_configured"].includes(access.status)) {
      const t = setInterval(load, POLL_MS);
      return () => clearInterval(t);
    }
  }, [access, load]);

  if (!user) return null;
  if (access && ["cancelled", "not_dine_in", "not_found"].includes(access.status)) return null;
  if (loading) return null;

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPw) return;
    setUnlocking(true);
    const ok = await requestWifiSession(user.email, confirmPw, user.id);
    setUnlocking(false);
    setConfirmPw("");
    if (ok) {
      setLoading(true);
      await load();
    } else {
      toast.error("That password didn't match. Please try again.");
    }
  };

  const copyPassword = async () => {
    if (!access?.password) return;
    try {
      await navigator.clipboard.writeText(access.password);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = access.password;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const message = (() => {
    if (problem === "unavailable") return "WiFi details aren't available right now. Please ask our staff at the counter.";
    switch (access?.status) {
      case "not_yet":
        return "WiFi details will be available at your reservation time.";
      case "ended":
        return "WiFi access for this reservation has ended.";
      case "awaiting_confirmation":
        return "WiFi details will appear once the cafe confirms your reservation.";
      case "awaiting_payment":
        return "Complete your payment to unlock the cafe WiFi.";
      case "not_configured":
        return "WiFi details will be available at your reservation time. If you're here already, please ask our staff.";
      default:
        return null;
    }
  })();

  return (
    <section
      aria-label="Cafe WiFi"
      className={`rounded-2xl border border-accent/30 bg-card p-5 text-left shadow-warm ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Wifi className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-semibold text-base text-foreground">Cafe WiFi</h3>
          {access?.available_from && access?.available_until && (
            <p className="text-[11px] text-muted-foreground">
              Available {timeIst(access.available_from)} – {timeIst(access.available_until)} IST
            </p>
          )}
        </div>
      </div>

      {problem === "login" && (
        <form onSubmit={unlock} className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">Confirm your account password to see the WiFi details.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              aria-label="Account password"
              className="sm:flex-1"
            />
            <Button type="submit" disabled={unlocking || !confirmPw} className="shrink-0">
              {unlocking ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Lock className="size-4 mr-1.5" />}
              Unlock WiFi
            </Button>
          </div>
        </form>
      )}

      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}

      {access?.status === "available" && access.ssid && access.password && (
        <div className="mt-4 flex flex-col sm:flex-row gap-5 sm:items-center">
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Network</p>
              <p className="font-semibold text-foreground break-all">{access.ssid}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Password</p>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                <span className="flex-1 min-w-0 font-mono text-sm text-foreground break-all">
                  {showPassword ? access.password : "•".repeat(Math.min(access.password.length, 12))}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="button" onClick={copyPassword} className="w-full sm:w-auto">
              {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
              {copied ? "Copied!" : "Copy password"}
            </Button>
          </div>
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <QRCode value={buildWifiQrValue(access.ssid, access.password)} size={132} aria-label="WiFi QR code" />
            </div>
            <span className="text-[11px] text-muted-foreground">Scan with your phone camera</span>
          </div>
        </div>
      )}
    </section>
  );
}
