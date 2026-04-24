# मित्र — Backend

Pure-voice Hindi AI companion for kids. 100% free stack.

## Stack

| Layer | Service | Free Tier |
|-------|---------|-----------|
| STT   | Groq — Whisper large-v3 | 28,000 audio seconds/day |
| LLM   | Google Gemini 2.5 Flash | Generous free tier |
| TTS   | edge-tts — Microsoft Swara Neural | Unlimited (no key needed) |
| Host  | Railway.app | 500 hrs/month |

## Get API Keys

- **Groq** (free): https://console.groq.com → API Keys
- **Gemini** (free): https://aistudio.google.com/app/apikey

edge-tts needs no API key — it uses Microsoft's public TTS service.

## Local Setup

```bash
pip install -r requirements.txt

export GEMINI_API_KEY=your_gemini_key
export GROQ_API_KEY=your_groq_key

uvicorn main:app --reload --port 8000
```

Test it:
```bash
curl -X POST http://localhost:8000/voice \
  -F "audio=@test.wav" \
  -F 'history=[]'
```

## Deploy on Railway

1. Push this folder to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Add env vars: `GEMINI_API_KEY`, `GROQ_API_KEY`
4. Copy the Railway URL → paste into App.js `BACKEND_URL`

## API

### POST /voice
Multipart form:
- `audio` — wav or m4a audio file
- `history` — JSON array of `{role, content}` conversation turns

Response:
```json
{
  "transcription": "यार आज बहुत मज़ा आया",
  "reply_text":    "अरे वाह! क्या हुआ बताओ यार?",
  "audio_base64":  "<mp3 base64>",
  "audio_format":  "mp3"
}
```

### GET /health
Returns service + model status.

## TTS Voice Options

Edit `TTS_VOICE` in main.py:
- `hi-IN-SwaraNeural` — female, warm (default)
- `hi-IN-MadhurNeural` — male, friendly
