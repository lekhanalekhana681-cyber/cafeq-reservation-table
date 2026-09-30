import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Review = {
  id: string;
  reviewer_name: string;
  rating: number;       // 1–5
  comment: string;
  created_at: string;
  is_seed?: boolean;    // true = placeholder sample data
};

export type NewReview = Omit<Review, "id" | "created_at" | "is_seed">;

// ─── Seed reviews (editable sample data) ─────────────────────────────────────
const SEED_REVIEWS: Review[] = [
  {
    id: "seed-1",
    reviewer_name: "Anonymous",
    rating: 5,
    comment: "Loved the ambience and the coffee here, perfect spot to work from.",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    is_seed: true,
  },
  {
    id: "seed-2",
    reviewer_name: "Anonymous",
    rating: 4,
    comment: "Great breakfast menu, service was a little slow during peak hours.",
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    is_seed: true,
  },
  {
    id: "seed-3",
    reviewer_name: "Anonymous",
    rating: 5,
    comment: "Best latte art in Malleshwaram, highly recommend the outdoor seating.",
    created_at: new Date(Date.now() - 21 * 86400000).toISOString(),
    is_seed: true,
  },
  {
    id: "seed-4",
    reviewer_name: "Anonymous",
    rating: 4,
    comment: "Good place for a weekend brunch with friends.",
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    is_seed: true,
  },
];

// ─── Supabase client helper ───────────────────────────────────────────────────
function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key =
    import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

// ─── Fetch reviews ────────────────────────────────────────────────────────────
export async function getReviews(): Promise<Review[]> {
  // Load user-submitted reviews from localStorage first
  const local: Review[] = JSON.parse(
    localStorage.getItem("cafeq_reviews") ?? "[]"
  );

  const supabase = getPublicClient();
  if (supabase) {
    try {
      const { data, error } = await (supabase as any)
        .from("reviews")
        .select("id, reviewer_name, rating, comment, created_at")
        .order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        return [...data, ...SEED_REVIEWS];
      }
    } catch (e) {
      console.warn("Reviews Supabase fetch failed, using localStorage", e);
    }
  }

  return [...local, ...SEED_REVIEWS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ─── Submit a review ──────────────────────────────────────────────────────────
export async function submitReview(review: NewReview): Promise<Review> {
  const full: Review = {
    ...review,
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    is_seed: false,
  };

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await (supabase as any).from("reviews").insert([full]);
    } catch (e) {
      console.warn("Supabase insert failed, saving to localStorage", e);
    }
  }

  // Always persist locally
  const existing: Review[] = JSON.parse(localStorage.getItem("cafeq_reviews") ?? "[]");
  existing.unshift(full);
  localStorage.setItem("cafeq_reviews", JSON.stringify(existing));

  return full;
}

// ─── Average rating helper ────────────────────────────────────────────────────
export function averageRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}
