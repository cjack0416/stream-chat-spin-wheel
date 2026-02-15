# Stream Chat Spin Wheel + Winner Dashboard

This repo now contains two pieces:

- `widget.*`: StreamElements custom widget for `!spin` hero selection
- `server/`: Node.js API that stores and broadcasts the last winner
- `dashboard/`: React SPA that displays the latest winner in real time

## 1) StreamElements Widget Setup

In your StreamElements Custom Widget:

1. Paste `widget.html` into **HTML**
2. Paste `widget.css` into **CSS**
3. Paste `widget.js` into **JS**
4. Paste `widget-fields.json` into **Fields**

Important widget fields:

- `spinCommand`: command to trigger spin (default `!spin`)
- `winnerApiUrl`: where winner events are sent (default `http://localhost:3001/api/winner`)
- `spinQueueEnqueueApiUrl`: where `!spin` requests are queued (default `http://localhost:3001/api/queue/enqueue`)
- `spinQueueStateApiUrl`: where widget polls active queue item (default `http://localhost:3001/api/queue/state`)
- `spinQueueCompleteApiUrl`: where widget marks active queue spin complete (default `http://localhost:3001/api/queue/complete`)
- `spinFollowApiUrl`: where widget reports follow events for bonus-spin unlock (default `http://localhost:3001/api/spin-follow`)
- `winnerApiToken`: optional token if your API is protected
- `chatReplyApiUrl`: where chat reply events are sent (default `http://localhost:3001/api/chat-reply`)

## 2) Run Winner API (Node.js)

```bash
cd server
npm install
npm run dev
```

Server defaults to `http://localhost:3001`.

Available endpoints:

- `GET /health`
- `GET /api/winner`
- `GET /api/spin-enabled`
- `GET /api/queue/state`
- `GET /api/stream/state`
- `GET /api/winner/message`
- `POST /api/winner` with JSON body `{ "hero": "...", "userName": "..." }`
- `POST /api/spin-enabled` with JSON body `{ "spinEnabled": true|false }`
- `POST /api/queue/enqueue` with JSON body `{ "userName": "...", "messageId": "..." }`
- `POST /api/queue/next` moves first queued user to active spin slot
- `POST /api/queue/complete` with JSON body `{ "id": "..." }`
- `POST /api/spin-follow` with JSON body `{ "userName": "..." }`
- `POST /api/stream/reset` resets per-stream user limits
- `POST /api/chat-reply` with JSON body `{ "hero": "...", "userName": "...", "replyTo": "..." }`
- `GET /api/winner/stream` (Server-Sent Events)

Optional environment variables (`server/.env.example`):

- `PORT=3001`
- `CORS_ORIGIN=*`
- `WINNER_API_TOKEN=`
- `STREAMELEMENTS_JWT=`
- `STREAMELEMENTS_CHANNEL_ID=`

If `WINNER_API_TOKEN` is set, widget must send matching token via `winnerApiToken` field.
`POST /api/chat-reply` requires both `STREAMELEMENTS_JWT` and `STREAMELEMENTS_CHANNEL_ID`.

## 3) Run Dashboard (React + Vite)

```bash
cd dashboard
npm install
npm run dev
```

Dashboard defaults to reading from `http://localhost:3001`.

To change API base URL, set `VITE_WINNER_API_BASE` (see `dashboard/.env.example`).

## Notes

- Winner storage is in-memory (resets when server restarts).
- Per-user spin limits and queue are service-side per stream session (not widget-local).
- Use dashboard `Reset Stream Limits` to start a new stream session without restarting.
- Use dashboard `Start Next Spin` to move from queued viewers to the next active spinner.
- While a spin is running, new `!spin` requests are added to queue.
- Hero list includes `INVISIBLE WOMAN` (corrected typo from `NVISIBLE WOMAN`).

## Runtime Requirements

- Node.js `>=20.5.0` (repo pins `20.12.2` in `.nvmrc`)
- npm `>=10.0.0 <11`

If you see an error from `.../npm/lib/es6/validate-engines.js`, your global npm and Node versions are mismatched. Fix with:

```bash
nvm install 20.12.2
nvm use 20.12.2
npm i -g npm@10.5.0
```
