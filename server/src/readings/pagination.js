function isPositiveInteger(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

export function parsePagination(query) {
  if (query.page === undefined && query.limit === undefined) return null;

  const page = query.page === undefined ? '1' : query.page;
  const limit = query.limit === undefined ? '20' : query.limit;
  if (!isPositiveInteger(page)) {
    return { field: 'page', error: 'Page must be a positive whole number.' };
  }
  if (!isPositiveInteger(limit) || Number(limit) > 100) {
    return { field: 'limit', error: 'Limit must be a whole number between 1 and 100.' };
  }

  const offset = (Number(page) - 1) * Number(limit);
  if (!Number.isSafeInteger(offset)) {
    return { field: 'page', error: 'Page is too large. Please choose a smaller page.' };
  }
  return { page: Number(page), limit: Number(limit), offset };
}
