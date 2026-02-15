import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3001);
const authToken = process.env.WINNER_API_TOKEN || "";
const corsOrigin = process.env.CORS_ORIGIN || "*";
const streamElementsJwt = process.env.STREAMELEMENTS_JWT || "";
const streamElementsChannelId = process.env.STREAMELEMENTS_CHANNEL_ID || "";

let latestWinner = null;
let spinEnabled = true;
const sseClients = new Set();
let streamSessionId = Date.now().toString();
let streamSessionStartedAt = new Date().toISOString();
const userSpinRecords = new Map();

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

function normalizeUserKey(userName) {
  return String(userName || "").trim().toLowerCase();
}

function getUserRecord(userName) {
  const key = normalizeUserKey(userName);
  if (!key) return null;

  if (!userSpinRecords.has(key)) {
    userSpinRecords.set(key, {
      userName: String(userName || "").trim(),
      spinsUsed: 0,
      bonusUnlocked: false,
      bonusUsed: false,
      followedThisStream: false
    });
  }

  return userSpinRecords.get(key);
}

function evaluateSpinEligibility(userName) {
  const record = getUserRecord(userName);
  if (!record) {
    return { allowed: false, reason: "missing-user" };
  }

  if (record.spinsUsed === 0) {
    return { allowed: true, reason: "first-spin" };
  }

  if (record.spinsUsed === 1 && record.bonusUnlocked && !record.bonusUsed) {
    return { allowed: true, reason: "follow-bonus" };
  }

  if (record.spinsUsed >= 2 || record.bonusUsed) {
    return { allowed: false, reason: "limit-reached" };
  }

  return { allowed: false, reason: "follow-required" };
}

function registerSpinUsage(userName) {
  const record = getUserRecord(userName);
  if (!record) return;

  if (record.spinsUsed === 1 && record.bonusUnlocked && !record.bonusUsed) {
    record.bonusUsed = true;
  }

  record.spinsUsed += 1;
}

function registerFollowEvent(userName) {
  const record = getUserRecord(userName);
  if (!record) return;

  record.followedThisStream = true;

  // Bonus spin only unlocks if they had already used their first spin.
  if (record.spinsUsed >= 1 && !record.bonusUsed) {
    record.bonusUnlocked = true;
  }
}

function resetStreamSession() {
  userSpinRecords.clear();
  streamSessionId = Date.now().toString();
  streamSessionStartedAt = new Date().toISOString();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/winner", (_req, res) => {
  res.json({ winner: latestWinner });
});

app.get("/api/spin-enabled", (_req, res) => {
  res.json({ spinEnabled });
});

app.post("/api/spin-enabled", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (typeof req.body.spinEnabled !== "boolean") {
    return res.status(400).json({ error: "spinEnabled boolean is required" });
  }

  spinEnabled = req.body.spinEnabled;
  console.log("[spin-enabled] updated", { spinEnabled });
  return res.status(200).json({ spinEnabled });
});

app.get("/api/spin-eligibility", (req, res) => {
  const userName = typeof req.query.userName === "string" ? req.query.userName : "";
  const result = evaluateSpinEligibility(userName);
  return res.json({
    ...result,
    streamSessionId,
    streamSessionStartedAt
  });
});

app.get("/api/stream/state", (_req, res) => {
  return res.json({
    streamSessionId,
    streamSessionStartedAt,
    trackedUsers: userSpinRecords.size,
    spinEnabled
  });
});

app.post("/api/spin-attempt", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userName =
    typeof req.body.userName === "string" ? req.body.userName.trim() : "";

  if (!userName) {
    return res.status(400).json({ error: "userName is required" });
  }

  if (!spinEnabled) {
    return res.status(200).json({
      allowed: false,
      reason: "feature-disabled",
      streamSessionId,
      streamSessionStartedAt
    });
  }

  const eligibility = evaluateSpinEligibility(userName);
  if (!eligibility.allowed) {
    return res.status(200).json({
      ...eligibility,
      streamSessionId,
      streamSessionStartedAt
    });
  }

  registerSpinUsage(userName);
  return res.status(200).json({
    allowed: true,
    reason: eligibility.reason,
    streamSessionId,
    streamSessionStartedAt
  });
});

app.post("/api/spin-follow", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userName =
    typeof req.body.userName === "string" ? req.body.userName.trim() : "";

  if (!userName) {
    return res.status(400).json({ error: "userName is required" });
  }

  registerFollowEvent(userName);
  return res.status(200).json({
    ok: true,
    streamSessionId,
    streamSessionStartedAt
  });
});

app.post("/api/stream/reset", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  resetStreamSession();
  console.log("[stream] session reset", { streamSessionId, streamSessionStartedAt });
  return res.status(200).json({ streamSessionId, streamSessionStartedAt });
});

app.get("/api/winner/message", (_req, res) => {
  if (!latestWinner || !latestWinner.hero) {
    return res.status(404).send("No winner has been selected yet.");
  }

  return res.send(`Your spin landed on ${latestWinner.hero}!`);
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

app.post("/api/chat-reply", async (req, res) => {
  const requestMeta = {
    hasAuthHeader: Boolean(req.get("x-api-token")),
    hasHero: typeof req.body.hero === "string" && Boolean(req.body.hero.trim()),
    hasCustomMessage:
      typeof req.body.message === "string" && Boolean(req.body.message.trim()),
    hasUserName:
      typeof req.body.userName === "string" && Boolean(req.body.userName.trim()),
    hasReplyTo:
      typeof req.body.replyTo === "string" && Boolean(req.body.replyTo.trim())
  };
  console.log("[chat-reply] incoming request", requestMeta);

  if (!isAuthorized(req)) {
    console.error("[chat-reply] rejected: unauthorized request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!streamElementsJwt || !streamElementsChannelId) {
    console.error("[chat-reply] rejected: missing StreamElements server config", {
      hasJwt: Boolean(streamElementsJwt),
      hasChannelId: Boolean(streamElementsChannelId)
    });
    return res.status(500).json({
      error: "Server is missing STREAMELEMENTS_JWT or STREAMELEMENTS_CHANNEL_ID"
    });
  }

  const hero = typeof req.body.hero === "string" ? req.body.hero.trim() : "";
  const customMessage =
    typeof req.body.message === "string" ? req.body.message.trim() : "";
  const userName =
    typeof req.body.userName === "string" ? req.body.userName.trim() : "";
  const replyTo =
    typeof req.body.replyTo === "string" ? req.body.replyTo.trim() : "";

  if (!hero && !customMessage) {
    console.error("[chat-reply] rejected: missing hero/message in payload");
    return res.status(400).json({ error: "hero or message is required" });
  }

  const body = {
    message: customMessage
      ? customMessage
      : userName
      ? `@${userName} Your spin landed on ${hero}!`
      : `Your spin landed on ${hero}!`
  };
  if (replyTo) {
    body.replyTo = replyTo;
  }

  try {
    console.log("[chat-reply] sending upstream request", {
      channelId: streamElementsChannelId,
      messagePreview: body.message,
      hasReplyTo: Boolean(body.replyTo)
    });

    const response = await fetch(
      `https://api.streamelements.com/kappa/v2/bot/${encodeURIComponent(
        streamElementsChannelId
      )}/say`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${streamElementsJwt}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const responseText = await response.text();
    if (!response.ok) {
      console.error("[chat-reply] upstream error", {
        status: response.status,
        responseText
      });
      return res.status(response.status).json({
        error: "StreamElements bot API request failed",
        details: responseText
      });
    }

    console.log("[chat-reply] upstream success", {
      status: response.status,
      responseText
    });
    return res.status(200).json({ ok: true, details: responseText });
  } catch (error) {
    console.error("[chat-reply] exception while calling upstream", error);
    return res.status(500).json({
      error: "Failed to call StreamElements bot API",
      details: String(error)
    });
  }
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
