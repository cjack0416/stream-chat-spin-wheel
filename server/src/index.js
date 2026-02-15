import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3001);
const authToken = process.env.WINNER_API_TOKEN || "";
const corsOrigin = process.env.CORS_ORIGIN || "*";

let latestWinner = null;
const sseClients = new Set();

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

function pushUpdate(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    res.write(data);
  }
}

function isAuthorized(req) {
  if (!authToken) return true;
  const tokenHeader = req.get("x-api-token") || "";
  return tokenHeader === authToken;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/winner", (_req, res) => {
  res.json({ winner: latestWinner });
});

app.post("/api/winner", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const hero = typeof req.body.hero === "string" ? req.body.hero.trim() : "";
  const userName =
    typeof req.body.userName === "string" ? req.body.userName.trim() : "";

  if (!hero) {
    return res.status(400).json({ error: "hero is required" });
  }

  latestWinner = {
    hero,
    userName,
    receivedAt: new Date().toISOString()
  };

  pushUpdate(latestWinner);
  return res.status(201).json({ winner: latestWinner });
});

app.get("/api/winner/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(": connected\n\n");
  if (latestWinner) {
    res.write(`data: ${JSON.stringify(latestWinner)}\n\n`);
  }

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.listen(port, () => {
  console.log(`Winner server running on http://localhost:${port}`);
});
