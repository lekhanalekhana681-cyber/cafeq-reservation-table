import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings2,
  UserX,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatIst,
  formatPaise,
  paymentsAdminApi,
  PAYMENT_STATE_LABELS,
  type PaymentState,
  type PreorderPaymentMode,
} from "@/lib/prepayment";
import { getCafeSettings } from "@/lib/settings.functions";

const TOKEN_KEY = "cafeq_payments_admin_token";

type PaymentRow = {
  id: string;
  kind: "deposit" | "full" | "balance";
  status: string;
  method: string | null;
  amount_paise: number;
  refunded_amount_paise: number;
  razorpay_payment_id: string | null;
  collected_by: string | null;
  captured_at: string | null;
};

type AuditRow = { action: string; amount_paise: number | null; reason: string | null; actor: string; created_at: string };

type OrderRow = {
  code: string;
  name: string;
  phone: string;
  order_type: string;
  status: string;
  payment_state: PaymentState;
  total_amount_paise: number;
  deposit_due_paise: number;
  amount_paid_paise: number;
  balance_due_paise: number;
  scheduled_at: string | null;
  forfeit_reason: string | null;
  created_at: string;
  payments: PaymentRow[];
  audit: AuditRow[];
};

type Listing = {
  orders: OrderRow[];
  totals: { collected_paise: number; refunded_paise: number; forfeited_paise: number };
  daily: Array<{ day: string; collected_paise: number; refunded_paise: number; forfeited_paise: number }>;
};

type Filter = "all" | "paid" | "pending" | "refunded" | "forfeited";

const STATE_CLASS: Record<PaymentState, string> = {
  UNPAID: "bg-neutral-800 text-neutral-400 border-neutral-700",
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PARTIALLY_PAID: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PAID: "bg-emerald-600/25 text-emerald-200 border-emerald-500/40",
  REFUNDED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  PARTIALLY_REFUNDED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  FORFEITED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

/** Online refundable amount left on an order (Razorpay payments only). */
const refundablePaise = (o: OrderRow) =>
  o.payments
    .filter((p) => p.razorpay_payment_id && (p.status === "captured" || p.status === "partially_refunded"))
    .reduce((s, p) => s + p.amount_paise - p.refunded_amount_paise, 0);

export function PaymentsPanel({ defaultIdentifier }: { defaultIdentifier?: string }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [identifier, setIdentifier] = useState(defaultIdentifier || "");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    preorderPaymentMode: "DEPOSIT" as PreorderPaymentMode,
    depositPercent: 30,
    depositMinInr: 50,
    refundCutoffMinutes: 30,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const lock = useCallback((message?: string) => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setData(null);
    if (message) toast.error(message);
  }, []);

  const call = useCallback(
    async <T,>(action: string, params: Record<string, unknown> = {}): Promise<T | null> => {
      try {
        return await paymentsAdminApi<T>(token, action, params);
      } catch (err: any) {
        if (err?.status === 401) lock(err.message);
        else toast.error(err?.message || "Payment action failed.");
        return null;
      }
    },
    [token, lock]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await call<Listing>("list", { filter });
    if (res) setData(res);
    setLoading(false);
  }, [token, filter, call]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getCafeSettings()
      .then((s) =>
        setSettings({
          preorderPaymentMode: s.preorderPaymentMode,
          depositPercent: s.depositPercent,
          depositMinInr: s.depositMinInr,
          refundCutoffMinutes: s.refundCutoffMinutes,
        })
      )
      .catch(() => {});
  }, []);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    try {
      const res = await paymentsAdminApi<{ token: string }>(null, "login", { identifier, password });
      try {
        sessionStorage.setItem(TOKEN_KEY, res.token);
      } catch {
        // ignore
      }
      setToken(res.token);
      setPassword("");
      toast.success("Payments unlocked for 2 hours.");
    } catch (err: any) {
      toast.error(err?.message || "Could not unlock payments.");
    } finally {
      setUnlocking(false);
    }
  };

  /** Runs one admin action with a per-order lock so double clicks can't repeat it. */
  const act = async (code: string, action: string, params: Record<string, unknown>, success: string) => {
    if (busyCode) return;
    setBusyCode(code);
    const res = await call(action, { code, ...params });
    if (res) {
      toast.success(success);
      await load();
    }
    setBusyCode(null);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const res = await call("settings", {
      settings: {
        preorder_payment_mode: settings.preorderPaymentMode,
        deposit_percent: settings.depositPercent,
        deposit_min_inr: settings.depositMinInr,
        refund_cutoff_minutes: settings.refundCutoffMinutes,
      },
    });
    if (res) toast.success("Pre-order payment settings saved.");
    setSavingSettings(false);
  };

  if (!token) {
    return (
      <form
        onSubmit={unlock}
        className="max-w-md mx-auto rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Lock className="size-5" />
          </div>
          <div>
            <h2 className="font-bold text-neutral-100">Unlock Payments</h2>
            <p className="text-xs text-neutral-400">
              Refunds and balance collection are verified on the server — confirm your admin password.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-admin-id" className="text-xs text-neutral-300">Admin email</Label>
          <Input
            id="pay-admin-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="bg-neutral-950 border-neutral-800 text-neutral-100"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-admin-pw" className="text-xs text-neutral-300">Password</Label>
          <Input
            id="pay-admin-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="bg-neutral-950 border-neutral-800 text-neutral-100"
          />
        </div>
        <Button type="submit" disabled={unlocking || !identifier || !password} className="w-full bg-amber-600 hover:bg-amber-500 text-neutral-950 font-semibold">
          {unlocking ? <Loader2 className="size-4 animate-spin mr-2" /> : <Lock className="size-4 mr-2" />}
          Unlock
        </Button>
      </form>
    );
  }

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      {/* Settings */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="size-4 text-amber-400" />
          <h3 className="font-semibold text-sm text-neutral-100">Pre-order Payment Settings</h3>
          <span className="text-[11px] text-neutral-500">Applies to new pre-orders (future pickup/arrival with food prepared ahead)</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-300">Mode</Label>
            <select
              value={settings.preorderPaymentMode}
              onChange={(e) => setSettings((s) => ({ ...s, preorderPaymentMode: e.target.value as PreorderPaymentMode }))}
              className="w-full h-9 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs px-3"
            >
              <option value="DEPOSIT">Deposit</option>
              <option value="FULL">Full prepayment</option>
              <option value="NONE">No online payment</option>
            </select>
          </div>
          {(
            [
              ["depositPercent", "Deposit %", 1, 100],
              ["depositMinInr", "Minimum deposit (₹)", 0, 100000],
              ["refundCutoffMinutes", "Free-cancel cutoff (min before)", 0, 10080],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-neutral-300">{label}</Label>
              <Input
                type="number"
                min={min}
                max={max}
                value={settings[key]}
                disabled={key !== "refundCutoffMinutes" && settings.preorderPaymentMode !== "DEPOSIT"}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
                className="h-9 bg-neutral-950 border-neutral-800 text-neutral-100 text-xs"
              />
            </div>
          ))}
          <Button onClick={saveSettings} disabled={savingSettings} className="h-9 bg-amber-600 hover:bg-amber-500 text-neutral-950 text-xs font-semibold">
            {savingSettings ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
            Save settings
          </Button>
        </div>
      </section>

      {/* Totals */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Collected online", totals?.collected_paise, "text-emerald-300", Wallet],
          ["Refunded", totals?.refunded_paise, "text-blue-300", RotateCcw],
          ["Forfeited (kept)", totals?.forfeited_paise, "text-rose-300", UserX],
        ].map(([label, value, cls, Icon]: any) => (
          <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 flex items-center gap-3">
            <Icon className={`size-5 ${cls}`} />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
              <p className={`text-lg font-bold font-mono ${cls}`}>{formatPaise(value ?? 0)}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Daily summary (IST) */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 overflow-x-auto">
        <h3 className="font-semibold text-sm text-neutral-100 mb-3 flex items-center gap-2">
          <CalendarClock className="size-4 text-amber-400" /> Daily Summary (IST, last 14 days)
        </h3>
        <table className="w-full text-xs">
          <thead className="text-neutral-500 text-[10px] uppercase">
            <tr>
              <th className="text-left py-1.5 pr-3">Day</th>
              <th className="text-right py-1.5 px-3">Deposits collected</th>
              <th className="text-right py-1.5 px-3">Refunded</th>
              <th className="text-right py-1.5 pl-3">Forfeited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/70 font-mono">
            {(data?.daily ?? []).map((d) => (
              <tr key={d.day} className="text-neutral-300">
                <td className="py-1.5 pr-3 font-sans">
                  {new Date(`${d.day}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", weekday: "short" })}
                </td>
                <td className="text-right py-1.5 px-3 text-emerald-300">{formatPaise(d.collected_paise)}</td>
                <td className="text-right py-1.5 px-3 text-blue-300">{formatPaise(d.refunded_paise)}</td>
                <td className="text-right py-1.5 pl-3 text-rose-300">{formatPaise(d.forfeited_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Orders */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "paid", "pending", "refunded", "forfeited"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  filter === f ? "bg-amber-600 text-neutral-950" : "bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-neutral-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 text-xs border-neutral-700 bg-neutral-900 text-neutral-300">
              <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => lock()} className="h-8 text-xs text-neutral-400">
              <Lock className="size-3.5 mr-1.5" /> Lock
            </Button>
          </div>
        </div>

        {!data ? (
          <p className="text-xs text-neutral-500 py-8 text-center">{loading ? "Loading payments…" : "No data."}</p>
        ) : data.orders.length === 0 ? (
          <p className="text-xs text-neutral-500 py-8 text-center">No pre-order payments match this filter.</p>
        ) : (
          <div className="space-y-2.5">
            {data.orders.map((o) => {
              const busy = busyCode === o.code;
              const refundable = refundablePaise(o);
              const active = !["cancelled", "no_show", "completed", "billed", "expired", "pending_payment"].includes(o.status);
              const paidOnline = o.amount_paid_paise > 0;
              return (
                <article key={o.code} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">#{o.code}</span>
                        <Badge variant="outline" className={`text-[10px] ${STATE_CLASS[o.payment_state]}`}>
                          {PAYMENT_STATE_LABELS[o.payment_state]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-400 capitalize">
                          {o.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-neutral-300 mt-1">
                        {o.name} · {o.phone} · {o.order_type.replace("_", "-").toLowerCase()} · due {formatIst(o.scheduled_at)}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
                        Total {formatPaise(o.total_amount_paise)} · Paid {formatPaise(o.amount_paid_paise)} · Balance{" "}
                        <span className="text-amber-300">{formatPaise(o.balance_due_paise)}</span>
                        {refundable > 0 && <> · Refundable online {formatPaise(refundable)}</>}
                      </p>
                      {o.forfeit_reason && <p className="text-[11px] text-rose-300 mt-0.5">Forfeit reason: {o.forfeit_reason}</p>}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {active && o.balance_due_paise > 0 && (
                        <>
                          <Button size="sm" disabled={busy} className="h-8 text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white"
                            onClick={() => act(o.code, "collect", { method: "cash" }, `Collected ${formatPaise(o.balance_due_paise)} in cash`)}>
                            <Banknote className="size-3.5 mr-1" /> Collect {formatPaise(o.balance_due_paise)} cash
                          </Button>
                          <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-emerald-700 text-emerald-300 bg-transparent"
                            onClick={() => act(o.code, "collect", { method: "upi" }, `Collected ${formatPaise(o.balance_due_paise)} via UPI`)}>
                            <QrCode className="size-3.5 mr-1" /> UPI
                          </Button>
                        </>
                      )}
                      {refundable > 0 && (
                        <>
                          <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-blue-700 text-blue-300 bg-transparent"
                            onClick={() => {
                              if (window.confirm(`Refund ${formatPaise(refundable)} to ${o.name}?`)) {
                                act(o.code, "refund", { reason: "Full refund by admin" }, "Full refund issued");
                              }
                            }}>
                            <RotateCcw className="size-3.5 mr-1" /> Full refund
                          </Button>
                          <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-blue-700 text-blue-300 bg-transparent"
                            onClick={() => {
                              const input = window.prompt(`Partial refund amount in ₹ (max ${formatPaise(refundable)}):`);
                              if (!input) return;
                              const paise = Math.round(Number(input) * 100);
                              if (!Number.isFinite(paise) || paise <= 0 || paise > refundable) {
                                toast.error("Enter an amount between ₹1 and the refundable amount.");
                                return;
                              }
                              const reason = window.prompt("Reason for the partial refund:") || "Partial refund by admin";
                              act(o.code, "refund", { amountPaise: paise, reason }, `Refunded ${formatPaise(paise)}`);
                            }}>
                            Partial
                          </Button>
                        </>
                      )}
                      {paidOnline && o.payment_state !== "FORFEITED" && o.payment_state !== "REFUNDED" && (
                        <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-rose-800 text-rose-300 bg-transparent"
                          onClick={() => {
                            const reason = window.prompt("Reason for forfeiting the deposit (required):");
                            if (reason?.trim()) act(o.code, "forfeit", { reason }, "Deposit forfeited");
                          }}>
                          Forfeit
                        </Button>
                      )}
                      {active && (
                        <>
                          <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-neutral-700 text-neutral-300 bg-transparent"
                            onClick={() => {
                              if (window.confirm(`Mark ${o.code} as a no-show?${paidOnline ? " The deposit will be forfeited." : ""}`)) {
                                act(o.code, "no_show", {}, "Marked as no-show");
                              }
                            }}>
                            <UserX className="size-3.5 mr-1" /> No-show
                          </Button>
                          <Button size="sm" disabled={busy} variant="outline" className="h-8 text-[11px] border-neutral-700 text-neutral-300 bg-transparent"
                            onClick={() => {
                              const reason = window.prompt("Why is the cafe cancelling? (the customer gets a full refund)");
                              if (reason?.trim()) act(o.code, "cancel", { reason }, "Order cancelled and refunded");
                            }}>
                            <Ban className="size-3.5 mr-1" /> Cancel & refund
                          </Button>
                        </>
                      )}
                      {busy && <Loader2 className="size-4 animate-spin text-neutral-400 self-center" />}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === o.code ? null : o.code)}
                    className="mt-2 text-[11px] text-neutral-500 hover:text-neutral-300"
                  >
                    {expanded === o.code ? "Hide" : "Show"} payments & audit log ({o.payments.length} / {o.audit.length})
                  </button>
                  {expanded === o.code && (
                    <div className="mt-2 grid gap-3 md:grid-cols-2 text-[11px]">
                      <ul className="space-y-1">
                        {o.payments.map((p) => (
                          <li key={p.id} className="flex justify-between gap-2 text-neutral-400 font-mono">
                            <span>
                              {p.kind} · {p.method || "—"} · {p.status}
                              {p.razorpay_payment_id && <> · {p.razorpay_payment_id}</>}
                              {p.collected_by && <> · by {p.collected_by}</>}
                            </span>
                            <span>
                              {formatPaise(p.amount_paise)}
                              {p.refunded_amount_paise > 0 && <> (−{formatPaise(p.refunded_amount_paise)})</>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <ul className="space-y-1">
                        {o.audit.map((a, i) => (
                          <li key={i} className="text-neutral-400">
                            <CheckCircle2 className="inline size-3 mr-1 text-neutral-600" />
                            {formatIst(a.created_at)} · <span className="text-neutral-200">{a.action}</span>
                            {a.amount_paise != null && <> {formatPaise(a.amount_paise)}</>} · {a.actor}
                            {a.reason && <span className="text-neutral-500"> — {a.reason}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
