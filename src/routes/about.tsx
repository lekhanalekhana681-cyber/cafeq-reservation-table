import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Coffee,
  HeartHandshake,
  Sparkles,
  Award,
  Volume2,
  VolumeX,
  Quote,
  Flame,
  Clock,
  Compass,
} from "lucide-react";

import heroCafe from "@/assets/hero-cafe.jpg";
import menuSpread from "@/assets/menu-spread.jpg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageBackground } from "@/components/PageBackground";
import { toast } from "sonner";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const milestones = [
  {
    year: "2016",
    title: "The Garage Cart",
    description:
      "A hand-me-down 2-group espresso machine in a quiet Indiranagar lane. We pulled 40 shots a day and burned our first Ethiopian micro-lot.",
    tag: "Origins",
  },
  {
    year: "2019",
    title: "18 Kettle Lane",
    description:
      "Found our permanent home two doors down from the flower market. Rebuilt the bar with reclaimed teak and installed the roasting drum.",
    tag: "Brick & Mortar",
  },
  {
    year: "2022",
    title: "Direct-Trade Micro-Lots",
    description:
      "Partnered directly with 4 shade-grown estates in Chikmagalur and Yirgacheffe. 100% traceable beans, roasted in 5kg batches.",
    tag: "Craft",
  },
  {
    year: "2024",
    title: "The Slow Morning App",
    description:
      "Launched table reservations + pre-orders so your cappuccino is poured and shakshuka is plated the exact minute you sit down.",
    tag: "Today",
  },
];

const teamMembers = [
  {
    name: "Arjun Rao",
    role: "Founder & Head Roaster",
    avatar: "☕",
    quirk: "Can identify coffee elevation and wash process blindfolded by aroma alone.",
    drink: "Double Ristretto Ethiopia Guji",
  },
  {
    name: "Maya Chen",
    role: "Head Pastry Chef",
    avatar: "🥐",
    quirk: "Tested 412 laminated dough batches before approving our 72-hour butter croissant.",
    drink: "Cardamom Orange Knot + Oat Flat White",
  },
  {
    name: "Karan Verma",
    role: "Lead Barista & Bar Curator",
    avatar: "🎨",
    quirk: "Knows 90+ regular guests' milk temperature and seating preferences by heart.",
    drink: "24h Single-Origin Cold Brew",
  },
  {
    name: "Leila D'Souza",
    role: "Kitchen & Sourdough Lead",
    avatar: "🍞",
    quirk: "Named our 9-year-old sourdough starter 'Brimley' and feeds it at 4:30 AM sharp.",
    drink: "Matcha Yuzu Tonic",
  },
];

const regularStories = [
  {
    quote:
      "I book the Window Bench every Tuesday at 8:30 AM. My flat white lands before I even take my laptop out. There's no place like this in Bangalore.",
    author: "Nandita K.",
    status: "Regular since 2019 · 140+ visits",
    fav: "Window 2-Top + Ember Flat White",
  },
  {
    quote:
      "The cardamom knot sells out early, but pre-ordering through the table reservation guarantees it's still warm on my plate.",
    author: "Vikram S.",
    status: "Weekend Brunch Regular",
    fav: "Garden Courtyard + Cardamom Knot",
  },
  {
    quote:
      "They take coffee seriously without the snobbery. The baristas actually explain the varietal notes if you ask.",
    author: "Dr. Ananya P.",
    status: "Coffee Enthusiast",
    fav: "V60 Single Origin Pour-Over",
  },
];

function AboutPage() {
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  return (
    <>
      <PageBackground imageUrl="https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=2000&auto=format&fit=crop" />
      <div className="mx-auto max-w-6xl px-8 py-16 space-y-24 relative z-10 bg-background/80 backdrop-blur-md my-12 rounded-3xl border border-border/50">
        {/* 1. HERO & CONVERSATIONAL STORY */}
      <section className="grid gap-12 lg:grid-cols-2 items-center">
        <div>
          <p className="eyebrow">Our Philosophy</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-display text-foreground leading-tight">
            We don't do rush hours. We build slow mornings.
          </h1>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed text-base">
            <p>
              Cafeq started with a stubborn observation: why should good coffee come with long queues, cold pastries, and hurried sips out of paper cups on the pavement?
            </p>
            <p>
              In 2016, we set out to build a sanctuary on Kettle Lane. A café where your favorite table is held for you, the butter croissant was laminated 72 hours ago and baked at dawn, and your double-shot flat white is pulled the minute you walk through the doorway.
            </p>
            <p>
              We roast small. We bake daily. We never rush the extraction.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button asChild size="lg">
              <Link to="/reserve">Book a Table Experience</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/menu">Explore Our Menu</Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <img
            src={heroCafe}
            alt="Warm atmosphere inside Cafeq with barista at the espresso bar"
            width={1200}
            height={912}
            className="rounded-2xl object-cover shadow-warm border border-border/70 w-full h-[420px]"
          />
          <div className="absolute -bottom-6 -left-6 rounded-2xl bg-card border border-border p-5 shadow-warm max-w-xs hidden sm:block">
            <p className="font-display text-2xl font-bold text-accent">72 Hours</p>
            <p className="text-xs text-muted-foreground mt-1">
              Fermentation time for our house sourdough crust & viennoiserie laminations.
            </p>
          </div>
        </div>
      </section>

      {/* 2. VISUAL TIMELINE / MILESTONE STRIP */}
      <section className="border-y border-border/70 py-16 bg-secondary/25 -mx-5 px-5 sm:mx-0 sm:px-8 sm:rounded-3xl">
        <div className="max-w-4xl">
          <p className="eyebrow">The Journey</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-display">From Garage Cart to Kettle Lane</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A decade of perfecting extractions, finding ethical farm partners, and reimagining café reservations.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {milestones.map((m, idx) => (
            <div
              key={m.year}
              className="relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs hover:border-accent/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-2xl text-accent">{m.year}</span>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {m.tag}
                  </Badge>
                </div>
                <h3 className="mt-3 font-semibold text-base text-foreground">{m.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              </div>
              <div className="mt-6 pt-3 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="size-3 text-accent" /> Milestone #{idx + 1}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. MEET THE TEAM MINI-GRID (QUIRKY FACTS) */}
      <section>
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow">The Humans Behind the Bar</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-display">Meet the Crew</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No corporate bios here — just the craftspeople dialing in your beans and baking your cardamom knots.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {teamMembers.map((member) => (
            <div
              key={member.name}
              className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-xs hover:shadow-md hover:border-accent/40 transition-all text-center"
            >
              <div>
                <div className="size-20 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-3xl mx-auto shadow-inner group-hover:scale-105 transition-transform">
                  {member.avatar}
                </div>
                <h3 className="mt-4 font-semibold text-lg text-foreground">{member.name}</h3>
                <p className="text-xs text-accent font-medium">{member.role}</p>

                <div className="mt-4 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground italic border border-border/40">
                  "{member.quirk}"
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Go-to cup:</span> {member.drink}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. BEHIND THE COUNTER: REGULARS' STORIES & CHALKBOARD */}
      <section className="grid gap-10 lg:grid-cols-2 items-center rounded-3xl border border-border bg-card p-8 sm:p-12 shadow-warm">
        <div>
          <p className="eyebrow">Behind the Counter</p>
          <h2 className="mt-2 text-3xl font-display">What Our Regulars Say</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Over 2,400 slow mornings hosted this year. Here is why folks keep their weekly table booked with us.
          </p>

          <div className="mt-8 relative rounded-2xl bg-secondary/40 border border-border/70 p-6">
            <Quote className="size-8 text-accent/30 absolute top-4 right-4" />
            <p className="text-base text-foreground font-medium leading-relaxed italic">
              "{regularStories[activeStoryIdx]?.quote}"
            </p>
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-foreground">{regularStories[activeStoryIdx]?.author}</p>
                <p className="text-xs text-muted-foreground">{regularStories[activeStoryIdx]?.status}</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-accent/40 text-accent">
                {regularStories[activeStoryIdx]?.fav}
              </Badge>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {regularStories.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveStoryIdx(idx)}
                className={`size-2.5 rounded-full transition-all cursor-pointer ${
                  activeStoryIdx === idx ? "bg-accent w-6" : "bg-border hover:bg-muted-foreground"
                }`}
                aria-label={`Show quote ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Café Ambient Box */}
        <div className="rounded-2xl border border-border bg-secondary/50 p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="eyebrow">Café Soundscape</span>
              <Badge variant="secondary" className="text-[10px]">Indiranagar Live</Badge>
            </div>
            <h3 className="mt-2 text-xl font-display">The Sounds of Kettle Lane</h3>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Vinyl turntables spinning jazz, the soft hum of the Mazzer grinder, and milk pitchers steaming at 65°C.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                <Coffee className="size-5 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Acoustic Café Ambience</p>
                <p className="text-[11px] text-muted-foreground">Slow Jazz · Espresso Steam</p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsPlayingSound(!isPlayingSound);
                toast.info(isPlayingSound ? "Ambient sound muted" : "Playing ambient café mood");
              }}
              className="text-xs"
            >
              {isPlayingSound ? (
                <>
                  <VolumeX className="size-3.5 mr-1.5" /> Mute
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5 mr-1.5" /> Ambient
                </>
              )}
            </Button>
          </div>

          <div className="border-t border-border/60 pt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>📍 18 Kettle Lane, Indiranagar</span>
            <span>Open 7am – 7pm Daily</span>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
