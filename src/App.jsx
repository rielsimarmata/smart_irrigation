import { useEffect, useState } from 'react';

// Same-origin in production; Vite proxies /api to the local Express server in development.
const API_URL = '/api/sensor';
const EMPTY = '--';

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }
function formatTime(timestamp) {
  if (!timestamp) return 'Menunggu data ESP32...';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp));
}
function formatDate(timestamp) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp));
}

export default function App() {
  const [sensor, setSensor] = useState(null);
  const [history, setHistory] = useState([]);
  const [apiError, setApiError] = useState(false);
  const online = Boolean(sensor?.timestamp) && Date.now() - new Date(sensor.timestamp).getTime() < 10_000;

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const sensorResult = await fetch(API_URL);
        if (!sensorResult.ok) throw new Error('API response error');
        const sensorBody = await sensorResult.json();
        if (mounted) {
          setSensor(sensorBody.data);
          setHistory(sensorBody.history || []);
          setApiError(false);
        }
      } catch {
        if (mounted) setApiError(true);
      }
    };
    fetchData();
    const timer = window.setInterval(fetchData, 3000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const displayed = online ? sensor : null;
  const stats = [
    { label: 'Kelembapan Tanah', value: displayed ? `${displayed.soilMoisture}%` : EMPTY, icon: '◒', main: true },
    { label: 'Suhu', value: displayed ? `${displayed.temperature}°C` : EMPTY, icon: '♨' },
    { label: 'Kelembapan Udara', value: displayed ? `${displayed.airHumidity}%` : EMPTY, icon: '◉' },
    { label: 'Kondisi Hujan', value: displayed ? (displayed.rain ? 'HUJAN' : 'TIDAK HUJAN') : EMPTY, icon: '☂', rain: displayed?.rain },
  ];

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">✦</div><div><h1>SMART IRRIGATION</h1><p>Monitoring & Penyiraman Tanaman Otomatis</p></div></div>
      <div className="connection"><div className={`connection-state ${online ? 'online' : 'offline'}`}><i /> ESP32 {online ? 'ONLINE' : 'OFFLINE'}</div><span>Terakhir diperbarui: {formatTime(sensor?.timestamp)}</span></div>
    </header>
    {apiError && <div className="api-warning">API tidak dapat dijangkau. Menampilkan data terakhir yang tersimpan di dashboard.</div>}
    <section className="intro"><div><p className="eyebrow">DASHBOARD SISTEM</p><h2>Kondisi tanaman, <em>sekilas.</em></h2></div><p>Data hanya ditampilkan setelah diterima dari perangkat ESP32.</p></section>
    <section className="metrics">{stats.map((stat) => <article className={`metric ${stat.main ? 'soil' : ''} ${stat.rain ? 'raining' : ''}`} key={stat.label}><Icon>{stat.icon}</Icon><p>{stat.label}</p><strong>{stat.value}</strong>{stat.main && <small>Sensor utama irigasi</small>}</article>)}</section>
    <section className="control-grid">
      <article className="decision-panel"><div className="panel-label"><Icon>✦</Icon> KEPUTUSAN PENYIRAMAN</div><div className="decision-value">{displayed?.decision || EMPTY}</div><p>{displayed ? 'Keputusan diterima dari ESP32 / sistem KNN.' : 'Menunggu keputusan dari ESP32.'}</p></article>
      <article className={`pump-panel ${displayed?.pump ? 'pump-on' : ''}`}><div className="panel-label"><Icon>◌</Icon> STATUS POMPA</div><strong>{displayed ? (displayed.pump ? 'POMPA AKTIF' : 'POMPA MATI') : EMPTY}</strong><span className="pump-dot" /> <p>Informasi saja — tanpa kontrol manual.</p></article>
    </section>
    <section className="history-section"><div className="section-heading"><div><p className="eyebrow">REKAMAN TERBARU</p><h2>Riwayat data sensor</h2></div><span>{history.length} / 50 data tersimpan</span></div>
      <div className="table-wrap">{history.length === 0 ? <div className="empty"><b>Belum ada data sensor dari ESP32.</b><span>Riwayat akan muncul setelah API menerima data yang valid.</span></div> : <table><thead><tr><th>Waktu</th><th>Kelembapan Tanah</th><th>Suhu</th><th>Kelembapan Udara</th><th>Hujan</th><th>Keputusan</th><th>Pompa</th></tr></thead><tbody>{history.slice(0, 20).map((item) => <tr key={item.timestamp}><td>{formatDate(item.timestamp)}</td><td>{item.soilMoisture}%</td><td>{item.temperature}°C</td><td>{item.airHumidity}%</td><td><span className={item.rain ? 'badge rain-badge' : 'badge'}>{item.rain ? 'HUJAN' : 'TIDAK HUJAN'}</span></td><td><b>{item.decision}</b></td><td><span className={item.pump ? 'badge pump-badge' : 'badge'}>{item.pump ? 'AKTIF' : 'MATI'}</span></td></tr>)}</tbody></table>}</div>
    </section>
  </main>;
}
