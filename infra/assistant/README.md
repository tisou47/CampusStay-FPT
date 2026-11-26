# Production's AI assistant on a developer machine

The students' AI assistant (ADR-28, contract A-68) needs an Ollama server. The production VM is too small to run a
7B model, so production calls Ollama on a team member's machine with a GPU, through an HTTPS tunnel:

```
Student → Web (Vercel) → API (Azure) ──HTTPS, "Authorization: Bearer <key>"──▶ ngrok ──▶ ollama-proxy.mjs (127.0.0.1:8081) ──▶ Ollama (127.0.0.1:11434)
```

Ollama has no authentication: the tunnel only reaches `ollama-proxy.mjs`, which lets through `POST /api/chat` (what
`OllamaAssistantModel` calls) and `GET /api/tags` (checks), and only with the key. When the machine is off, the
assistant tells students it is offline; nothing else in CampusStay depends on it.

## Once

1. Install [Ollama](https://ollama.com) and Node.js 22, then `ollama pull qwen2.5:7b`.
2. Install ngrok (`winget install ngrok.ngrok`), create a free account at ngrok.com, then
   `ngrok config add-authtoken <token from the ngrok dashboard>`.
3. In the ngrok dashboard › **Domains**, claim the free static domain (`<name>.ngrok-free.app`). It never changes, so
   the server's settings are set once.
4. From the repository root:
   ```
   powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -Domain <name>.ngrok-free.app
   ```
   It creates a random key in `%USERPROFILE%\.campusstay\assistant.env` (outside the repository), loads the model,
   starts the proxy and the tunnel, checks that the tunnel answers with the key and refuses without it, and prints:
   ```
   ASSISTANT_BASE_URL=https://<name>.ngrok-free.app
   ASSISTANT_API_KEY=<key>
   ASSISTANT_MODEL=qwen2.5:7b
   ```
5. Put those three lines in `/opt/campusstay/.env` on the server (production settings: the person who manages the
   server does it) and restart the `api` container. The chat button appears for students.

## Each time (before a demo, or whenever the assistant should be on)

```
powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1          # start
powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -Stop    # stop
powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -ShowSettings
```

Two windows open (the proxy's log and ngrok); keep them open. The proxy runs hidden and logs each call with its status
and time to `%USERPROFILE%\.campusstay\assistant-proxy.log`, which the log window shows: clicking in it (or pausing
it) no longer stops the proxy, as a click in a console window running the proxy did.

## Before a demo

- Run the script about 10 minutes before; it loads the model, so the first student's question is not the slow one.
- Turn off sleep and plug the machine in; have a phone hotspot ready if the room's Wi-Fi blocks ngrok.
- Check from another network (a phone on 4G): sign in as a student on the production web and ask "Mình ở phòng nào?".
- Fallback: run CampusStay locally (`dev` profile uses `http://localhost:11434` directly).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The script says the tunnel does not answer | ngrok has no authtoken, or the domain is not yours | `ngrok config add-authtoken …`; check the domain in the ngrok dashboard |
| Students see "assistant offline" | This machine, the proxy or ngrok is off | Run the script again |
| The proxy logs `401` | The server's `ASSISTANT_API_KEY` differs from the key here | `-ShowSettings`, then update the server |
| Answers time out | The model runs on the CPU (no or small GPU) | Use a machine with a GPU; keep questions short |
| Words appear, then "The answer was cut off" | The streamed answer ran past `campusstay.assistant.stream-timeout` (3 min; a long answer with the student's data took over 90 s on a laptop GPU) | Use a faster GPU, or raise it on the server with `CAMPUSSTAY_ASSISTANT_STREAM_TIMEOUT` (keep it under half of the controller's 7-minute stream) |
| The answer is cleared and written again ("writing the answer again…") | Qwen slipped into Chinese: CampusStay stops that answer at the first Chinese character, the proxy stops Ollama (log line `closed by CampusStay`) and the question is asked once more | Normal; if it happens often, ask in Vietnamese or English only |
| New key needed (leaked) | — | Delete `OLLAMA_PROXY_KEY` from `assistant.env`, run the script, update the server |
