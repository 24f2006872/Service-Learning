import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, StatusBar, Dimensions, Easing,
} from "react-native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

// ── CONFIG — replace with your Railway URL ────────────────────────────────────
const BACKEND_URL = "https://YOUR-APP.railway.app";

const { width } = Dimensions.get("window");

const STATE = {
  IDLE:      "idle",
  LISTENING: "listening",
  THINKING:  "thinking",
  SPEAKING:  "speaking",
  ERROR:     "error",
};

const LABELS = {
  [STATE.IDLE]:      "दबाकर बात करो",
  [STATE.LISTENING]: "सुन रहा हूँ...",
  [STATE.THINKING]:  "सोच रहा हूँ...",
  [STATE.SPEAKING]:  "बोल रहा हूँ...",
  [STATE.ERROR]:     "फिर से कोशिश करो",
};

const C = {
  bg:       "#0D1117",
  surface:  "#161B22",
  accent:   "#FF6B35",
  text:     "#F0F0F0",
  muted:    "#8B949E",
  red:      "#F85149",
  green:    "#3FB950",
};

const FACE = {
  [STATE.IDLE]:      "🤖",
  [STATE.LISTENING]: "👂",
  [STATE.THINKING]:  "🤔",
  [STATE.SPEAKING]:  "😄",
  [STATE.ERROR]:     "😅",
};

const BTN_COLOR = {
  [STATE.IDLE]:      C.accent,
  [STATE.LISTENING]: C.red,
  [STATE.THINKING]:  "#333",
  [STATE.SPEAKING]:  C.green,
  [STATE.ERROR]:     C.red,
};

export default function App() {
  const [appState, setAppState] = useState(STATE.IDLE);
  const [lastWords, setLastWords] = useState("");
  const [history, setHistory]   = useState([]);

  const recordingRef = useRef(null);
  const soundRef     = useRef(null);

  // Animations
  const floatY     = useRef(new Animated.Value(0)).current;
  const ringScale1 = useRef(new Animated.Value(1)).current;
  const ringScale2 = useRef(new Animated.Value(1)).current;
  const ringOpacity= useRef(new Animated.Value(0)).current;
  const btnScale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setupAudio();
    startFloat();
    greet();
    return cleanup;
  }, []);

  useEffect(() => { animateState(appState); }, [appState]);

  // ── Audio permissions ──────────────────────────────────────────────────────
  const setupAudio = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  };

  const cleanup = async () => {
    await recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    await soundRef.current?.unloadAsync().catch(() => {});
  };

  // ── Greeting on open ──────────────────────────────────────────────────────
  const greet = () => {
    setTimeout(() => {
      Speech.speak("अरे यार! मैं मित्र हूँ। बताओ, आज कैसा रहा?", {
        language: "hi-IN",
        rate: 0.88,
        pitch: 1.05,
      });
    }, 900);
  };

  // ── Idle float animation ──────────────────────────────────────────────────
  const startFloat = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue:  7, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  };

  // ── State-based animations ────────────────────────────────────────────────
  const animateState = (s) => {
    ringScale1.stopAnimation();
    ringScale2.stopAnimation();
    ringOpacity.stopAnimation();
    btnScale.stopAnimation();

    if (s === STATE.LISTENING) {
      Animated.timing(ringOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ringScale1, { toValue: 1.7, duration: 700, useNativeDriver: true }),
        Animated.timing(ringScale1, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ringScale2, { toValue: 2.1, duration: 1100, useNativeDriver: true }),
        Animated.timing(ringScale2, { toValue: 1.0, duration: 1100, useNativeDriver: true }),
      ])).start();
    } else if (s === STATE.SPEAKING) {
      Animated.timing(ringOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }).start();
      Animated.loop(Animated.sequence([
        Animated.timing(btnScale, { toValue: 1.07, duration: 500, useNativeDriver: true }),
        Animated.timing(btnScale, { toValue: 0.95, duration: 500, useNativeDriver: true }),
      ])).start();
    } else {
      Animated.parallel([
        Animated.spring(ringScale1,  { toValue: 1, useNativeDriver: true }),
        Animated.spring(ringScale2,  { toValue: 1, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.spring(btnScale,    { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
  };

  // ── Record ────────────────────────────────────────────────────────────────
  const onPressIn = async () => {
    if (appState !== STATE.IDLE && appState !== STATE.ERROR) return;
    try {
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: {
          extension: ".wav",
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });
      await rec.startAsync();
      recordingRef.current = rec;
      setAppState(STATE.LISTENING);
    } catch (e) {
      console.error("Record start:", e);
      setAppState(STATE.ERROR);
    }
  };

  const onPressOut = async () => {
    if (appState !== STATE.LISTENING || !recordingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAppState(STATE.THINKING);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await callBackend(uri);
    } catch (e) {
      console.error("Record stop:", e);
      setAppState(STATE.ERROR);
      setTimeout(() => setAppState(STATE.IDLE), 3000);
    }
  };

  // ── Backend call ──────────────────────────────────────────────────────────
  const callBackend = async (uri) => {
    try {
      const fd = new FormData();
      fd.append("audio", { uri, type: "audio/wav", name: "recording.wav" });
      fd.append("history", JSON.stringify(history));

      const res = await fetch(`${BACKEND_URL}/voice`, {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setLastWords(data.transcription || "");
      setHistory(prev => [
        ...prev,
        { role: "user",      content: data.transcription },
        { role: "assistant", content: data.reply_text },
      ]);

      // edge-tts returns MP3
      await playBase64Audio(data.audio_base64, "audio/mp3");
    } catch (e) {
      console.error("Backend error:", e);
      setAppState(STATE.ERROR);
      Speech.speak("अरे यार, कुछ गड़बड़ हो गई! फिर से बोलो।", { language: "hi-IN" });
      setTimeout(() => setAppState(STATE.IDLE), 3000);
    }
  };

  // ── Playback ──────────────────────────────────────────────────────────────
  const playBase64Audio = async (b64, mimeType = "audio/mp3") => {
    setAppState(STATE.SPEAKING);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:${mimeType};base64,${b64}` },
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setAppState(STATE.IDLE);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (e) {
      console.error("Playback:", e);
      setAppState(STATE.IDLE);
    }
  };

  const canPress = appState === STATE.IDLE || appState === STATE.ERROR;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>मित्र</Text>
        <Text style={s.subtitle}>तुम्हारा दोस्त</Text>
      </View>

      {/* Face + Rings */}
      <View style={s.center}>
        {/* Pulse rings — visible while listening */}
        <Animated.View style={[s.ring, s.ring2, { transform: [{ scale: ringScale2 }], opacity: ringOpacity }]} />
        <Animated.View style={[s.ring, s.ring1, { transform: [{ scale: ringScale1 }], opacity: ringOpacity }]} />

        {/* Face */}
        <Animated.View style={[s.faceBg, { transform: [{ translateY: floatY }] },
          appState === STATE.LISTENING && s.faceBgRed,
          appState === STATE.SPEAKING  && s.faceBgGreen,
        ]}>
          <Text style={s.faceEmoji}>{FACE[appState]}</Text>
        </Animated.View>

        {/* Transcript bubble */}
        <View style={s.bubble}>
          {lastWords
            ? <>
                <Text style={s.bubbleLabel}>तुमने कहा:</Text>
                <Text style={s.bubbleText} numberOfLines={2}>{lastWords}</Text>
              </>
            : <Text style={s.bubbleHint}>बात करने के लिए नीचे बटन दबाओ 👇</Text>
          }
        </View>
      </View>

      {/* Mic button */}
      <View style={s.bottom}>
        <Text style={s.stateLabel}>{LABELS[appState]}</Text>

        <TouchableOpacity
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={!canPress && appState !== STATE.LISTENING}
          activeOpacity={0.85}
        >
          <Animated.View style={[
            s.micBtn,
            { backgroundColor: BTN_COLOR[appState], transform: [{ scale: btnScale }] },
          ]}>
            <Text style={s.micIcon}>
              {appState === STATE.LISTENING ? "🔴"
               : appState === STATE.THINKING  ? "⏳"
               : appState === STATE.SPEAKING  ? "🔊"
               : "🎤"}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        <Text style={s.subHint}>
          {appState === STATE.LISTENING ? "छोड़ो तो भेजेगा"
           : canPress ? "दबाकर रखो, बोलो, फिर छोड़ो" : " "}
        </Text>
      </View>
    </View>
  );
}

const FACE_SIZE = 144;
const BTN_SIZE  = 100;
const RING_BASE = FACE_SIZE + 36;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "space-between", paddingTop: 56, paddingBottom: 48 },

  header:   { alignItems: "center" },
  title:    { fontSize: 38, fontWeight: "800", color: C.text, letterSpacing: 3 },
  subtitle: { fontSize: 14, color: C.accent, fontWeight: "600", marginTop: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 36 },

  ring: { position: "absolute", borderRadius: 999, borderWidth: 1.5, borderColor: C.accent },
  ring1: { width: RING_BASE, height: RING_BASE },
  ring2: { width: RING_BASE + 64, height: RING_BASE + 64 },

  faceBg: {
    width: FACE_SIZE, height: FACE_SIZE, borderRadius: FACE_SIZE / 2,
    backgroundColor: C.surface,
    borderWidth: 2, borderColor: "#FF6B3530",
    alignItems: "center", justifyContent: "center",
    shadowColor: C.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 24, elevation: 14,
  },
  faceBgRed:   { borderColor: C.red,   shadowColor: C.red },
  faceBgGreen: { borderColor: C.green, shadowColor: C.green },
  faceEmoji: { fontSize: 68 },

  bubble: {
    maxWidth: width * 0.78, backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 0.5, borderColor: "#FF6B3525", alignItems: "center",
  },
  bubbleLabel: { fontSize: 11, color: C.accent, fontWeight: "600", marginBottom: 4 },
  bubbleText:  { fontSize: 15, color: C.text, textAlign: "center", lineHeight: 22 },
  bubbleHint:  { fontSize: 14, color: C.muted, textAlign: "center" },

  bottom:    { alignItems: "center", gap: 14 },
  stateLabel: { fontSize: 15, color: C.muted, fontWeight: "500" },
  subHint:   { fontSize: 12, color: C.muted, opacity: 0.55 },

  micBtn: {
    width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 18, elevation: 14,
  },
  micIcon: { fontSize: 42 },
});
