const HEROES = [
  "ADAM WARLOCK",
  "ANGELA",
  "BLACK PANTHER",
  "BLACK WIDOW",
  "BLADE",
  "CAPTAIN AMERICA",
  "CLOAK & DAGGER",
  "DAREDEVIL",
  "DEADPOOL",
  "DOCTOR STRANGE",
  "ELSA BLOODSTONE",
  "EMMA FROST",
  "GAMBIT",
  "GROOT",
  "HAWKEYE",
  "HELA",
  "HULK",
  "HUMAN TORCH",
  "INVISIBLE WOMAN",
  "IRON FIST",
  "IRON MAN",
  "PHOENIX",
  "JEFF THE LAND SHARK",
  "LOKI",
  "LUNA SNOW",
  "MAGIK",
  "MAGNETO",
  "MANTIS",
  "MISTER FANTASTIC",
  "MOON KNIGHT",
  "NAMOR",
  "PENI PARKER",
  "PSYLOCKE",
  "ROCKET RACCOON",
  "ROGUE",
  "SCARLET WITCH",
  "SPIDER-MAN",
  "SQUIRREL GIRL",
  "STAR-LORD",
  "STORM",
  "THE PUNISHER",
  "THE THING",
  "THOR",
  "ULTRON",
  "VENOM",
  "WINTER SOLDIER",
  "WOLVERINE"
];

const COLORS = [
  "#E11D48",
  "#2563EB",
  "#16A34A",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#B91C1C",
  "#334155"
];

const canvas = document.getElementById("wheel");
const wheelWrap = document.getElementById("wheel-wrap");
const winnerEl = document.getElementById("winner");
const ctx = canvas.getContext("2d");

const TAU = Math.PI * 2;
let triggerCommand = "!spin";
let spinDurationMs = 8000;
let resultHoldMs = 7000;
let winnerApiUrl = "";
let spinEnabledApiUrl = "";
let winnerApiToken = "";
let chatReplyApiUrl = "";
const minFullTurns = 8;
const maxFullTurns = 12;

let rotation = 0;
let isSpinning = false;
let resultTimer = null;

function normalizeAngle(rad) {
  const r = rad % TAU;
  return r < 0 ? r + TAU : r;
}

function pickRandomIndex() {
  return Math.floor(Math.random() * HEROES.length);
}

function drawWheel() {
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 8;
  const arc = TAU / HEROES.length;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(rotation);

  for (let i = 0; i < HEROES.length; i += 1) {
    const start = i * arc - Math.PI / 2;
    const end = start + arc;
    const hero = HEROES[i];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + arc / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "700 18px Trebuchet MS";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 3;
    ctx.fillText(hero, radius - 20, 6);
    ctx.restore();
  }

  ctx.restore();
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function showWinner(hero, userName) {
  const by = userName ? ` (@${userName})` : "";
  winnerEl.textContent = `${hero}${by}`;
  winnerEl.classList.remove("hidden");
}

function clearWinner() {
  winnerEl.classList.add("hidden");
  winnerEl.textContent = "";
}

function hideWidgetLater() {
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => {
    wheelWrap.classList.add("hidden");
    clearWinner();
  }, resultHoldMs);
}

async function reportWinner(hero, userName) {
  if (!winnerApiUrl) return;

  const payload = { hero, userName };
  const headers = { "Content-Type": "application/json" };
  if (winnerApiToken) {
    headers["x-api-token"] = winnerApiToken;
  }

  try {
    await fetch(winnerApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  } catch (_error) {
    // Ignore network failures so widget behavior is not interrupted.
  }
}

async function isSpinFeatureEnabled() {
  if (!spinEnabledApiUrl) return true;

  const headers = {};
  if (winnerApiToken) {
    headers["x-api-token"] = winnerApiToken;
  }

  try {
    const response = await fetch(spinEnabledApiUrl, {
      method: "GET",
      headers
    });
    if (!response.ok) return true;

    const json = await response.json();
    return json.spinEnabled !== false;
  } catch (_error) {
    return true;
  }
}

async function sendChatReply(hero, userName, messageId, customMessage) {
  if (!chatReplyApiUrl) return;

  const payload = { userName };
  if (hero) {
    payload.hero = hero;
  }
  if (customMessage) {
    payload.message = customMessage;
  }
  if (messageId) {
    payload.replyTo = messageId;
  }

  const headers = { "Content-Type": "application/json" };
  if (winnerApiToken) {
    headers["x-api-token"] = winnerApiToken;
  }

  try {
    const response = await fetch(chatReplyApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error(
        `Failed to send chat reply via server (${response.status}): ${responseText}`
      );
    }
  } catch (_error) {
    // Ignore network failures so widget behavior is not interrupted.
  }
}

function spinForUser(userName, messageId) {
  if (isSpinning) return;

  isSpinning = true;
  wheelWrap.classList.remove("hidden");
  clearWinner();

  const targetIndex = pickRandomIndex();
  const arc = TAU / HEROES.length;
  const wedgeCenter = targetIndex * arc + arc / 2;
  const desiredRotationAtRest = -wedgeCenter;
  const turns = minFullTurns + Math.random() * (maxFullTurns - minFullTurns);
  const endRotation = turns * TAU + desiredRotationAtRest;
  const startRotation = rotation;
  const delta = endRotation - startRotation;
  const start = performance.now();

  function animate(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / spinDurationMs, 1);
    rotation = startRotation + delta * easeOutCubic(t);
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
      return;
    }

    rotation = normalizeAngle(rotation);
    drawWheel();
    isSpinning = false;
    const hero = HEROES[targetIndex];
    showWinner(hero, userName);
    reportWinner(hero, userName);
    sendChatReply(hero, userName, messageId);
    hideWidgetLater();
  }

  requestAnimationFrame(animate);
}

function parseMessageEvent(detail) {
  if (!detail) return null;

  const event = detail.event || detail;
  const data = event.data || event;
  const rawText = data.text || data.message || data.msg || "";
  const userName =
    data.displayName || data.nick || data.username || data.user || "";
  const messageId = data.msgId || data.msgid || data.messageId || data.id || "";

  return {
    text: String(rawText).trim(),
    userName: String(userName).trim(),
    messageId: String(messageId).trim()
  };
}

function isSpinCommand(text) {
  return text.toLowerCase() === triggerCommand;
}

window.addEventListener("onWidgetLoad", (obj) => {
  const fieldData =
    obj && obj.detail && obj.detail.fieldData ? obj.detail.fieldData : {};

  if (typeof fieldData.spinCommand === "string" && fieldData.spinCommand.trim()) {
    triggerCommand = fieldData.spinCommand.trim().toLowerCase();
  }

  if (Number.isFinite(Number(fieldData.spinDurationMs))) {
    spinDurationMs = Math.max(1000, Number(fieldData.spinDurationMs));
  }

  if (Number.isFinite(Number(fieldData.resultHoldMs))) {
    resultHoldMs = Math.max(1000, Number(fieldData.resultHoldMs));
  }

  if (typeof fieldData.winnerApiUrl === "string" && fieldData.winnerApiUrl.trim()) {
    winnerApiUrl = fieldData.winnerApiUrl.trim();
  }

  if (
    typeof fieldData.spinEnabledApiUrl === "string" &&
    fieldData.spinEnabledApiUrl.trim()
  ) {
    spinEnabledApiUrl = fieldData.spinEnabledApiUrl.trim();
  }

  if (
    typeof fieldData.winnerApiToken === "string" &&
    fieldData.winnerApiToken.trim()
  ) {
    winnerApiToken = fieldData.winnerApiToken.trim();
  }

  if (
    typeof fieldData.chatReplyApiUrl === "string" &&
    fieldData.chatReplyApiUrl.trim()
  ) {
    chatReplyApiUrl = fieldData.chatReplyApiUrl.trim();
  }

  drawWheel();
});

window.addEventListener("onEventReceived", (obj) => {
  async function handleMessageEvent() {
    const detail = obj && obj.detail ? obj.detail : {};
    const listener = detail.listener || "";

    if (listener !== "message") return;

    const parsed = parseMessageEvent(detail);
    if (!parsed || !isSpinCommand(parsed.text)) return;

    const enabled = await isSpinFeatureEnabled();
    if (!enabled) {
      const inactiveMessage = parsed.userName
        ? `@${parsed.userName} The spin feature is not active right now`
        : "The spin feature is not active right now";
      sendChatReply(null, parsed.userName, parsed.messageId, inactiveMessage);
      return;
    }

    spinForUser(parsed.userName, parsed.messageId);
  }

  handleMessageEvent();
});
