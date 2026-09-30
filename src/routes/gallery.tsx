import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { X, ImageIcon } from "lucide-react";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
});

// ─── Image config ─────────────────────────────────────────────────────────────
// To swap in real uploaded images, replace the `src` URLs in this array.
// Each entry supports: src, alt, width, height (all optional except src & alt).
type GalleryImage = { src: string; alt: string };

const GALLERY_IMAGES: GalleryImage[] = [
  // — cafe interior (10 images)
  { src: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&q=80", alt: "Warm café interior with wooden tables" },
  { src: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&q=80", alt: "Cozy corner seating in café" },
  { src: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600&q=80", alt: "Brick wall café interior" },
  { src: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=600&q=80", alt: "Bright café with pendant lights" },
  { src: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80", alt: "Minimalist café counter" },
  { src: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=600&q=80", alt: "Rustic café shelves" },
  { src: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&q=80", alt: "Café window seat morning light" },
  { src: "https://images.unsplash.com/photo-1493857671505-72967e2e2760?w=600&q=80", alt: "Café ambient lighting evening" },
  { src: "https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=600&q=80", alt: "Café outdoor seating" },
  { src: "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?w=600&q=80", alt: "Café bar top with stools" },
  // — coffee latte art (6 images)
  { src: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80", alt: "Latte art rosetta" },
  { src: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80", alt: "Heart latte art" },
  { src: "https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&q=80", alt: "Flat white with tulip pattern" },
  { src: "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=600&q=80", alt: "Cappuccino with foam art" },
  { src: "https://images.unsplash.com/photo-1567446537708-ac4aa75c9c28?w=600&q=80", alt: "Cold brew in glass" },
  { src: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80", alt: "Espresso shot" },
  // — bakery pastries (7 images)
  { src: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&q=80", alt: "Fresh croissants" },
  { src: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80", alt: "Assorted pastries display" },
  { src: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=600&q=80", alt: "Chocolate brownie slice" },
  { src: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=600&q=80", alt: "Cinnamon roll close-up" },
  { src: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=80", alt: "Macaron selection" },
  { src: "https://images.unsplash.com/photo-1599785209796-786548686078?w=600&q=80", alt: "Avocado toast overhead" },
  { src: "https://images.unsplash.com/photo-1506459225024-1428097a7e18?w=600&q=80", alt: "Banana walnut muffin" },
  // — cozy coffee shop vibes (4 images)
  { src: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=600&q=80", alt: "Person reading at café table" },
  { src: "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600&q=80", alt: "Friends at coffee shop" },
  { src: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&q=80", alt: "Laptop work at café" },
  { src: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80", alt: "Outdoor café seating sunshine" },
  // — café outdoor seating (3 images)
  { src: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80", alt: "Alfresco café terrace" },
  { src: "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&q=80", alt: "Garden café seating" },
  { src: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=600&q=80", alt: "Café patio evening" },
];

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ image, onClose }: { image: GalleryImage; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      <img
        src={image.src.replace("w=600", "w=1200")}
        alt={image.alt}
        className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function GalleryPage() {
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

  return (
    <>
      {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}

      <PageBackground imageUrl="https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=2000&auto=format&fit=crop" />
      <div className="mx-auto max-w-6xl px-8 py-16 relative z-10 bg-background/80 backdrop-blur-md my-12 rounded-3xl border border-border/50">
        <p className="eyebrow">Visual diary</p>
        <h1 className="mt-3 text-4xl sm:text-5xl">Gallery</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Mornings, moments, and micro-lots — a glimpse into the CAFEQ world.
        </p>

        {/* Masonry-style grid */}
        <div className="mt-12 columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
          {GALLERY_IMAGES.map((img, i) => (
            <button
              key={i}
              className="group w-full overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => setLightbox(img)}
              aria-label={`View: ${img.alt}`}
            >
              <div className="relative">
                <img
                  src={img.src}
                  alt={img.alt}
                  loading="lazy"
                  className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = "flex";
                  }}
                />
                {/* Fallback placeholder */}
                <div
                  className="hidden h-32 items-center justify-center bg-muted text-muted-foreground text-xs"
                  style={{ display: "none" }}
                >
                  <ImageIcon className="size-5 mb-1" />
                </div>
                {/* Hover overlay */}
                <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/15 rounded-lg" />
              </div>
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Photos via Unsplash — replace with real images by editing{" "}
          <code className="font-mono">src/routes/gallery.tsx → GALLERY_IMAGES</code>
        </p>
      </div>
    </>
  );
}
