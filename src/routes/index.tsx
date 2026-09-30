import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Clock, Croissant, Leaf, UtensilsCrossed } from "lucide-react";

import heroCafe from "@/assets/hero-cafe.jpg";
import menuSpread from "@/assets/menu-spread.jpg";
import tableReserved from "@/assets/table-reserved.jpg";
import brownieImg from "@/assets/brownie.jpg";
import pizzaImg from "@/assets/pizza.jpg";
import burgerImg from "@/assets/burger.jpg";
import friesImg from "@/assets/fries.jpg";
import sandwichImg from "@/assets/sandwich.jpg";
import fruitBowlImg from "@/assets/fruit-bowl.jpg";
import { menu } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/")({
  component: Index,
});

const highlights = [
  {
    icon: CalendarCheck,
    title: "Table, chosen",
    body: "Pick the window bench, the courtyard, or the long communal table.",
  },
  {
    icon: Croissant,
    title: "Food, waiting",
    body: "Pre-order bakery, artisanal pizzas, and fresh coffee timed to your arrival.",
  },
  {
    icon: Clock,
    title: "No queue",
    body: "Fifteen-minute hold, one tap to change or cancel your booking.",
  },
  {
    icon: Leaf,
    title: "Small batch",
    body: "Rotating micro-lot coffee and kitchen creations crafted fresh daily.",
  },
];

const featuredFavorites = [
  {
    name: "Warm Fudgy Brownie",
    price: "₹110",
    description: "Decadent dark chocolate brownie with molten core & vanilla bean gelato.",
    image: brownieImg,
    tag: "Chef's Special",
  },
  {
    name: "Artisanal Margherita Pizza",
    price: "₹290",
    description: "48h fermented sourdough crust, San Marzano sauce, fresh mozzarella & basil.",
    image: pizzaImg,
    tag: "Wood-fired",
  },
  {
    name: "Gourmet Brioche Burger",
    price: "₹270",
    description: "Juicy gourmet patty with melted cheddar, caramelized onions & truffle sauce.",
    image: burgerImg,
    tag: "Must Try",
  },
  {
    name: "Crispy Herb & Truffle Fries",
    price: "₹130",
    description: "Golden hand-cut fries tossed in fresh rosemary with truffle aioli.",
    image: friesImg,
    tag: "Crispy",
  },
  {
    name: "Toasted Sourdough Club",
    price: "₹240",
    description: "Triple-decker sourdough with herb grilled fillings, avocado & heirloom tomato.",
    image: sandwichImg,
    tag: "House Classic",
  },
  {
    name: "Vibrant Seasonal Fruit Bowl",
    price: "₹170",
    description: "Fresh dragonfruit, berries, kiwi, Greek yogurt & passionfruit drizzle.",
    image: fruitBowlImg,
    tag: "Healthy",
  },
];

function Index() {
  const signatures = menu.filter((m) => m.tag).slice(0, 4);

  return (
    <>
      <PageBackground imageUrl={heroCafe} />
      {/* Hero Section */}
      <section className="relative flex items-end min-h-[540px] h-[80vh]">
        <div className="absolute inset-0 flex items-end z-10">
          <div className="mx-auto w-full max-w-6xl px-5 pb-16">
            <p className="eyebrow text-primary-foreground/90 font-medium tracking-wider">Indiranagar · Bengaluru</p>
            <h1 className="mt-4 max-w-2xl text-4xl leading-[1.08] text-primary-foreground sm:text-6xl font-display">
              Your table is warm, your coffee is already pulling.
            </h1>
            <p className="mt-5 max-w-xl text-primary-foreground/90 text-base sm:text-lg leading-relaxed">
              Reserve a seat at Cafeq and pre-order from today's list. We time your artisan coffee, sourdough pizzas, burgers and fresh bakery the minute you walk in.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild size="lg" className="shadow-lg">
                <Link to="/reserve">Reserve & pre-order</Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="bg-background/90 backdrop-blur hover:bg-background">
                <Link to="/menu">See today's menu</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-6xl px-5 py-20 relative z-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((h) => (
            <div key={h.title} className="rounded-xl border border-border/60 bg-card p-6 shadow-xs hover:shadow-sm transition-shadow">
              <div className="size-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                <h.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{h.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Specialties Grid with Photos */}
      <section className="border-t border-border/70 bg-background/80 backdrop-blur-md py-20 relative z-10">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="eyebrow">House Specialties</p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-display">Crafted in our kitchen & bakery</h2>
            </div>
            <Button asChild variant="outline">
              <Link to="/menu">View Full Menu (18+ items) →</Link>
            </Button>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredFavorites.map((item) => (
              <div
                key={item.name}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all hover:shadow-md hover:border-accent/40"
              >
                <div className="relative h-56 w-full overflow-hidden bg-muted">
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3">
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur font-medium">
                      {item.tag}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-lg text-foreground">{item.name}</h3>
                      <span className="shrink-0 font-medium text-accent">{item.price}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/50 flex justify-between items-center">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <UtensilsCrossed className="size-3.5 text-accent" /> Available for pre-order
                    </span>
                    <Button asChild size="sm" variant="ghost" className="text-xs text-accent">
                      <Link to="/reserve">Order →</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fresh Spread Section */}
      <section className="border-y border-border/70 bg-background/80 backdrop-blur-md py-20 relative z-10">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <img
            src={menuSpread}
            alt="Artisanal coffee latte with flower art, fresh baked butter croissant, and avocado toast on ceramic plates"
            width={1200}
            height={912}
            loading="lazy"
            className="w-full rounded-2xl object-cover shadow-warm border border-border/60"
          />
          <div>
            <p className="eyebrow">Slow Morning Rituals</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-display">Fresh bakery & handcrafted coffee</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Every morning begins at 6:00 AM with freshly laminated French croissants, sourdough loaves, and micro-lot single-origin beans dialed in on our espresso bar.
            </p>
            <ul className="mt-6 divide-y divide-border/70">
              {signatures.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-6 py-3.5">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm text-accent font-semibold">
                    ₹{Math.round(item.price * 20)}
                  </span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8">
              <Link to="/reserve">Reserve & Pre-order</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Table Reservation Section */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2 relative z-10 bg-background/80 backdrop-blur-md my-12 rounded-3xl border border-border/50">
        <div className="order-2 lg:order-1">
          <p className="eyebrow">Table Reservations</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-display">A quiet corner waiting just for you</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Whether it's a window bench for reading, an outdoor garden courtyard table, or a cozy booth for breakfast meetings.
          </p>
          <ol className="mt-8 space-y-6">
            {[
              ["Pick your time & seat", "Slots run every 30 minutes from 7:30am to 5:30pm."],
              ["Add your pre-order", "Optional — pre-ordered pizzas, coffees and brownies arrive hot."],
              ["Get instant confirmation & QR", "Show your booking code or UPI prepay on arrival."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-semibold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button asChild size="lg" className="mt-8">
            <Link to="/reserve">Book a Table</Link>
          </Button>
        </div>
        <img
          src={tableReserved}
          alt="Reserved table card with dried flowers by the window at Cafeq"
          width={1200}
          height={912}
          loading="lazy"
          className="order-1 w-full rounded-2xl object-cover shadow-warm border border-border/60 lg:order-2"
        />
      </section>
    </>
  );
}
