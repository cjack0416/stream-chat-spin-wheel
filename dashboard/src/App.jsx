import { useEffect, useMemo, useState } from "react";

const apiBase = import.meta.env.VITE_WINNER_API_BASE || "http://localhost:3001";

function formatTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleString();
}

export default function App() {
  const [winner, setWinner] = useState(null);
  const [status, setStatus] = useState("connecting");

  const winnerStreamUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/winner/stream`;
  }, []);

  const winnerApiUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/winner`;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadInitialWinner() {
      try {
        const response = await fetch(winnerApiUrl);
        const json = await response.json();
        if (mounted && json.winner) {
          setWinner(json.winner);
        }
      } catch (_error) {
        if (mounted) setStatus("disconnected");
      }
    }

    loadInitialWinner();

    const source = new EventSource(winnerStreamUrl);
    source.onopen = () => {
      if (mounted) setStatus("live");
    };
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (mounted) {
          setWinner(payload);
          setStatus("live");
        }
      } catch (_error) {
        if (mounted) setStatus("degraded");
      }
    };
    source.onerror = () => {
      if (mounted) setStatus("reconnecting");
    };

    return () => {
      mounted = false;
      source.close();
    };
  }, [winnerApiUrl, winnerStreamUrl]);

  return (
    <main className="page">
      <section className="panel">
        <header className="panel__header">
          <h1>Spin Wheel Dashboard</h1>
          <p>Status: {status}</p>
        </header>

        <div className="winner-card">
          <div className="winner-card__label">Last Winner</div>
          <div className="winner-card__hero">{winner?.hero || "Waiting for first spin..."}</div>
          <div className="winner-card__meta">
            Requested by: {winner?.userName ? `@${winner.userName}` : "-"}
          </div>
          <div className="winner-card__meta">Updated: {formatTime(winner?.receivedAt)}</div>
        </div>

        <p className="hint">Set <code>VITE_WINNER_API_BASE</code> if your server is not on localhost:3001.</p>
      </section>
    </main>
  );
}
