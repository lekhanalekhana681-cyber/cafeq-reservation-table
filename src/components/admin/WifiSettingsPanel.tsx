import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Save, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_TOKEN_KEY, wifiAdminApi, type WifiSettings } from "@/lib/wifi";

const readToken = () => {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
};

/** ISO timestamp ↔ <input type="datetime-local"> value (admin's local time) */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

type Form = { ssid: string; password: string; validFrom: string; validUntil: string; sessionMinutes: number };

const EMPTY_FORM: Form = { ssid: "", password: "", validFrom: "", validUntil: "", sessionMinutes: 120 };

/**
 * Admin › WiFi Settings. Stored in public.wifi_settings (not readable with the public key)
 * and saved through /api/wifi with the server-verified admin token.
 */
export function WifiSettingsPanel({ defaultIdentifier }: { defaultIdentifier?: string }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [identifier, setIdentifier] = useState(defaultIdentifier || "");
  const [adminPassword, setAdminPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const lock = useCallback((message?: string) => {
    try {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    if (message) toast.error(message);
  }, []);

  const apply = (s: WifiSettings) => {
    setForm({
      ssid: s.ssid,
      password: s.password,
      validFrom: toLocalInput(s.valid_from),
      validUntil: toLocalInput(s.valid_until),
      sessionMinutes: s.session_minutes,
    });
    setMeta({ updatedAt: s.updated_at, updatedBy: s.updated_by });
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    wifiAdminApi<{ settings: WifiSettings }>(token, "admin_get")
      .then((res) => apply(res.settings))
      .catch((err) => (err?.status === 401 ? lock("Your admin session expired. Please unlock WiFi settings again.") : toast.error(err?.message || "Could not load WiFi settings.")))
      .finally(() => setLoading(false));
  }, [token, lock]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    try {
      const res = await wifiAdminApi<{ token: string }>(null, "admin_login", { identifier, password: adminPassword });
      try {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      } catch {
        // ignore
      }
      setToken(res.token);
      setAdminPassword("");
      toast.success("WiFi settings unlocked for 2 hours.");
    } catch (err: any) {
      toast.error(err?.message || "Could not unlock WiFi settings.");
    } finally {
      setUnlocking(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8 || form.password.length > 63) {
      toast.error("The WiFi password must be 8–63 characters.");
      return;
    }
    if (form.validFrom && form.validUntil && new Date(form.validUntil) <= new Date(form.validFrom)) {
      toast.error('"Valid until" must be after "Valid from".');
      return;
    }
    setSaving(true);
    try {
      const res = await wifiAdminApi<{ settings: WifiSettings }>(token, "admin_save", {
        settings: {
          ssid: form.ssid.trim(),
          password: form.password,
          valid_from: fromLocalInput(form.validFrom),
          valid_until: fromLocalInput(form.validUntil),
          session_minutes: form.sessionMinutes,
        },
      });
      apply(res.settings);
      toast.success("WiFi settings saved.");
    } catch (err: any) {
      if (err?.status === 401) lock("Your admin session expired. Please unlock WiFi settings again.");
      else toast.error(err?.message || "Could not save WiFi settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <form onSubmit={unlock} className="max-w-md mx-auto rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Lock className="size-5" />
          </div>
          <div>
            <h2 className="font-bold text-neutral-100">Unlock WiFi Settings</h2>
            <p className="text-xs text-neutral-400">The WiFi password is kept on the server — confirm your admin password.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wifi-admin-id" className="text-xs text-neutral-300">Admin email</Label>
          <Input
            id="wifi-admin-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="bg-neutral-950 border-neutral-800 text-neutral-100"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wifi-admin-pw" className="text-xs text-neutral-300">Password</Label>
          <Input
            id="wifi-admin-pw"
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            autoComplete="current-password"
            className="bg-neutral-950 border-neutral-800 text-neutral-100"
          />
        </div>
        <Button type="submit" disabled={unlocking || !identifier || !adminPassword} className="w-full bg-amber-600 hover:bg-amber-500 text-neutral-950 font-semibold">
          {unlocking ? <Loader2 className="size-4 animate-spin mr-2" /> : <Lock className="size-4 mr-2" />}
          Unlock
        </Button>
      </form>
    );
  }

  const inputClass = "bg-neutral-950 border-neutral-800 text-neutral-100";

  return (
    <form onSubmit={save} className="max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Wifi className="size-4 text-amber-400" />
        <h3 className="font-semibold text-sm text-neutral-100">WiFi Settings</h3>
        <span className="text-[11px] text-neutral-500">
          Shown only to customers with a confirmed reservation, from 15 min before their slot until 30 min after it ends.
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wifi-ssid" className="text-xs text-neutral-300">Network name (SSID)</Label>
              <Input
                id="wifi-ssid"
                value={form.ssid}
                maxLength={32}
                required
                onChange={(e) => setForm((f) => ({ ...f, ssid: e.target.value }))}
                placeholder="CafeQ-Guest"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wifi-password" className="text-xs text-neutral-300">Password</Label>
              <div className="relative">
                <Input
                  id="wifi-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  minLength={8}
                  maxLength={63}
                  required
                  autoComplete="new-password"
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-amber-400"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">8–63 characters (WPA/WPA2)</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wifi-from" className="text-xs text-neutral-300">Valid from (optional)</Label>
              <Input
                id="wifi-from"
                type="datetime-local"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wifi-until" className="text-xs text-neutral-300">Valid until (optional)</Label>
              <Input
                id="wifi-until"
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wifi-session" className="text-xs text-neutral-300">Reservation length (min)</Label>
              <Input
                id="wifi-session"
                type="number"
                min={30}
                max={720}
                value={form.sessionMinutes}
                onChange={(e) => setForm((f) => ({ ...f, sessionMinutes: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-[11px] text-neutral-500">
            Leave the validity window empty to keep these details active until you change them. Outside the window customers see
            "please ask our staff".
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-neutral-500">
              {meta.updatedAt ? `Last updated ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}` : "Not set up yet"}
            </span>
            <Button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-500 text-neutral-950 font-semibold">
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
              Save WiFi Settings
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
