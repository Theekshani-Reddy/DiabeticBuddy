export function errorHandler(error, _req, res, _next) {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  // Log the error category, never request bodies, credentials, or tokens.
  console.error('Request failed:', error.code || error.name);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
