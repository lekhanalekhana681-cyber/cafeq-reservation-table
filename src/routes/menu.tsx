import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ShieldAlert, Wine, AlertCircle, Sparkles, X, Check } from "lucide-react";

import menuSpread from "@/assets/menu-spread.jpg";
import { categories as defaultCategories, type MenuItem } from "@/data/menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBackground } from "@/components/PageBackground";
import { getOutOfStockItemIds } from "@/lib/stock";
import { subscribeToKitchenEvents } from "@/lib/kitchen.sync";
import { getStoredMenu, isCocktailsCategoryHidden, subscribeToMenuUpdates } from "@/lib/menu";

export const Route = createFileRoute("/menu")({
  component: MenuPage,
});

function MenuPage() {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [outOfStockIds, setOutOfStockIds] = useState<string[]>([]);
  const [hideCocktails, setHideCocktails] = useState<boolean>(false);
  const [ageConfirmItem, setAgeConfirmItem] = useState<MenuItem | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("All");

  const refreshMenu = () => {
    setMenuItems(getStoredMenu());
    setOutOfStockIds(getOutOfStockItemIds());
    setHideCocktails(isCocktailsCategoryHidden());
  };

  useEffect(() => {
    refreshMenu();

    const unsubMenu = subscribeToMenuUpdates(refreshMenu);
    const unsubKitchen = subscribeToKitchenEvents((event) => {
      if (event.type === "STOCK_CHANGED") {
        setOutOfStockIds(getOutOfStockItemIds());
      }
    });

    return () => {
      unsubMenu();
      unsubKitchen();
    };
  }, []);

  // Compute active categories, excluding Cocktails if license restricted
  const activeCategories = useMemo(() => {
    const list = Array.from(new Set(menuItems.map((m) => m.category)));
    // Order categories nicely
    const order = [
      "Hot Beverages",
      "Cold Beverages",
      "Mocktails",
      "Cocktails (18+)",
      "Momos (6 pcs)",
      "Starters & Snacks",
      "Burgers & Sandwiches",
      "Pizza & Pasta",
      "Desserts",
      "Coffee & Drinks",
      "Bakery & Desserts",
      "Artisanal Mains",
      "Bites & Sides",
      "Fresh & Bowls",
    ];

    return list
      .filter((cat) => {
        if (hideCocktails && (cat.toLowerCase().includes("cocktail") || cat.includes("18+"))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [menuItems, hideCocktails]);

  const handlePreorderClick = (item: MenuItem) => {
    if (item.isAlcoholic) {
      setAgeConfirmItem(item);
    } else {
      navigate({ to: "/reserve" });
    }
  };

  const handleAgeConfirmProceed = () => {
    setAgeConfirmItem(null);
    navigate({ to: "/reserve" });
  };

  return (
    <>
      <PageBackground imageUrl={menuSpread} />

      {/* Hero Banner */}
      <section className="relative h-[45vh] min-h-[320px] flex items-end">
        <div className="absolute inset-0 flex items-end z-10 bg-gradient-to-t from-background via-background/40 to-transparent">
          <div className="mx-auto w-full max-w-6xl px-5 pb-8">
            <p className="eyebrow text-accent font-semibold tracking-wider uppercase">Crafted With Passion</p>
            <h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl text-foreground font-display font-bold">
              Artisanal CafeQ Menu
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">
              Specialty roasts, handcrafted beverages, Himalayan momos, stone-baked pizzas, and gourmet sweet treats.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-8 relative z-10 bg-background/85 backdrop-blur-md rounded-3xl mt-4 mb-16 border border-border/60 shadow-xl">
        {/* Category Quick Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 border-b border-border/60 scrollbar-none">
          <button
            onClick={() => setActiveCategoryFilter("All")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategoryFilter === "All"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            All Items ({menuItems.filter((m) => !(hideCocktails && m.isAlcoholic)).length})
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategoryFilter(cat)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategoryFilter === cat
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Categories Section */}
        {activeCategories
          .filter((cat) => activeCategoryFilter === "All" || activeCategoryFilter === cat)
          .map((cat) => {
            const items = menuItems.filter((m) => {
              if (m.category !== cat) return false;
              if (hideCocktails && m.isAlcoholic) return false;
              return !outOfStockIds.includes(m.id);
            });

            if (items.length === 0) return null;

            const isAlcoholCategory = cat.toLowerCase().includes("cocktail") || cat.includes("18+");

            return (
              <section key={cat} className="mb-14">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3 mb-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl sm:text-3xl text-foreground font-display font-bold">{cat}</h2>
                    {isAlcoholCategory && (
                      <Badge variant="destructive" className="text-[11px] font-semibold flex items-center gap-1">
                        <Wine className="size-3" /> 18+ Valid ID Required
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{items.length} items</span>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all hover:shadow-lg hover:border-accent/50"
                    >
                      {/* Photo Thumbnail */}
                      <div className="relative h-52 w-full overflow-hidden bg-muted">
                        <img
                          src={item.image || "/uploads/menu/placeholder.webp"}
                          alt={item.name}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = "/uploads/menu/placeholder.webp";
                          }}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />

                        {/* Badges on Top of Photo */}
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {/* Veg / Non-Veg Indicator */}
                          <div
                            className={`size-5 rounded bg-background/90 backdrop-blur border flex items-center justify-center shadow-xs ${
                              item.isVeg ? "border-emerald-600" : "border-rose-600"
                            }`}
                            title={item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
                          >
                            <span
                              className={`size-2.5 rounded-full ${
                                item.isVeg ? "bg-emerald-600" : "bg-rose-600"
                              }`}
                            />
                          </div>

                          {item.tag && (
                            <Badge variant="secondary" className="bg-background/90 backdrop-blur shadow-xs text-[11px] font-semibold">
                              {item.tag}
                            </Badge>
                          )}

                          {item.isAlcoholic && (
                            <Badge className="bg-rose-600 text-white shadow-xs text-[10px] font-bold flex items-center gap-1">
                              <ShieldAlert className="size-3" /> 18+
                            </Badge>
                          )}
                        </div>

                        {/* Prep time chip */}
                        {item.prepTimeMinutes && (
                          <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur text-white text-[10px] font-mono">
                            ⏱ ~{item.prepTimeMinutes}m
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col justify-between p-5">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-base sm:text-lg text-foreground group-hover:text-accent transition-colors">
                              {item.name}
                            </h3>
                            <span className="shrink-0 font-bold text-accent text-lg">
                              ₹{item.price}
                            </span>
                          </div>

                          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                            {item.description}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">
                            {item.isAlcoholic ? "Age 18+ Required" : "Freshly Prepared"}
                          </span>
                          <Button
                            onClick={() => handlePreorderClick(item)}
                            size="sm"
                            variant="ghost"
                            className="text-xs font-semibold text-accent hover:text-accent-foreground hover:bg-accent/15"
                          >
                            Pre-order this →
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

        {/* Call to Action Banner */}
        <div className="rounded-2xl bg-secondary/60 p-8 sm:p-12 text-center border border-border/80 shadow-warm mt-8">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Sparkles className="size-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold">Have your table & food waiting</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Reserve your favorite table and pre-order your coffee and plates. Our kitchen and baristas will have them piping hot the minute you walk in.
          </p>
          <Button asChild size="lg" className="mt-6 font-semibold">
            <Link to="/reserve">Reserve & Pre-order Now</Link>
          </Button>
        </div>
      </div>

      {/* ─── 18+ Cocktail Age Confirmation Modal ─── */}
      {ageConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl relative text-card-foreground">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="size-11 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                <ShieldAlert className="size-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg font-display">Age Verification Required</h3>
                <p className="text-xs text-muted-foreground">
                  Ordering: <strong className="text-foreground">{ageConfirmItem.name} (₹{ageConfirmItem.price})</strong>
                </p>
              </div>
            </div>

            <div className="my-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>
                This item is an <strong>alcoholic beverage</strong> and is strictly restricted to guests aged <strong>18 years or older</strong> in accordance with regional regulations.
              </p>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>
                  You must present a valid government-issued photo ID to your server before this order can be served.
                </span>
              </div>
              <p className="font-medium text-foreground">
                Do you confirm that you are at least 18 years old?
              </p>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAgeConfirmItem(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                No, Go Back
              </Button>
              <Button
                size="sm"
                onClick={handleAgeConfirmProceed}
                className="text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                <Check className="size-3.5 mr-1" /> Yes, I Am 18+
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
