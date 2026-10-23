/** Explicit, stable paging avoids the Data API's implicit row limit. */
export async function readAllPages<T, E>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
  signal?: AbortSignal,
): Promise<{ data: T[] | null; error: E | null }> {
  const data: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    signal?.throwIfAborted();
    const result = await page(from, from + size - 1);
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data ?? []));
    if (!result.data || result.data.length < size) return { data, error: null };
  }
}
