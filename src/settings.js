export const DEFAULTS = {
  voice: "af_heart",
  speed: 1,
  engine: "auto", // "auto" | "webgpu" | "wasm"
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const VOICES = [
  { id: "af_heart", name: "Heart", accent: "American", gender: "F", grade: "A" },
  { id: "af_bella", name: "Bella", accent: "American", gender: "F", grade: "A-" },
  { id: "af_nicole", name: "Nicole", accent: "American", gender: "F", grade: "B-" },
  { id: "af_aoede", name: "Aoede", accent: "American", gender: "F", grade: "C+" },
  { id: "af_kore", name: "Kore", accent: "American", gender: "F", grade: "C+" },
  { id: "af_sarah", name: "Sarah", accent: "American", gender: "F", grade: "C+" },
  { id: "af_alloy", name: "Alloy", accent: "American", gender: "F", grade: "C" },
  { id: "af_nova", name: "Nova", accent: "American", gender: "F", grade: "C" },
  { id: "af_sky", name: "Sky", accent: "American", gender: "F", grade: "C-" },
  { id: "am_fenrir", name: "Fenrir", accent: "American", gender: "M", grade: "C+" },
  { id: "am_michael", name: "Michael", accent: "American", gender: "M", grade: "C+" },
  { id: "am_puck", name: "Puck", accent: "American", gender: "M", grade: "C+" },
  { id: "am_echo", name: "Echo", accent: "American", gender: "M", grade: "D" },
  { id: "am_eric", name: "Eric", accent: "American", gender: "M", grade: "D" },
  { id: "am_liam", name: "Liam", accent: "American", gender: "M", grade: "D" },
  { id: "am_onyx", name: "Onyx", accent: "American", gender: "M", grade: "D" },
  { id: "bf_emma", name: "Emma", accent: "British", gender: "F", grade: "B-" },
  { id: "bf_isabella", name: "Isabella", accent: "British", gender: "F", grade: "C" },
  { id: "bm_george", name: "George", accent: "British", gender: "M", grade: "C" },
  { id: "bm_fable", name: "Fable", accent: "British", gender: "M", grade: "C" },
  { id: "bm_lewis", name: "Lewis", accent: "British", gender: "M", grade: "D+" },
  { id: "bm_daniel", name: "Daniel", accent: "British", gender: "M", grade: "D" },
];

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || "");
export const SHORTCUT_LABEL = IS_MAC ? "⌃⌘V" : "Alt+Shift+V";
