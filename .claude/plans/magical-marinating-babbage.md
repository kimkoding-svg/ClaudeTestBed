# Couple Chat Upgrade: Gender, Avatars, Dynamic Styling + Stop Bug Fix

## Context
The Couple Chat feature is built but uncommitted. Two AI personalities chat in a WhatsApp-style UI with live trait evolution. The user wants: gender support, DALL-E anime avatars, personality-driven panel styling, and a critical stop button bug fixed.

---

## STAGE 0: Fix Stop Button Bug (Critical)

**Root cause**: Race condition in `_scheduleNext()`. When stop is called while a Claude API call is in-flight:
1. `this.running = false` + `clearTimeout(this.loopTimeout)` — but timeout already fired
2. `await _generateMessage()` resolves → message still broadcasts + personality evolves
3. Only THEN does `_scheduleNext()` check `!this.running` and bail

Messages generated during the API call leak through after stop. No abort on the API call means the user waits seconds for it to "take effect."

**Fix** in `server/services/couple-engine.js`:
- Add `this.abortController` — create new `AbortController` per API call in `_generateMessage()`
- Pass `signal` to `this.client.messages.create()` so in-flight calls can be cancelled
- In `stop()`: call `this.abortController?.abort()` to kill any in-flight request
- Add `if (!this.running) return;` guard **after** `await _generateMessage()` in `_scheduleNext()` as a safety net
- In frontend `handleStop`: also close the SSE connection (`cleanupRef.current?.()`) so no stale events arrive

---

## STAGE 0.5: Fix Verbose Responses

**Problem**: Messages are way too long. `max_tokens: 300` (~225 words) is far too generous for a texting sim. Model defaults to medium-long paragraphs.

**Fix** in `server/services/couple-engine.js`:
- Reduce `max_tokens` from `300` to `150` — hard cap, forces brevity
- Rewrite MESSAGE LENGTH section in `_buildSystemPrompt()` to be more aggressive:
  - "Most messages (60%) should be 1-10 words. One-liners. Reactions. Quips."
  - "30% can be 1-2 short sentences."
  - "Only 10% should be 3+ sentences — ONLY when triggered, ranting, or info-dumping."
  - "You are TEXTING, not writing an essay. Keep it punchy."

---

## STAGE 1: Add Gender

### `server/services/couple-engine.js`
- Replace `NAMES` array with `MALE_NAMES` and `FEMALE_NAMES` pools (20 each, culturally diverse)
- In `_generatePerson()`: randomly assign `gender: 'male' | 'female'`, pick from matching name pool
- Add `gender` to person object
- Update `_buildSystemPrompt()` line ~384: include gender in character intro + partner info
- Update `_serializeProfile()`: include `gender`

### `src/couple/services/coupleApi.ts`
- Add `gender: 'male' | 'female'` to `PersonProfile` interface
- Add `avatarUrl?: string | null` (prep for Stage 2)

### `src/couple/pages/CouplePage.tsx`
- Display gender symbol (male/female) next to occupation in ProfilePanel

---

## STAGE 2: DALL-E Anime Avatars

### `server/services/avatar-generator.js` (NEW)
- Uses existing OpenAI SDK + `OPENAI_API_KEY` from .env
- `buildAvatarPrompt(person)` — constructs DALL-E prompt from gender, age, occupation, region, traits, condition, mood, interests
- `generateAvatar(person)` — calls `openai.images.generate()` with DALL-E 3, 1024x1024, standard quality, `b64_json` response format
- Returns `data:image/png;base64,...` string or `null` on failure
- Cost: ~$0.04/image, $0.08/couple

### `server/services/couple-engine.js`
- Add `avatarUrl: null` to person object in `_generatePerson()`
- Add `avatarUrl` to `_serializeProfile()`
- In `start()`: call `this._generateAvatars()` (non-blocking, after profiles broadcast)
- New `_generateAvatars()` method: generates both in parallel via `Promise.all`, broadcasts `avatar_update` SSE event when done

### `src/couple/services/coupleApi.ts`
- Add `'avatar_update'` to `CoupleSSEEvent.type` union

### `src/couple/pages/CouplePage.tsx`
- Handle `avatar_update` SSE event (update profiles)
- Avatar display: show `<img>` if `avatarUrl` exists, else pulsing emoji placeholder
- Also show small round avatar images in the WhatsApp header bar

### `index.html`
- Update CSP: add `img-src 'self' data: blob:` for base64 images
- Add `font-src https://fonts.gstatic.com` and `style-src https://fonts.googleapis.com` (for Stage 3)

---

## STAGE 3: Dynamic Personality-Driven Panel Styling

### `src/couple/utils/personalityStyle.ts` (NEW)
Core styling engine. Exports `computePanelStyle(profile) → PanelStyle` with:

**Color Palette** (derived from dominant traits + condition override):
- NPD → gold/luxe (#d4a017 accent, dark warm bg)
- Psychopath → cold steel (#6b7b8d, dark blue bg)
- Anxiety → muted lavender (#8a7b9e)
- BPD → intense violet (#c44dff)
- Bipolar → split warm/cool gradient
- High chaos (petty + unstable) → multi-color gradient
- High boldness (confident + assertive) → crimson/gold
- High warmth (friendly + empathetic) → coral/amber
- High coldness (sarcastic + low empathy) → slate/blue
- Neutral fallback → indigo

**Font Family** (based on texting style):
- `proper` → Playfair Display (serif)
- `casual` → Nunito (rounded sans)
- `dramatic` → Bebas Neue (display)
- `dry` → JetBrains Mono (monospace)
- `chaotic` → Caveat (handwritten)

**Section Backgrounds** (CSS-generated patterns):
- Traits: diagonal stripes (intensity from assertiveness)
- Mood: radial glow (intensity from mood value)
- Interests: dot pattern
- Trigger: warning stripes (amber)
- Condition: geometric pattern
- Quirk: subtle wave gradient

**Layout Variations**:
- Assertive → sharp corners (0px radius), compact padding, bold 2px borders
- Friendly → rounded (16px radius), spacious, soft borders
- Chaotic → asymmetric radii, dashed borders
- Default → moderate 8px radius

**Animation**:
- Chaotic profiles → shake/pulse animations (1s)
- Unstable → moderate pulse (2s)
- Dry/patient → no animation
- Default → subtle (3s)

### `index.html`
- Add Google Fonts: Playfair Display, Nunito, Bebas Neue, JetBrains Mono, Caveat

### `src/couple/pages/CouplePage.tsx`
- Import `computePanelStyle` in ProfilePanel
- Replace all hardcoded colors/classes with dynamic `style={{}}` from PanelStyle
- Each section div gets `backgroundImage: ps.sectionBg.xxx`
- Panel background uses `ps.bgGradient`
- Trait bars use `ps.traitBarColor(value)` instead of fixed color function
- Section headers use `ps.accentColor`
- Remove old `traitBarColor()` and `moodColor()` top-level functions

---

## Files Summary

| File | Action |
|------|--------|
| `server/services/couple-engine.js` | Fix stop bug, add gender, add avatarUrl, async DALL-E kickoff |
| `server/services/avatar-generator.js` | **NEW** — DALL-E prompt builder + image generator |
| `src/couple/services/coupleApi.ts` | Add gender, avatarUrl, avatar_update event |
| `src/couple/pages/CouplePage.tsx` | Fix stop SSE cleanup, gender display, avatar images, full dynamic styling |
| `src/couple/utils/personalityStyle.ts` | **NEW** — personality → style computation engine |
| `index.html` | CSP update, Google Fonts |

## Verification
**Note**: Backend changes require server restart (`node server`). Frontend auto-reloads via Vite.

1. Restart server, then navigate to Couple Chat from landing page
3. Verify gendered names appear with gender symbols
4. Verify emoji placeholder shows, then DALL-E avatar loads after a few seconds
5. Verify each panel has unique colors/fonts/patterns matching their personality
6. Click Stop — conversation should halt immediately (no extra messages)
7. Click New Couple — verify everything resets cleanly
8. Test without OPENAI_API_KEY — should fallback to emoji avatars gracefully
