# Remotion Video Ads

This skill covers end-to-end production of social media video ads using Remotion, OpenAI TTS, and Whisper for audio-visual sync. Reference the existing ads as canonical examples before building new ones.

---

## File Layout

```
remotion/
  index.ts                        # entry point (imports Root)
  Root.tsx                        # <Composition> registry
  ResponsibleParent.tsx           # 16:9 YouTube (900f = 30s)
  ResponsibleParent9x16.tsx       # 9:16 Instagram/Reels/TikTok (810f = 27s)

public/ads/
  narration-youtube.mp3           # TTS audio for 16:9
  narration-9x16.mp3              # TTS audio for 9:16
  responsible-youtube.mp4         # rendered 16:9 output
  responsible-9x16.mp4            # rendered 9:16 output

app/responsible/page.tsx          # landing page that embeds both videos
```

---

## Step 1 — Write the script

Keep it tight. These are the word counts that worked:

| Format | Duration | Target words |
|---|---|---|
| 9:16 Instagram/Reels | 27s | ~55 words |
| 16:9 YouTube pre-roll | 30s | ~62 words |

**9:16 script (example — "responsible parent" campaign):**
> "If something happened to you tomorrow, could your family find everything? [YourBrand] gets you organized. Link your accounts, your bank, your 401k, net worth in real time. Upload your will, your deeds, your policies — encrypted and findable. Set who sees what. Spouse sees everything. Attorney sees legal. Accountant sees finances. You've done the hard part. Now finish the plan."

The opening hook ("If something happened to you tomorrow…") is the most important line. It has to create immediate emotional resonance for the responsible parent persona.

---

## Step 2 — Generate TTS with OpenAI

```ts
// Run inline (do not create a reusable script — do it live)
import OpenAI from 'openai'
import fs from 'fs'

const openai = new OpenAI()
const mp3 = await openai.audio.speech.create({
  model: 'tts-1-hd',
  voice: 'onyx',          // deep, authoritative — matches the brand
  input: SCRIPT,
})
const buffer = Buffer.from(await mp3.arrayBuffer())
fs.writeFileSync('public/ads/narration-9x16.mp3', buffer)
```

**Critical:** `tts-1-hd` outputs at **160kbps**, not 320kbps. Never estimate duration from file size + assumed bitrate. Always verify with Whisper (Step 3).

---

## Step 3 — Whisper transcription for exact timing

Feed the MP3 back to Whisper with `verbose_json` to get segment-level timestamps:

```ts
const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream('public/ads/narration-9x16.mp3'),
  model: 'whisper-1',
  response_format: 'verbose_json',
  timestamp_granularities: ['segment'],
})

// Convert timestamps → frames at 30fps
transcription.segments.forEach(seg => {
  console.log(`"${seg.text.trim()}" → start=${Math.round(seg.start * 30)}f end=${Math.round(seg.end * 30)}f`)
})
```

Map each spoken phrase to the scene it belongs in. Use the **end frame of the last word in a phrase** as the scene cut point — don't cut mid-word.

**Example output for 9x16:**
```
"If something happened to you tomorrow..." → 0f–122f    → Scene1
"[YourBrand] gets you organized."          → 122f–182f  → Scene2
"Link your accounts..."                    → 182f–307f  → Scene3 / Accounts
"Upload your will..."                      → 307f–442f  → Scene3 / Documents
"Set who sees what..."                     → 442f–624f  → Scene3 / Access
"You've done the hard part..."             → 624f–666f  → Scene4 (mid-CTA)
"Now finish the plan."                     → 666f–810f  → EndCard
```

---

## Step 4 — Remotion composition structure

### Composition registration (`Root.tsx`)

```tsx
<Composition
  id="ResponsibleParent-9x16"
  component={ResponsibleParent9x16}
  durationInFrames={810}   // actual audio duration in frames, rounded up
  fps={30}
  width={1080}
  height={1920}
/>
```

Set `durationInFrames` to match the actual audio length (Whisper's `duration` field × 30, rounded up to a clean number).

### Audio placement

Put `<Audio>` at the **composition level** (outside all `<Sequence>`s):

```tsx
export function ResponsibleParent9x16() {
  const frame = useCurrentFrame()
  return (
    <>
      <Audio src={staticFile('ads/narration-9x16.mp3')} />
      <Sequence from={0}   durationInFrames={122}><Scene1 /></Sequence>
      <Sequence from={122} durationInFrames={60}> <Scene2 /></Sequence>
      {/* ... */}
    </>
  )
}
```

### CRITICAL: `useCurrentFrame()` resets to 0 inside `<Sequence>`

Any component that uses `useCurrentFrame()` for composition-level animation (e.g. `FloatingCards` that should persist across scene cuts) **must live outside all `<Sequence>` wrappers**, at the top level of the composition. If you put it inside a `<Sequence>`, `frame` resets to 0 at the Sequence start — animations restart on every scene cut.

```tsx
// WRONG — FloatingCards restarts every scene
<Sequence from={0} durationInFrames={182}><FloatingCards /><Scene1 /></Sequence>

// CORRECT — FloatingCards persists at composition level
{frame < 182 && <FloatingCards opacity={frame < 122 ? 1 : 0.35} />}
<Sequence from={0}   durationInFrames={122}><Scene1 /></Sequence>
<Sequence from={122} durationInFrames={60}> <Scene2 /></Sequence>
```

---

## Step 5 — Colors: NEVER use oklch with hex-alpha appending

Remotion renders in a headless Chromium that handles CSS well, but **string interpolation of oklch values with hex-alpha suffixes produces invalid CSS**:

```ts
// WRONG — produces "oklch(0.78 0.18 76)12" which is invalid
const accentColor = 'oklch(0.78 0.18 76)'
background: `${accentColor}12`   // ← entire property ignored → black background

// CORRECT — use hex everywhere in Remotion components
const W_GREEN  = '#22c55e'
const W_NAVY   = '#0f172a'
background: `${W_GREEN}20`       // ← valid hex-alpha
```

For oklch colors, convert using Node.js `culori` or just pick the nearest hex manually. The background gradient in Scene1/Scene2 can use oklch directly in a `background` string (not appended), but any pattern like `${color}XX` must use hex.

**Example brand hex tokens (define your own palette):**
```ts
const BRAND_NAVY   = '#0f172a'
const BRAND_GREEN  = '#22c55e'
const BRAND_BLUE   = '#3b82f6'
const BRAND_AMBER  = '#f59e0b'
const BRAND_ROSE   = '#f43f5e'
const BRAND_BORDER = '#1e293b'
const BRAND_TEXT   = '#f1f5f9'
const BRAND_MUTED  = '#94a3b8'
const BRAND_BG     = '#0f172a'
```

---

## Step 6 — Visual design patterns that worked

### 9:16 format (1080×1920)

- **Scene1 (hook):** Full-screen dark bg, large serif headline, floating account/document cards in background
- **Scene2 (transition):** Checklist with checkmark animation, brief pause
- **Scene3 (features):** `FeatureScene9x16` — eyebrow label + bold headline at top, compact widget card below. Three sub-scenes via nested `<Sequence>`. No browser chrome, no sidebar — just the content rows in a white rounded card.
- **MidCTABadge:** Persistent pill at bottom (`from={182}`) showing "Start for free → your-app.com"
- **EndCard:** Typewriter URL animation + pulsing CTA button

Widget components (`AccountsWidget`, `DocsWidget`, `AccessWidget`) show 3-4 animated rows of real-looking app data. Rows animate in with `spring()` staggered by index.

### 16:9 format (1920×1080)

- **FeatureScene layout:** `flexDirection: 'row'` (explicit! forgetting this causes vertical stacking), copy on left (`width:580`), app mockup on right (`flex:1, justifyContent:'flex-end'`)
- **AppShell:** Browser chrome + sidebar + main content area at `width:840, height:500`
- **Background:** Dark gradient, subtle grid lines via repeating-linear-gradient
- **Scene1:** Hook headline full-screen (no mockup)
- **Scene2:** Brand intro + tagline
- **FeatureScenes:** One per major product area (Accounts, Documents, Access, Contacts)
- **EndCard:** URL + CTA

---

## Step 7 — Rendering

```bash
# 9:16
npx remotion render remotion/index.ts ResponsibleParent-9x16 public/ads/responsible-9x16.mp4 --overwrite

# 16:9
npx remotion render remotion/index.ts ResponsibleParent-YouTube public/ads/responsible-youtube.mp4 --overwrite
```

Render times: ~2–3 minutes per video on M-series Mac. Output sizes: 5–8 MB typical.

---

## Step 8 — Landing page embedding

### 9:16 in phone mockup (`AdVideoSection`)

- Embed with `autoPlay muted loop playsInline` — browsers require `muted` for autoplay
- Add a tap-to-unmute toggle button overlaid on the phone frame (bottom-right corner)
- State: `const [muted, setMuted] = useState(true)` + `ref` on the `<video>` element

```tsx
<video ref={videoRef} src="/ads/responsible-9x16.mp4" autoPlay muted={muted} loop playsInline ... />
<button onClick={() => setMuted(m => !m)}>
  {muted ? 'Tap for sound' : 'Sound on'}
</button>
```

### 16:9 in `YouTubeAdSection`

- Embed with `controls playsInline` — no autoplay, user initiates
- Wrap in `aspectRatio: '16/9'` container with intersection observer for fade-in

---

## Campaign briefs

Five campaign concepts live in `marketing/briefs/` on the `ads-landing` branch:
- `panic-moment.md` — "If something happened to you tomorrow…"
- `quiz.md` — interactive quiz format
- `doc-chaos.md` — document disorganization pain
- `responsible-parent.md` — the one we built
- `ai-assistant.md` — AI-powered wealth planning

---

## Key lessons learned

| Lesson | Detail |
|---|---|
| TTS bitrate | OpenAI `tts-1-hd` outputs 160kbps, not 320kbps. Never estimate duration from file size. |
| Always Whisper | After generating TTS, always run Whisper to get exact segment timestamps before hardcoding frame numbers. |
| oklch in Remotion | Safe in `background:` string values, but NEVER append hex-alpha to an oklch string. |
| `useCurrentFrame` scope | Resets to 0 inside each `<Sequence>`. Composition-wide animations must live outside all Sequences. |
| `flexDirection` | Always set explicitly in Remotion inline styles — don't rely on default. Missing it caused 16:9 feature scenes to stack vertically. |
| Script length | ~55 words = ~24s for `onyx` voice. Leave 3s of buffer vs. composition duration. |
| Phone mockup column | Use `flex-[1]` not a fixed width; use `max-w-[210px]` on the phone frame itself. |
