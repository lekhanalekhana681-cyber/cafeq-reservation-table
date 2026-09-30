import { createFileRoute, Link } from "@tanstack/react-router";

import menuSpread from "@/assets/menu-spread.jpg";
import { categories, menu } from "@/data/menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/menu")({
  component: MenuPage,
});

function MenuPage() {
  return (
    <>
      <PageBackground imageUrl={menuSpread} />
      <section className="relative h-[45vh] min-h-[300px] flex items-end">
        <div className="absolute inset-0 flex items-end z-10">
          <div className="mx-auto w-full max-w-6xl px-5 pb-10">
            <p className="eyebrow text-primary-foreground/85">Freshly Crafted Daily</p>
            <h1 className="mt-3 text-4xl text-primary-foreground sm:text-5xl">Our Menu</h1>
            <p className="mt-2 max-w-lg text-sm text-primary-foreground/80">
              Specialty roasted coffees, freshly baked viennoiserie, gourmet artisanal mains, and seasonal plates.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-16 relative z-10 bg-background/80 backdrop-blur-md rounded-3xl mt-8 mb-12 border border-border/50">
        {categories.map((cat) => {
          const items = menu.filter((m) => m.category === cat);
          return (
            <section key={cat} className="mb-16">
              <div className="border-b border-border/70 pb-3">
                <h2 className="text-2xl sm:text-3xl text-foreground font-display">{cat}</h2>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-all hover:shadow-md hover:border-accent/40"
                  >
                    {item.image && (
                      <div className="relative h-48 w-full overflow-hidden bg-muted">
                        <img
                          src={item.image}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        {item.tag && (
                          <div className="absolute top-3 left-3">
                            <Badge variant="secondary" className="bg-background/90 backdrop-blur shadow-xs">
                              {item.tag}
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="font-semibold text-lg text-foreground">{item.name}</h3>
                          <span className="shrink-0 font-medium text-accent">
                            ₹{Math.round(item.price * 20)}
                          </span>
                        </div>
                        {!item.image && item.tag && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {item.tag}
                            </Badge>
                          </div>
                        )}
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border/40 flex justify-end">
                        <Button asChild size="sm" variant="ghost" className="text-xs text-accent hover:text-accent-foreground">
                          <Link to="/reserve">Pre-order this →</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="rounded-2xl bg-secondary/50 p-8 sm:p-12 text-center border border-border/60 shadow-warm">
          <h2 className="text-3xl font-display">Have your table & food waiting</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Book a table and pre-order your favorites in advance. Our baristas and chefs will time the pour and bake the minute you walk in.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/reserve">Reserve & Pre-order Now</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
