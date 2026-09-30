export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-base text-foreground">Cafeq</p>
          <p>18 Kettle Lane, Indiranagar — open 7am to 7pm, daily</p>
        </div>
        <p>Reservations held for 15 minutes. Pre-orders arrive with your table.</p>
      </div>
    </footer>
  );
}
