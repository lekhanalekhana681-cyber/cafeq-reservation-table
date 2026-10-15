/**
 * Kitchen Display System (KDS) Real-Time Synchronization & Audio Alert Service
 * Provides multi-tab, cross-device event broadcasting, Web Audio synthesizer chime,
 * auto-reconnect recovery, and fullscreen controls.
 */

export type KitchenEventType =
  | "NEW_ORDER"
  | "ORDER_STATUS_CHANGED"
  | "ITEM_STATUS_CHANGED"
  | "ORDER_REJECTED"
  | "STOCK_CHANGED";

export interface KitchenEventPayload {
  type: KitchenEventType;
  payload: any;
  timestamp: number;
}

const BROADCAST_CHANNEL_NAME = "cafeq_kds_channel";
const SOUND_MUTED_KEY = "cafeq_kds_sound_muted";

// Broadcast Channel instance
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch (err) {
    console.warn("BroadcastChannel not supported or failed to initialize:", err);
  }
}

/**
 * Emit an event across all tabs, windows, and components
 */
export function emitKitchenEvent(type: KitchenEventType, payload: any): void {
  const eventData: KitchenEventPayload = {
    type,
    payload,
    timestamp: Date.now(),
  };

  // 1. Post via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(eventData);
    } catch {
      // Ignore
    }
  }

  // 2. Dispatch in current window via CustomEvent
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cafeq_kitchen_event", { detail: eventData }));

    // 3. Update localStorage heartbeat to wake up any storage-listeners
    try {
      localStorage.setItem("cafeq_kds_heartbeat", JSON.stringify(eventData));
    } catch {
      // Ignore
    }
  }
}

/**
 * Subscribe to KDS events
 */
export function subscribeToKitchenEvents(
  callback: (event: KitchenEventPayload) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  // Broadcast channel handler
  const bcHandler = (e: MessageEvent) => {
    if (e.data && e.data.type) {
      callback(e.data);
    }
  };

  // Custom event handler for same-window events
  const customHandler = (e: Event) => {
    const customEvt = e as CustomEvent<KitchenEventPayload>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };

  // Storage listener for cross-window fallback
  const storageHandler = (e: StorageEvent) => {
    if (e.key === "cafeq_kds_heartbeat" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        callback(parsed);
      } catch {
        // Ignore
      }
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", bcHandler);
  }
  window.addEventListener("cafeq_kitchen_event", customHandler);
  window.addEventListener("storage", storageHandler);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener("message", bcHandler);
    }
    window.removeEventListener("cafeq_kitchen_event", customHandler);
    window.removeEventListener("storage", storageHandler);
  };
}

// ----------------- Web Audio API Sound Synthesizer -----------------
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SOUND_MUTED_KEY) === "true";
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_MUTED_KEY, muted ? "true" : "false");
}

/**
 * Plays a pleasant double-chime ding when a new order arrives
 */
export function playNewOrderSound(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First tone (higher note 880Hz / A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.3, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Second tone (harmonic chime 1320Hz / E6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1320, now + 0.15);
    gain2.gain.setValueAtTime(0.001, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.35, now + 0.19);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.75);
  } catch (err) {
    console.warn("Could not play new order sound:", err);
  }
}

// ----------------- Fullscreen Helper -----------------
export function isFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

export async function toggleFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    if (isFullscreenActive()) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
      return false;
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if ((root as any).webkitRequestFullscreen) {
        await (root as any).webkitRequestFullscreen();
      }
      return true;
    }
  } catch (err) {
    console.warn("Fullscreen toggle failed:", err);
    return isFullscreenActive();
  }
}
