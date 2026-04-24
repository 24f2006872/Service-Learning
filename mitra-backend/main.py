import os, io, json, base64, asyncio, tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
import google.generativeai as genai
import edge_tts

# ── Config ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GROQ_API_KEY   = os.environ["GROQ_API_KEY"]

genai.configure(api_key=GEMINI_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

# Microsoft Swara Neural — best Hindi TTS voice, sounds natural and Indian
# Other options: hi-IN-MadhurNeural (male), hi-IN-SwaraNeural (female, warmer)
TTS_VOICE = "hi-IN-SwaraNeural"

SYSTEM_PROMPT = """तुम्हारा नाम "मित्र" है। तुम एक मज़ेदार, प्यारे दोस्त हो जो 8 से 14 साल के बच्चों से बात करते हो।

तुम कैसे हो:
- हमेशा खुश, उत्साहित, और energy से भरे
- बड़े भाई या दीदी जैसे — समझदार पर cool
- बच्चे की बात ध्यान से सुनते हो और उन्हें seriously लेते हो

बोलने का तरीका:
- सरल, असली हिंदी — जैसे यार से बात करते हैं
- "यार", "अरे", "सच में?", "वाह!", "हाहा", "कमाल है!", "बढ़िया!" इस्तेमाल करो
- हर जवाब 2-3 छोटे वाक्य — ज़्यादा नहीं
- जवाब के बाद एक मज़ेदार सवाल ज़रूर पूछो
- बच्चे की बात से connect करो — उनकी feeling को समझो

कभी नहीं:
- किताबी, formal, या अजीब हिंदी
- लंबे लेक्चर या advice
- boring जवाब
- Asterisks (*), hashtags (#), या कोई formatting

तुम voice से बात करते हो — जवाब naturally बोले जाने वाले हों।"""

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="मित्र — Voice AI for Kids")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── STT: Groq Whisper large-v3 ────────────────────────────────────────────────
def groq_stt(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """
    Transcribe Hindi audio using Groq's hosted Whisper large-v3.
    Groq free tier: 28,000 audio seconds / day — plenty for a pilot.
    """
    transcription = groq_client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model="whisper-large-v3",
        language="hi",                  # force Hindi — faster, more accurate
        response_format="text",
        temperature=0.0,
    )
    # When response_format="text", result is a plain string
    return transcription.strip() if isinstance(transcription, str) else transcription.text.strip()


# ── LLM: Gemini 2.5 Flash ────────────────────────────────────────────────────
def gemini_reply(user_text: str, history: list) -> str:
    """Get मित्र's reply. history is already in Gemini format."""
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )
    trimmed = history[-8:] if len(history) > 8 else history
    session  = model.start_chat(history=trimmed)
    response = session.send_message(user_text)
    text = response.text.strip()
    # Strip any stray markdown
    for ch in ["*", "#", "_", "`"]:
        text = text.replace(ch, "")
    return text


# ── TTS: edge-tts Microsoft Swara Neural ─────────────────────────────────────
async def edge_tts_synthesize(text: str) -> bytes:
    """
    Convert Hindi text to audio using edge-tts (Microsoft Azure TTS, free).
    Voice: hi-IN-SwaraNeural — warm, natural Indian Hindi female voice.
    Returns raw MP3 bytes.
    """
    communicate = edge_tts.Communicate(
        text=text,
        voice=TTS_VOICE,
        rate="-5%",     # very slightly slower — easier for kids
        pitch="+0Hz",
        volume="+0%",
    )
    audio_buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buffer.write(chunk["data"])
    audio_buffer.seek(0)
    return audio_buffer.read()


# ── Main voice endpoint ───────────────────────────────────────────────────────
@app.post("/voice")
async def voice_turn(
    audio: UploadFile = File(...),
    history: str = Form(default="[]"),
):
    """
    Full voice round-trip:
      audio (wav/m4a) + history JSON
      → { transcription, reply_text, audio_base64 (mp3) }
    """
    audio_bytes = await audio.read()
    filename    = audio.filename or "audio.wav"

    # 1. STT — Groq Whisper large-v3
    try:
        transcription = groq_stt(audio_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"STT error (Groq): {e}")

    if not transcription:
        transcription = "कुछ सुनाई नहीं दिया"

    # 2. LLM — Gemini 2.5 Flash
    try:
        history_list   = json.loads(history)
        gemini_history = [
            {
                "role":  "model" if m["role"] == "assistant" else "user",
                "parts": [m["content"]],
            }
            for m in history_list
        ]
        reply_text = gemini_reply(transcription, gemini_history)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error (Gemini): {e}")

    # 3. TTS — edge-tts Swara Neural
    try:
        audio_out = await edge_tts_synthesize(reply_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS error (edge-tts): {e}")

    audio_b64 = base64.b64encode(audio_out).decode("utf-8")

    return {
        "transcription": transcription,
        "reply_text":    reply_text,
        "audio_base64":  audio_b64,   # MP3, plays directly on Android
        "audio_format":  "mp3",
    }


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "bot":    "मित्र",
        "stt":    "groq:whisper-large-v3",
        "llm":    "gemini-2.5-flash",
        "tts":    f"edge-tts:{TTS_VOICE}",
    }

@app.get("/")
async def root():
    return {"message": "मित्र backend चल रहा है 🎙️"}
