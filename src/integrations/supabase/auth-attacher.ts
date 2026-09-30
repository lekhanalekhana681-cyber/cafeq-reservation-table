export async function attachSupabaseAuth({ next }: { next: () => Promise<unknown> }) {
  return await next();
}
