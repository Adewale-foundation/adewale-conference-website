// Batching primitives shared by every bulk write path.

/** Split into fixed-size batches. `ON CONFLICT` cannot touch the same row twice
 *  in one statement, so callers dedupe by key first, then chunk. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `fn` over every item with at most `limit` in flight, for work that
 *  cannot be batched server-side (auth-user creation is one request per item). */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (limit < 1) throw new Error("mapLimit limit must be at least 1");
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index], index);
      }
    }),
  );
}

const FETCH_PAGE = 1000;

/** Read every row a query returns. PostgREST truncates past the project's Max
 *  rows instead of erroring, and a half-listed result looks like a small one. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += FETCH_PAGE) {
    const { data, error } = await page(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < FETCH_PAGE) return out;
  }
}
