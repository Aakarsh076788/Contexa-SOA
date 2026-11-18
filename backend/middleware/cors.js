export function allowedBrowserOrigins(req) {
  const allowed = new Set([process.env.PUBLIC_ORIGIN, ...(process.env.CORS_ORIGIN || '').split(',')].filter(Boolean).map(v => v.trim()));
  if (process.env.NODE_ENV !== 'production') {
    for (const host of ['localhost', '127.0.0.1']) for (const port of [4000, 5173, 4173]) allowed.add(`http://${host}:${port}`);
  }
  if (req) allowed.add(`${req.protocol}://${req.get('host')}`);
  return allowed;
}
export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedBrowserOrigins(req).has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, X-Connector-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}
