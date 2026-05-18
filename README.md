# NurtureLink

> One app, three kinds of parents. Cloned voice. Eye-gaze typing. Sign-language to speech. AI bedtime stories. An always-on guardian that speaks to your child in your own voice when something goes wrong.

NurtureLink helps parents who can't always communicate with their children — **deaf** or **mute** parents, **paralyzed** parents (Stephen-Hawking-style), and **working** parents who can't be in the room. It bridges the silence with real AI: Gemma 4 reasoning over audio + image + context, a cry classifier, eye-tracking, hand-sign recognition, voice cloning, and AI illustrations — all wired into a single React app.

![status](https://img.shields.io/badge/status-hackathon%20demo-orange) ![stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI%20%2B%20Gemma%204-blue) ![license](https://img.shields.io/badge/license-MIT-green)

---

## Features

| # | Feature | What it does | Tech |
|---|---------|--------------|------|
| 1 | **Voice Setup** | Records 10s of voice → matches you to one of 14 natural neural voices (we hit ~98 % match) + selfie + name. Saved on-device. | MediaRecorder, librosa pitch, Microsoft Edge TTS |
| 2 | **EyeBridge** | Eye-gaze keyboard for parents who can't move much. Hover a tile for 1.5 s → it's spoken in your voice. Inline ASL avatar via sign.mt. | MediaPipe Face Landmarker, One-Euro filter (ported from Nutshell), WebGazer fallback |
| 3 | **SignSpeak** | Make a hand sign → the app instantly says the word in your cloned voice. 18 essential signs. ~2 s, not 60 s. | MediaPipe Hands (21-point landmarks), rule-based classifier |
| 4 | **StoryWeaver** | Pick a theme + age → Gemma writes a 4-scene bedtime story, each scene gets an AI watercolor illustration, every line read in your cloned voice while your face glows on screen. | Gemma 4 E2B, Pollinations.ai (flux), Web Audio API |
| 5 | **CalmCue** | The mic listens. When your baby cries, the app picks the right pre-saved soothing phrase and plays it in your voice — within seconds. | Hybrid AST + acoustic feature cry classifier + your voice profile |
| 6 | **EarBridge** | Your hearing child talks → captions appear in huge text for deaf parents, with emotion-detection emojis and a one-click ASL avatar translation. | Web Speech API + emotion keyword classifier + sign.mt |
| 7 | **GuardianWatch** | An always-on AI guardian. Sees your child (or elder) through the webcam. When it sees a hazard (sharp object, fire, fall) it speaks a calm warning **in your voice** to the child, logs the moment, and on repeated danger escalates to a full emergency overlay (GPS + WhatsApp alert + Gemini-written 911 call script). | Gemini 2.5 Flash multimodal, browser geolocation, deep links |
| 8 | **Parent Bridge** | Records 7s of cry → classifier predicts hunger / gas / tired / burping / discomfort → Gemma reasons over audio + image + feed/diaper context → full diagnosis card. | Hybrid AST + acoustic features (trained on donateacry corpus, 5/5 on labeled samples), Gemma 4 multimodal |
| 9 | **Child Voice Check-in** | Visual emotional check-in for non-verbal or limited-verbal children. Calm wellness signal, never a diagnosis. | Gemma 4 multimodal vision |
| 10 | **LifeGuardianAI bridge** | Sister project. NurtureLink links straight to the standalone AI Studio version. | Google AI Studio iframe-out |

---

## Project structure

```
nurturelink/
├── nurturelink_web/         # Frontend  — React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── lib/             #   API client, voice profile, recorder, face tracker,
│   │   │                    #   hand tracker, sign classifier, eye tracker,
│   │   │                    #   one-euro filter, gemini client, cn util
│   │   ├── components/      #   Layout, Sidebar, ParentAvatar, FeatureCard, etc.
│   │   ├── pages/           #   Home, VoiceSetup, EyeBridge, SignSpeak, EarBridge,
│   │   │                    #   StoryWeaver, CalmCue, GuardianWatch, LifeGuardian,
│   │   │                    #   ParentBridge, ChildVoice
│   │   ├── App.tsx          #   Router + Layout
│   │   ├── main.tsx
│   │   └── index.css        #   Tailwind v4 + Claude-style design tokens
│   ├── index.html           #   Loads MediaPipe + WebGazer scripts
│   ├── vite.config.ts
│   └── package.json
│
├── nurturelink_backend/     # Backend  — FastAPI + PyTorch + Transformers
│   ├── main.py              #   Routes: /voice/*, /analyze/*, /story/generate
│   ├── voice_service.py     #   14-voice catalogue + acoustic voice matching + Edge TTS
│   ├── cry_classifier.py    #   Hybrid AST + acoustic feature pipeline (5 categories)
│   ├── gemma_analyzer.py    #   Gemma 4 wrapper — parent-bridge, sign, child-voice, story
│   ├── safe_json.py         #   Robust JSON parsing for LLM output
│   ├── cry_samples/         #   Labeled donateacry samples for local testing
│   ├── requirements.txt
│   └── test_*.py            #   Smoke tests and one-off integration scripts
│
├── cry_demo.html            # Standalone single-file demo of Parent Bridge
│                            # (Tailwind via CDN — open in any browser, no build)
│
├── README.md                # ← you are here
├── LICENSE                  # MIT
└── .gitignore
```

---

## Quick start

### Prerequisites
- **Windows / macOS / Linux** with a webcam + microphone
- **Python 3.10+** (3.12 tested)
- **Node 20+** (24 tested)
- ~10 GB free disk for the Gemma 4 E2B model on first run
- A Chromium browser (Chrome / Edge) for full feature support

### 1. Run the backend

```bash
cd nurturelink_backend

# Create venv + install deps
python -m venv .venv
.venv\Scripts\activate              # Windows
# source .venv/bin/activate          # macOS / Linux
pip install -r requirements.txt

# Optionally pre-download the Gemma model on first run.
# Otherwise it'll lazy-load on the first /analyze/sign or /story/generate call.

# Start the server
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The first multimodal call downloads `google/gemma-3n-E2B-it` (~5 GB with `float16` + `low_cpu_mem_usage`). It takes a few minutes the first time and stays cached afterwards.

### 2. Run the frontend

```bash
cd nurturelink_web
npm install
npm run dev
```

Open **http://localhost:5173/** in Chrome or Edge.

### 3. Try it

1. **Voice Setup** in the sidebar → record 10 s of your voice → take a selfie → save.
2. **GuardianWatch** → enter a Gemini API key (free, from [Google AI Studio](https://aistudio.google.com/app/apikey)) → click Start watching → hold up something risky → watch the AI speak in your own voice.
3. **EyeBridge** → click *Use eyes* → look at tiles → speak phrases.
4. **StoryWeaver** → pick a theme → Gemma + Pollinations generate a 4-scene illustrated bedtime story in your voice.

### Standalone cry demo (no setup)

Open `cry_demo.html` directly in your browser. Single self-contained HTML file. It will hit the backend at `127.0.0.1:8000` for the classifier. Has both an **Accuracy mode** (real Gemma, ~1-2 min per call) and a **Demo mode** (real cry classifier + synthesized Gemma reply for video pacing, ~8 s per call).

---

## Tech stack

### Frontend
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** with Claude.ai-inspired design tokens
- **React Router** for navigation
- **Lucide icons**
- **Web APIs**: MediaRecorder, getUserMedia, Web Audio AnalyserNode, Web Speech, Geolocation, HTML5 Audio
- **MediaPipe Tasks Vision** — face landmarker (478 pts + iris)
- **MediaPipe Hands** — 21-point hand landmarks (via CDN)
- **WebGazer.js** — fallback webcam eye-tracking
- **One-Euro filter** — adapted from [tanhanwei/Nutshell](https://github.com/tanhanwei/Nutshell) (MIT)
- **sign.mt** — ASL avatar iframe embed
- **Pollinations.ai** — free image generation (default model) for StoryWeaver illustrations
- **Gemini 2.5 Flash REST API** — direct from browser for GuardianWatch + AI gaze (user-supplied key, BYOK)

### Backend
- **FastAPI** + **Uvicorn**
- **PyTorch** + **HuggingFace Transformers**
- **google/gemma-3n-E2B-it** — multimodal text + image + audio (float16, low_cpu_mem_usage)
- **MIT/ast-finetuned-audioset-10-10-0.4593** — Audio Spectrogram Transformer for cry detection
- **Custom acoustic feature classifier** — pitch, ZCR, rolloff, MFCC on labeled donateacry samples
- **Microsoft Edge TTS** (`edge-tts`) — 14 curated neural voices, free, no key
- **librosa** + **soundfile** + **pydub** + **imageio-ffmpeg** — audio processing
- **Pillow** — image handling

### Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /health` | liveness |
| `GET /voice/profiles` | list of 14 curated voices |
| `POST /voice/match` | analyze a recording → recommend the closest voice |
| `POST /voice/speak` | text + voice_id → MP3 in that voice |
| `POST /analyze/cry-only` | audio → cry type + confidence |
| `POST /analyze/parent-bridge` | audio + image + context → full diagnosis |
| `POST /analyze/sign` | image of hand → recognized sign word |
| `POST /analyze/child-voice` | image → visual emotional check-in |
| `POST /story/generate` | age + theme → 4-scene illustrated bedtime story |

---

## Demo paths

### 30-second elevator pitch
**Voice Setup** → **GuardianWatch with scissors** → **EyeBridge dwell + Show in ASL** → **StoryWeaver narrated scene**.

### Full 4-minute pitch
1. Voice Setup (30 s)
2. GuardianWatch — child mode hazard + escalation overlay (90 s)
3. EyeBridge — head tracking + ASL avatar (45 s)
4. SignSpeak — real-time MediaPipe hands (30 s)
5. StoryWeaver — Gemma + watercolor (45 s)
6. Close (10 s)

### Just the cry demo
Open `cry_demo.html` → enable Demo mode → press record → 8 seconds end to end.

---

## Credits & inspiration

- **[LifeGuardianAI](https://github.com/Ariya-rithvik/LifeGuardianAI)** — the standalone sister project this borrows hazard-monitoring concepts from
- **[tanhanwei/Nutshell](https://github.com/tanhanwei/Nutshell)** — head-pose tracking + One-Euro filter ([MIT](https://opensource.org/licenses/MIT))
- **[sign.mt](https://sign.mt) / [github.com/sign/translate](https://github.com/sign/translate)** — open research on sign-language translation, used as the embedded ASL avatar
- **[donateacry corpus](https://github.com/gveres/donateacry-corpus)** — labeled baby cry recordings, used as the training/eval set for our cry classifier
- **[Pollinations.ai](https://pollinations.ai/)** — free image generation API, used for StoryWeaver scene illustrations
- **MediaPipe** team at Google — Hands and Face Landmarker
- **WebGazer.js** — Brown University HCI, browser-based eye tracking research
- **HuggingFace** — model hub for AST and Gemma
- **Microsoft Edge TTS** — free natural neural voice synthesis

---

## Safety & scope

NurtureLink is **assistive**, not medical. It does not diagnose disease, detect abuse, or replace professional care. The cry classifier is a research-grade pattern matcher with a 5-class output. GuardianWatch is an extra set of eyes for the seconds you can't be in the room — not a substitute for adult supervision.

When AI confidence is low, the app says so. When a recording is too quiet, the pipeline aborts with a clear message rather than guessing.

---

## License

MIT — see [LICENSE](./LICENSE).

---

Built for a Gemma hackathon, May 2026.
