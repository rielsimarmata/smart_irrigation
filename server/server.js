import cors from 'cors';
import express from 'express';

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const REQUIRED_FIELDS = ['soilMoisture', 'temperature', 'airHumidity', 'rain', 'decision', 'pump'];

let latestSensor = null;
let history = [];

app.use(cors());
app.use(express.json({ limit: '20kb' }));

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (!REQUIRED_FIELDS.every((field) => Object.hasOwn(payload, field))) return false;

  return typeof payload.soilMoisture === 'number' && Number.isFinite(payload.soilMoisture)
    && typeof payload.temperature === 'number' && Number.isFinite(payload.temperature)
    && typeof payload.airHumidity === 'number' && Number.isFinite(payload.airHumidity)
    && typeof payload.rain === 'boolean'
    && typeof payload.decision === 'string' && payload.decision.trim().length > 0
    && typeof payload.pump === 'boolean';
}

function logSensor(record) {
  console.log('\n================================');
  console.log('[ESP32 DATA RECEIVED]');
  console.log('================================');
  console.log(`Soil Moisture : ${record.soilMoisture}`);
  console.log(`Temperature   : ${record.temperature} °C`);
  console.log(`Air Humidity  : ${record.airHumidity} %`);
  console.log(`Rain          : ${record.rain ? 'HUJAN' : 'TIDAK HUJAN'}`);
  console.log(`Decision      : ${record.decision}`);
  console.log(`Pump          : ${record.pump ? 'ON' : 'OFF'}`);
  console.log('================================');
}

app.post('/api/sensor', (req, res) => {
  if (!isValidPayload(req.body)) {
    return res.status(400).json({ success: false, message: 'Data sensor tidak valid. Periksa field dan tipe data.' });
  }

  const data = { ...req.body, decision: req.body.decision.trim(), timestamp: new Date().toISOString() };
  latestSensor = data;
  history = [data, ...history].slice(0, 50);
  logSensor(data);
  return res.status(201).json({ success: true, data });
});

app.get('/api/sensor', (_req, res) => res.json({ success: true, data: latestSensor, history }));
app.get('/api/history', (_req, res) => res.json({ success: true, data: history }));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ success: false, message: 'JSON tidak valid.' });
  }
  return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, HOST, () => console.log(`Smart Irrigation API berjalan di http://${HOST}:${PORT}`));
