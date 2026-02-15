import { useEffect, useMemo, useState } from "react";

const apiBase = import.meta.env.VITE_WINNER_API_BASE || "http://localhost:3001";
const apiToken = import.meta.env.VITE_WINNER_API_TOKEN || "";

function formatTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleString();
}

export default function App() {
  const [winner, setWinner] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [spinEnabled, setSpinEnabled] = useState(true);
  const [toggleStatus, setToggleStatus] = useState("idle");
  const [streamSessionId, setStreamSessionId] = useState("-");
  const [streamSessionStartedAt, setStreamSessionStartedAt] = useState(null);
  const [resetStatus, setResetStatus] = useState("idle");
  const [queueState, setQueueState] = useState({ activeItem: null, queue: [] });
  const [nextStatus, setNextStatus] = useState("idle");

  const winnerStreamUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/winner/stream`;
  }, []);

  const winnerApiUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/winner`;
  }, []);

  const spinEnabledApiUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/spin-enabled`;
  }, []);

  const streamStateUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/stream/state`;
  }, []);

  const streamResetUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/stream/reset`;
  }, []);

  const queueStateUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/queue/state`;
  }, []);

  const queueNextUrl = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return `${base}/api/queue/next`;
  }, []);

  const authHeaders = useMemo(() => {
    if (!apiToken) return {};
    return { "x-api-token": apiToken };
  }, []);

  useEffect(() => {
    let mounted = true;
    let queueInterval;

    async function loadInitialState() {
      try {
        const [winnerResponse, spinResponse, streamStateResponse, queueResponse] =
          await Promise.all([
          fetch(winnerApiUrl),
          fetch(spinEnabledApiUrl),
          fetch(streamStateUrl),
          fetch(queueStateUrl)
        ]);
        const winnerJson = await winnerResponse.json();
        const spinJson = await spinResponse.json();
        const streamStateJson = await streamStateResponse.json();
        const queueJson = await queueResponse.json();
        if (mounted) {
          if (winnerJson.winner) {
            setWinner(winnerJson.winner);
          }
          setSpinEnabled(spinJson.spinEnabled !== false);
          if (streamStateJson.streamSessionId) {
            setStreamSessionId(streamStateJson.streamSessionId);
          }
          if (streamStateJson.streamSessionStartedAt) {
            setStreamSessionStartedAt(streamStateJson.streamSessionStartedAt);
          }
          setQueueState({
            activeItem: queueJson.activeItem || null,
            queue: Array.isArray(queueJson.queue) ? queueJson.queue : []
          });
        }
      } catch (_error) {
        if (mounted) setStatus("disconnected");
      }
    }

    async function refreshQueueState() {
      try {
        const response = await fetch(queueStateUrl);
        if (!response.ok) return;
        const json = await response.json();
        if (mounted) {
          setQueueState({
            activeItem: json.activeItem || null,
            queue: Array.isArray(json.queue) ? json.queue : []
          });
        }
      } catch (_error) {
        // Ignore queue polling issues to keep dashboard responsive.
      }
    }

    loadInitialState();
    queueInterval = setInterval(refreshQueueState, 1500);

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
      clearInterval(queueInterval);
      source.close();
    };
  }, [queueStateUrl, spinEnabledApiUrl, streamStateUrl, winnerApiUrl, winnerStreamUrl]);

  async function toggleSpinEnabled() {
    const nextValue = !spinEnabled;
    setToggleStatus("saving");
    try {
      const response = await fetch(spinEnabledApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ spinEnabled: nextValue })
      });
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const json = await response.json();
      setSpinEnabled(json.spinEnabled !== false);
      setToggleStatus("idle");
    } catch (_error) {
      setToggleStatus("error");
    }
  }

  async function resetStreamSession() {
    setResetStatus("saving");
    try {
      const response = await fetch(streamResetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        }
      });
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const json = await response.json();
      setStreamSessionId(json.streamSessionId || "-");
      setStreamSessionStartedAt(json.streamSessionStartedAt || null);
      setResetStatus("idle");
    } catch (_error) {
      setResetStatus("error");
    }
  }

  async function moveToNextQueueUser() {
    setNextStatus("saving");
    try {
      const response = await fetch(queueNextUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        }
      });
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const json = await response.json();
      setQueueState({
        activeItem: json.activeItem || null,
        queue: Array.isArray(json.queue) ? json.queue : []
      });
      setNextStatus("idle");
    } catch (_error) {
      setNextStatus("error");
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="panel__header">
          <h1>Spin Wheel Dashboard</h1>
          <p>Status: {status}</p>
        </header>

        <div className="toggle-card">
          <div className="toggle-card__label">Spin Feature</div>
          <div className="toggle-card__state">{spinEnabled ? "Enabled" : "Disabled"}</div>
          <button
            className="toggle-card__button"
            type="button"
            onClick={toggleSpinEnabled}
            disabled={toggleStatus === "saving"}
          >
            {toggleStatus === "saving"
              ? "Saving..."
              : spinEnabled
              ? "Turn Off"
              : "Turn On"}
          </button>
          {toggleStatus === "error" ? (
            <div className="toggle-card__error">Failed to update. Check server auth/token.</div>
          ) : null}
        </div>

        <div className="session-card">
          <div className="session-card__label">Stream Session</div>
          <div className="session-card__meta">ID: {streamSessionId}</div>
          <div className="session-card__meta">
            Started: {formatTime(streamSessionStartedAt)}
          </div>
          <button
            className="session-card__button"
            type="button"
            onClick={resetStreamSession}
            disabled={resetStatus === "saving"}
          >
            {resetStatus === "saving" ? "Resetting..." : "Reset Stream Limits"}
          </button>
          {resetStatus === "error" ? (
            <div className="toggle-card__error">Failed to reset stream session.</div>
          ) : null}
        </div>

        <div className="queue-card">
          <div className="queue-card__label">Spin Queue</div>
          <div className="queue-card__meta">
            Active: {queueState.activeItem ? `@${queueState.activeItem.userName}` : "None"}
          </div>
          <div className="queue-card__meta">Waiting: {queueState.queue.length}</div>
          <button
            className="queue-card__button"
            type="button"
            onClick={moveToNextQueueUser}
            disabled={nextStatus === "saving"}
          >
            {nextStatus === "saving" ? "Advancing..." : "Start Next Spin"}
          </button>
          {nextStatus === "error" ? (
            <div className="toggle-card__error">
              Could not advance queue. Complete current active spin first.
            </div>
          ) : null}
          <div className="queue-card__list">
            {queueState.queue.length === 0 ? (
              <div className="queue-card__empty">No viewers waiting in queue.</div>
            ) : (
              queueState.queue.slice(0, 8).map((item, index) => (
                <div className="queue-card__item" key={item.id}>
                  {index + 1}. @{item.userName}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="winner-card">
          <div className="winner-card__label">Last Winner</div>
          <div className="winner-card__hero">{winner?.hero || "Waiting for first spin..."}</div>
          <div className="winner-card__meta">
            Requested by: {winner?.userName ? `@${winner.userName}` : "-"}
          </div>
          <div className="winner-card__meta">Updated: {formatTime(winner?.receivedAt)}</div>
        </div>

      </section>
    </main>
  );
}
