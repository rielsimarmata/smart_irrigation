# Smart Irrigation

React + Vite dashboard for the single-ESP32 Smart Irrigation prototype. The dashboard displays sensor readings, the decision supplied by the device/system, pump state, and received history. It does not calculate KNN or control the pump, and it does not invent sensor data or online status.

## Architecture

In production, deploy this repository root as one Vercel project:

```text
ESP32 --HTTPS POST--> https://<VERCEL_DOMAIN>/api/sensor
                              |
Vercel: React/Vite SPA <--- Vercel serverless API
```

The API is implemented by `api/sensor.js`; it handles both `GET /api/sensor` and `POST /api/sensor`. The frontend polls `GET /api/sensor` every three seconds. Vercel serves the Vite build from `dist/`, with the SPA rewrite in `vercel.json`.

## Local development

Install dependencies and start the existing frontend and Express API together:

```bash
npm install
npm run dev
```

- Dashboard: `http://localhost:5173`
- Local Express API: `http://localhost:3000`
- Vite proxies browser `/api/*` calls to the Express API on port 3000.
- For an ESP32 on the same Wi-Fi, POST to `http://<LAPTOP_LAN_IP>:3000/api/sensor`.

The Express server remains for local development. It is not used by Vercel production. Run `npm run build` to create the production SPA in `dist/`.

## API contract

`POST /api/sensor` accepts JSON with required numeric `soilMoisture`, `temperature`, `airHumidity`, boolean `rain`, non-empty string `decision`, and boolean `pump`. Optional `soilRaw` must be numeric.

```json
{
  "soilMoisture": 50,
  "temperature": 30,
  "airHumidity": 70,
  "rain": false,
  "decision": "TIDAK SIRAM",
  "pump": false,
  "soilRaw": 2500
}
```

Valid POST requests receive HTTP `201`; invalid requests receive HTTP `400`. The server adds an ISO timestamp. `GET /api/sensor` returns `{ success, data, timestamp, history }`; `data` and `timestamp` are `null` before the first record. History contains up to the latest 50 records. The local Express server also retains `GET /api/history` for compatibility.

## Deploy to Vercel

1. Push this repository to a Git provider supported by Vercel.
2. In Vercel, choose **Add New Project** and import that repository.
3. Set the project root to the repository root (the folder containing `package.json`).
4. Keep the framework as Vite (or let Vercel detect it). Use `npm run build` as the build command and `dist` as the output directory. No production Express start command or environment variable is needed.
5. Deploy. Vercel provides the deployment domain; verify `https://<VERCEL_DOMAIN>/` and `https://<VERCEL_DOMAIN>/api/sensor`.
6. Set the ESP32 POST URL to `https://<VERCEL_DOMAIN>/api/sensor` and enable HTTPS in its client. Replace the placeholder with the actual Vercel domain after deployment; no fake domain is configured here.

## Storage limitation and next steps

The Vercel function keeps at most 50 records in process memory for this prototype. Serverless instances can restart or scale independently, so data may disappear and separate requests may observe different histories. This is suitable only for the current single-device college prototype and is **not durable persistent storage**. Add a database when reliable history across restarts or function instances is needed.

Next steps: deploy the project, copy its real domain into the ESP32 endpoint configuration, send a valid HTTPS POST, and confirm the dashboard updates. Database persistence and any authentication or device security can be considered after the prototype deployment.
