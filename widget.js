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
const lastSpin = document.getElementById("last-spin");
const lastSpinUser = document.getElementById("last-spin-user");
const lastSpinHero = document.getElementById("last-spin-hero");

const TAU = Math.PI * 2;
let triggerCommand = "!spin";
let spinDurationMs = 8000;
let resultHoldMs = 7000;
let spinSound;
let winnerApiUrl = "";
let spinFollowApiUrl = "";
let spinQueueEnqueueApiUrl = "";
let spinQueueStateApiUrl = "";
let spinQueueCompleteApiUrl = "";
let winnerApiToken = "";
let chatReplyApiUrl = "";
const minFullTurns = 8;
const maxFullTurns = 12;

let rotation = 0;
let isSpinning = false;
let resultTimer = null;
let queuePollTimer = null;
let currentQueueRequestId = "";

function normalizeAngle(rad) {
  const r = rad % TAU;
  return r < 0 ? r + TAU : r;
}

function pickRandomIndex() {
  return Math.floor(Math.random() * HEROES.length);
}

function getIndexAtPointer(currentRotation) {
  const arc = TAU / HEROES.length;
  const pointerInUnrotatedSpace = normalizeAngle(-Math.PI / 2 - currentRotation);
  const normalizedFromFirstSlice = normalizeAngle(pointerInUnrotatedSpace + Math.PI / 2);
  return Math.floor(normalizedFromFirstSlice / arc) % HEROES.length;
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

function showLatestUserAndHero(hero, userName) {
  if (!lastSpin || !lastSpinUser || !lastSpinHero) return;
  lastSpinUser.textContent = userName;
  lastSpinHero.textContent = hero;
  lastSpin.classList.remove("hidden");
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

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (winnerApiToken) {
    headers["x-api-token"] = winnerApiToken;
  }
  return headers;
}

async function enqueueSpinRequest(userName, messageId) {
  if (!spinQueueEnqueueApiUrl) {
    return { queued: false, reason: "queue-api-not-configured" };
  }

  try {
    const response = await fetch(spinQueueEnqueueApiUrl, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userName, messageId })
    });
    if (!response.ok) {
      return { queued: false, reason: "queue-api-error" };
    }
    const json = await response.json();
    return {
      queued: json.queued === true,
      reason: String(json.reason || ""),
      queuePosition: Number(json.queuePosition || 0)
    };
  } catch (_error) {
    return { queued: false, reason: "queue-api-unreachable" };
  }
}

async function registerFollowForUser(userName) {
  if (!spinFollowApiUrl || !userName) return;

  try {
    await fetch(spinFollowApiUrl, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userName })
    });
  } catch (_error) {
    // Ignore follow registration failures.
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

  try {
    const response = await fetch(chatReplyApiUrl, {
      method: "POST",
      headers: getAuthHeaders(),
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

function playSound(sound) {
  if (sound !== undefined && sound !== null && sound.tagName.toLowerCase() === "audio") {
    sound.play();
  }
}

function stopSound(sound) {
  if (sound !== undefined && sound !== null && sound.tagName.toLowerCase() === "audio" && !spinSound.ended) {
    spinSound.pause();
    spinSound.currentTime = 0;
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
  const turns =
    Math.floor(Math.random() * (maxFullTurns - minFullTurns + 1)) + minFullTurns;
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
    stopSound(spinSound);
    const landedIndex = getIndexAtPointer(rotation);
    const hero = HEROES[landedIndex];
    showWinner(hero, userName);
    reportWinner(hero, userName);
    sendChatReply(hero, userName, messageId);
    completeQueueItem(currentQueueRequestId);
    hideWidgetLater();
    showLatestUserAndHero(hero, userName);
  }

  playSound(spinSound);
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

function parseFollowerEvent(detail) {
  if (!detail) return "";
  const event = detail.event || detail;
  const data = event.data || event;
  const userName =
    data.name ||
    data.username ||
    data.displayName ||
    data.nick ||
    data.user ||
    "";

  return String(userName).trim();
}

function isSpinCommand(text) {
  return text.toLowerCase() === triggerCommand;
}

async function completeQueueItem(queueId) {
  if (!spinQueueCompleteApiUrl || !queueId) return;

  try {
    await fetch(spinQueueCompleteApiUrl, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: queueId })
    });
  } catch (_error) {
    // Ignore completion failures; dashboard can still recover manually.
  }
}

async function pollQueueState() {
  if (!spinQueueStateApiUrl || isSpinning) return;

  try {
    const response = await fetch(spinQueueStateApiUrl, {
      method: "GET",
      headers: winnerApiToken ? { "x-api-token": winnerApiToken } : {}
    });
    if (!response.ok) return;

    const json = await response.json();
    const activeItem = json && json.activeItem ? json.activeItem : null;
    if (!activeItem || !activeItem.id || !activeItem.userName) {
      currentQueueRequestId = "";
      return;
    }
    if (currentQueueRequestId === activeItem.id) return;

    currentQueueRequestId = activeItem.id;
    spinForUser(activeItem.userName, activeItem.messageId || "");
  } catch (_error) {
    // Ignore polling failures to keep widget stable.
  }
}

function startQueuePolling() {
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
  }
  queuePollTimer = setInterval(pollQueueState, 1200);
  pollQueueState();
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

  if (typeof fieldData.spinSound === "string") {
    console.log("setting sound");
    spinSound = new Audio(fieldData.spinSound);
  }

  if (typeof fieldData.winnerApiUrl === "string" && fieldData.winnerApiUrl.trim()) {
    winnerApiUrl = fieldData.winnerApiUrl.trim();
  }

  if (
    typeof fieldData.spinQueueEnqueueApiUrl === "string" &&
    fieldData.spinQueueEnqueueApiUrl.trim()
  ) {
    spinQueueEnqueueApiUrl = fieldData.spinQueueEnqueueApiUrl.trim();
  }

  if (
    typeof fieldData.spinQueueStateApiUrl === "string" &&
    fieldData.spinQueueStateApiUrl.trim()
  ) {
    spinQueueStateApiUrl = fieldData.spinQueueStateApiUrl.trim();
  }

  if (
    typeof fieldData.spinQueueCompleteApiUrl === "string" &&
    fieldData.spinQueueCompleteApiUrl.trim()
  ) {
    spinQueueCompleteApiUrl = fieldData.spinQueueCompleteApiUrl.trim();
  }

  if (
    typeof fieldData.spinFollowApiUrl === "string" &&
    fieldData.spinFollowApiUrl.trim()
  ) {
    spinFollowApiUrl = fieldData.spinFollowApiUrl.trim();
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
  startQueuePolling();
});

window.addEventListener("onEventReceived", (obj) => {
  async function handleMessageEvent() {
    const detail = obj && obj.detail ? obj.detail : {};
    const listener = detail.listener || "";

    if (listener === "follower-latest") {
      const followedUser = parseFollowerEvent(detail);
      if (followedUser) {
        registerFollowForUser(followedUser);
      }
      return;
    }

    if (listener !== "message") return;

    const parsed = parseMessageEvent(detail);
    if (!parsed || !isSpinCommand(parsed.text)) return;

    const enqueueResult = await enqueueSpinRequest(
      parsed.userName,
      parsed.messageId
    );
    if (!enqueueResult.queued) {
      const blockedMessage =
        enqueueResult.reason === "feature-disabled"
          ? `@${parsed.userName} The spin feature is not active right now`
          : enqueueResult.reason === "follow-required"
          ? `@${parsed.userName} You already used your one spin. Follow the channel to unlock one extra spin this stream.`
          : enqueueResult.reason === "already-queued"
          ? `@${parsed.userName} You are already in queue.`
          : enqueueResult.reason === "already-active"
          ? `@${parsed.userName} You are currently up next.`
          : enqueueResult.reason === "queue-api-unreachable" ||
            enqueueResult.reason === "queue-api-error" ||
            enqueueResult.reason === "queue-api-not-configured"
          ? `@${parsed.userName} Spin queue service is temporarily unavailable.`
          : `@${parsed.userName} You already used your allowed spins for this stream.`;
      sendChatReply(null, parsed.userName, parsed.messageId, blockedMessage);
      return;
    }

    const queuedMessage = `@${parsed.userName} You are in the spin queue (position ${enqueueResult.queuePosition}).`;
    sendChatReply(null, parsed.userName, parsed.messageId, queuedMessage);
  }

  handleMessageEvent();
});
