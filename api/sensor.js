const REQUIRED_FIELDS = ['soilMoisture', 'temperature', 'airHumidity', 'rain', 'decision', 'pump'];
const MAX_HISTORY = 50;

// Vercel may reuse a function instance between requests. This is prototype-only,
// instance-local memory and is not durable or shared across function instances.
let history = [];

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (!REQUIRED_FIELDS.every((field) => Object.hasOwn(payload, field))) return false;

  return typeof payload.soilMoisture === 'number' && Number.isFinite(payload.soilMoisture)
    && typeof payload.temperature === 'number' && Number.isFinite(payload.temperature)
    && typeof payload.airHumidity === 'number' && Number.isFinite(payload.airHumidity)
    && typeof payload.rain === 'boolean'
    && typeof payload.decision === 'string' && payload.decision.trim().length > 0
    && typeof payload.pump === 'boolean'
    && (payload.soilRaw === undefined || (typeof payload.soilRaw === 'number' && Number.isFinite(payload.soilRaw)));
}

function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return null; }
    }
    return req.body;
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    const latest = history[0] || null;
    return res.status(200).json({ success: true, data: latest, timestamp: latest?.timestamp || null, history });
  }

  if (req.method === 'POST') {
    const payload = await readBody(req);
    if (!isValidPayload(payload)) {
      return res.status(400).json({ success: false, message: 'Invalid sensor data. Check required fields and types.' });
    }
    const record = { ...payload, decision: payload.decision.trim(), timestamp: new Date().toISOString() };
    history = [record, ...history].slice(0, MAX_HISTORY);
    return res.status(201).json({ success: true, data: record });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, message: 'Method not allowed.' });
}
