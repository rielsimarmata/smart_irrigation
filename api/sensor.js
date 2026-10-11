
import { neon } from '@neondatabase/serverless';

const REQUIRED_FIELDS = [
  'soilMoisture',
  'temperature',
  'airHumidity',
  'rain',
  'decision',
  'pump',
];

const MAX_HISTORY = 50;
const HISTORY_INTERVAL_MS = 60_000;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  return neon(databaseUrl);
}

function isValidPayload(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return false;
  }

  if (
    !REQUIRED_FIELDS.every((field) =>
      Object.hasOwn(payload, field)
    )
  ) {
    return false;
  }

  return (
    typeof payload.soilMoisture === 'number' &&
    Number.isFinite(payload.soilMoisture) &&
    typeof payload.temperature === 'number' &&
    Number.isFinite(payload.temperature) &&
    typeof payload.airHumidity === 'number' &&
    Number.isFinite(payload.airHumidity) &&
    typeof payload.rain === 'boolean' &&
    typeof payload.decision === 'string' &&
    payload.decision.trim().length > 0 &&
    typeof payload.pump === 'boolean' &&
    (
      payload.soilRaw === undefined ||
      (
        typeof payload.soilRaw === 'number' &&
        Number.isFinite(payload.soilRaw) &&
        Number.isInteger(payload.soilRaw)
      )
    )
  );
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }

    return req.body;
  }

  return new Promise((resolve) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => resolve(null));
  });
}

function mapRecord(row) {
  if (!row) return null;

  return {
    soilMoisture:
      row.soilMoisture == null
        ? null
        : Number(row.soilMoisture),

    soilRaw:
      row.soilRaw == null
        ? null
        : Number(row.soilRaw),

    temperature:
      row.temperature == null
        ? null
        : Number(row.temperature),

    airHumidity:
      row.airHumidity == null
        ? null
        : Number(row.airHumidity),

    rain: row.rain,
    decision: row.decision,
    pump: row.pump,

    timestamp: row.timestamp
      ? new Date(row.timestamp).toISOString()
      : null,
  };
}

export default async function handler(req, res) {
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({
      success: false,
      message: 'Method not allowed.',
    });
  }

  try {
    const sql = getSql();

    // GET: Read the latest sensor data and saved history.
    if (req.method === 'GET') {
      const [latestRows, historyRows] = await Promise.all([
        sql`
          SELECT
            soil_moisture AS "soilMoisture",
            soil_raw AS "soilRaw",
            temperature,
            air_humidity AS "airHumidity",
            rain,
            decision,
            pump,
            updated_at AS timestamp
          FROM sensor_latest
          WHERE id = 1
        `,

        sql`
          SELECT
            soil_moisture AS "soilMoisture",
            soil_raw AS "soilRaw",
            temperature,
            air_humidity AS "airHumidity",
            rain,
            decision,
            pump,
            recorded_at AS timestamp
          FROM sensor_history
          ORDER BY recorded_at DESC
          LIMIT ${MAX_HISTORY}
        `,
      ]);

      const latest = mapRecord(latestRows[0] ?? null);
      const history = historyRows.map(mapRecord);

      return res.status(200).json({
        success: true,
        data: latest,
        timestamp: latest?.timestamp ?? null,
        history,
      });
    }

    // POST: Validate the payload sent by ESP32.
    const payload = await readBody(req);

    if (!isValidPayload(payload)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid sensor data. Check required fields and types.',
      });
    }

    const record = {
      ...payload,
      decision: payload.decision.trim(),
      soilRaw: payload.soilRaw ?? null,
    };

    // Read the previous state and latest history time.
    const [previousRows, historyTimeRows] = await Promise.all([
      sql`
        SELECT decision, rain, pump
        FROM sensor_latest
        WHERE id = 1
      `,

      sql`
        SELECT
          EXTRACT(
            EPOCH FROM (NOW() - recorded_at)
          ) * 1000 AS age_ms
        FROM sensor_history
        ORDER BY recorded_at DESC
        LIMIT 1
      `,
    ]);

    const previous = previousRows[0] ?? null;

    const stateChanged =
      !previous ||
      previous.decision !== record.decision ||
      previous.rain !== record.rain ||
      previous.pump !== record.pump;

    const latestHistory = historyTimeRows[0] ?? null;

    const historyAge = latestHistory
      ? Number(latestHistory.age_ms)
      : Infinity;

    const shouldSaveHistory =
      !latestHistory ||
      stateChanged ||
      historyAge >= HISTORY_INTERVAL_MS;

    // Always update the latest sensor state.
    const latestRows = await sql`
      INSERT INTO sensor_latest (
        id,
        soil_moisture,
        soil_raw,
        temperature,
        air_humidity,
        rain,
        decision,
        pump,
        updated_at
      )
      VALUES (
        1,
        ${record.soilMoisture},
        ${record.soilRaw},
        ${record.temperature},
        ${record.airHumidity},
        ${record.rain},
        ${record.decision},
        ${record.pump},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        soil_moisture = EXCLUDED.soil_moisture,
        soil_raw = EXCLUDED.soil_raw,
        temperature = EXCLUDED.temperature,
        air_humidity = EXCLUDED.air_humidity,
        rain = EXCLUDED.rain,
        decision = EXCLUDED.decision,
        pump = EXCLUDED.pump,
        updated_at = NOW()
      RETURNING
        soil_moisture AS "soilMoisture",
        soil_raw AS "soilRaw",
        temperature,
        air_humidity AS "airHumidity",
        rain,
        decision,
        pump,
        updated_at AS timestamp
    `;

    const latest = mapRecord(latestRows[0]);

    // Save history periodically or when an important state changes.
    if (shouldSaveHistory) {
      await sql`
        INSERT INTO sensor_history (
          soil_moisture,
          soil_raw,
          temperature,
          air_humidity,
          rain,
          decision,
          pump
        )
        VALUES (
          ${record.soilMoisture},
          ${record.soilRaw},
          ${record.temperature},
          ${record.airHumidity},
          ${record.rain},
          ${record.decision},
          ${record.pump}
        )
      `;
    }

    return res.status(201).json({
      success: true,
      data: latest,
    });
  } catch (error) {
    console.error('Smart Irrigation API error:', error);

    return res.status(500).json({
      success: false,
      message:
        'Server database error. Check database configuration.',
    });
  }
}
