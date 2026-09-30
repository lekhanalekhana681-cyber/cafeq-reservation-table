import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star, PenLine, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import {
  getReviews,
  submitReview,
  averageRating,
  type Review,
} from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/reviews")({
  component: ReviewsPage,
});

// ─── Star display ─────────────────────────────────────────────────────────────
function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`size-4 ${
            i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-border"
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

// ─── Interactive star picker ──────────────────────────────────────────────────
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`size-6 ${
              n <= (hover || value) ? "fill-amber-400 text-amber-400" : "text-border"
            }`}
          />
        </button>
      ))}
    </span>
  );
}

// ─── Review card ─────────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.comment.length > 150;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-warm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">{review.reviewer_name}</p>
          <Stars value={review.rating} />
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {new Date(review.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <p className={`mt-3 text-sm text-muted-foreground leading-relaxed ${!expanded && long ? "line-clamp-3" : ""}`}>
        {review.comment}
      </p>
      {long && (
        <button
          className="mt-1 flex items-center gap-0.5 text-xs text-accent hover:underline"
          onClick={() => setExpanded((x) => !x)}
        >
          {expanded ? <><ChevronUp className="size-3" /> Less</> : <><ChevronDown className="size-3" /> Read more</>}
        </button>
      )}
    </div>
  );
}

// ─── Write review form ────────────────────────────────────────────────────────
function WriteReviewForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ reviewer_name: "", rating: 0, comment: "" });
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitReview({
        reviewer_name: form.reviewer_name.trim() || "Anonymous",
        rating: form.rating,
        comment: form.comment.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      setDone(true);
      onSuccess();
      toast.success("Thanks for your review! ☕");
    },
    onError: () => toast.error("Could not submit review. Try again."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.rating === 0) { toast.error("Please select a star rating."); return; }
    if (!form.comment.trim()) { toast.error("Please write a short comment."); return; }
    mutation.mutate();
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="size-10 text-green-500" />
        <p className="font-semibold">Review submitted! Thank you 🎉</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rev-name">Your name (optional)</Label>
          <Input
            id="rev-name"
            placeholder="Anonymous"
            value={form.reviewer_name}
            onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Rating *</Label>
          <StarPicker
            value={form.rating}
            onChange={(v) => setForm((f) => ({ ...f, rating: v }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rev-comment">Your review *</Label>
        <Textarea
          id="rev-comment"
          rows={3}
          placeholder="Tell us about your experience…"
          value={form.comment}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending ? "Submitting…" : "Post Review"}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function ReviewsPage() {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: getReviews,
  });
  const [showForm, setShowForm] = useState(false);
  const avg = averageRating(reviews);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="eyebrow">What guests say</p>
      <h1 className="mt-3 text-4xl sm:text-5xl">Ratings &amp; Reviews</h1>

      {/* Overall rating banner */}
      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-warm">
        <div className="text-center">
          <p className="text-5xl font-bold">{avg.toFixed(1)}</p>
          <Stars value={avg} />
          <p className="mt-1 text-xs text-muted-foreground">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex-1 space-y-1.5 min-w-[160px]">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = reviews.filter((r) => Math.round(r.rating) === n).length;
            const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right">{n}</span>
                <Star className="size-3 fill-amber-400 text-amber-400 shrink-0" />
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-5 text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Write a review */}
      <div className="mt-10">
        {!showForm ? (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            <PenLine className="size-4 mr-2" />
            Write a Review
          </Button>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5 shadow-warm">
            <h2 className="text-lg font-semibold mb-4">Write a Review</h2>
            <WriteReviewForm onSuccess={() => setShowForm(false)} />
          </div>
        )}
      </div>

      {/* Review list */}
      <div className="mt-10 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first!</p>
        ) : (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        )}
      </div>
    </div>
  );
}
