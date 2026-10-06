let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let resumeBound = false;

const MASTER_VOLUME = 1.0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  try {
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;

    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;

    compressor.connect(master);
    master.connect(ctx.destination);
  } catch {
    compressor = null;
    master = null;
  }

  if (!resumeBound) {
    resumeBound = true;
    const resume = () => {
      const c = ctx;
      if (c && c.state === "suspended") {
        void c.resume().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", resume, { passive: true });
    document.addEventListener("keydown", resume);
    document.addEventListener("touchstart", resume, { passive: true });
  }
  return ctx;
}

function unlockAudio(): void {
  const audioContext = getCtx();
  if (audioContext?.state === "suspended") {
    void audioContext.resume().catch(() => {});
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlockAudio, {
    once: true,
    passive: true,
  });
  document.addEventListener("keydown", unlockAudio, { once: true });
  document.addEventListener("touchstart", unlockAudio, {
    once: true,
    passive: true,
  });
}

function outputNode(c: AudioContext): AudioNode {
  return compressor ?? c.destination;
}

type ToneSpec = {
  type?: OscillatorType;
  freqStart: number;
  freqEnd?: number;
  duration: number;
  gain?: number;
  delay?: number;
};

function playTone(c: AudioContext, spec: ToneSpec) {
  const now = c.currentTime + (spec.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(spec.freqStart, now);
  if (spec.freqEnd !== undefined && spec.freqEnd !== spec.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, spec.freqEnd),
      now + spec.duration,
    );
  }
  const gain = spec.gain ?? 0.4;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
  osc.connect(g);
  g.connect(outputNode(c));
  osc.start(now);
  osc.stop(now + spec.duration + 0.05);
}

function playSynthSend() {
  const c = getCtx();
  if (!c) return;
  const play = () => {
    if (c.state !== "running") return;
    playTone(c, {
      type: "sine",
      freqStart: 720,
      freqEnd: 1180,
      duration: 0.09,
      gain: 0.5,
    });
    playTone(c, {
      type: "sine",
      freqStart: 1180,
      freqEnd: 1560,
      duration: 0.07,
      gain: 0.32,
      delay: 0.05,
    });
  };
  if (c.state === "running") play();
  else void c.resume().then(play).catch(() => {});
}

function playSynthReceive() {
  const c = getCtx();
  if (!c) return;
  const play = () => {
    if (c.state !== "running") return;
    playTone(c, {
      type: "sine",
      freqStart: 880,
      freqEnd: 880,
      duration: 0.18,
      gain: 0.55,
    });
    playTone(c, {
      type: "sine",
      freqStart: 1320,
      freqEnd: 1320,
      duration: 0.22,
      gain: 0.38,
      delay: 0.11,
    });
  };
  if (c.state === "running") play();
  else void c.resume().then(play).catch(() => {});
}

type SoundKey = "sent" | "received";

const SOUND_URLS: Record<SoundKey, string> = {
  sent: "/sounds/sent.mp3",
  received: "/sounds/received.mp3",
};

const audioCache = new Map<SoundKey, HTMLAudioElement>();
const failedSounds = new Set<SoundKey>();
const playedSystemSoundIds = new Set<string>();
const systemSoundCorrelationTimes = new Map<string, number>();

function preloadSounds() {
  if (typeof window === "undefined") return;
  (Object.keys(SOUND_URLS) as SoundKey[]).forEach((key) => {
    if (audioCache.has(key) || failedSounds.has(key)) return;
    try {
      const el = new Audio();
      el.preload = "auto";
      el.volume = 1;
      el.addEventListener("error", () => {
        failedSounds.add(key);
      });
      el.src = SOUND_URLS[key];
      el.load();
      audioCache.set(key, el);
    } catch {
      failedSounds.add(key);
    }
  });
}

if (typeof window !== "undefined") {
  preloadSounds();
}

function tryPlayAudio(key: SoundKey, onFailure: () => void): boolean {
  if (failedSounds.has(key)) return false;
  const el = audioCache.get(key);
  if (!el) return false;
  try {
    el.currentTime = 0;
  } catch {}
  try {
    const p = el.play();
    if (p && typeof p.catch === "function") {
      void p.catch(onFailure);
    }
    return true;
  } catch {
    return false;
  }
}

export function playSendSound() {
  if (!tryPlayAudio("sent", playSynthSend)) playSynthSend();
}

export function playReceiveSound() {
  if (!getCtx()) {
    if (tryPlayAudio("received", playSynthReceive)) return;
  }
  playSynthReceive();
}

export function playSystemReceiveSoundOnce(
  id: string,
  correlationKey?: string,
): void {
  if (!id || playedSystemSoundIds.has(id)) return;
  playedSystemSoundIds.add(id);
  if (playedSystemSoundIds.size > 200) {
    const oldestId = playedSystemSoundIds.values().next().value;
    if (oldestId) playedSystemSoundIds.delete(oldestId);
  }
  if (correlationKey) {
    const now = Date.now();
    const previousTime = systemSoundCorrelationTimes.get(correlationKey);
    systemSoundCorrelationTimes.set(correlationKey, now);
    if (systemSoundCorrelationTimes.size > 200) {
      const oldestKey = systemSoundCorrelationTimes.keys().next().value;
      if (oldestKey) systemSoundCorrelationTimes.delete(oldestKey);
    }
    if (previousTime !== undefined && now - previousTime < 2_000) return;
  }
  playReceiveSound();
}
