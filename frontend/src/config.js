// Read API base from env so we can point production/dev to Cloudflare API hostname.
// Falls back to relative paths if not set (CRA dev proxy will handle /api/*).
export const API_BASE = process.env.REACT_APP_API_BASE || '';
