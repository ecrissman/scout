# Scout — AI Features Reference

All AI features use `claude-haiku-4-5-20251001`. All are gated by the `aiEnabled` toggle (stored in `localStorage` as `scout-ai-enabled`).

---

## 1. Daily Photography Prompt

**When it runs:** Auto-triggers once per day when you view today's date without a photo. Cached in `localStorage` as `scout-prompt-${todayStr}` so it only generates once.

**Frontend call:** `getTodayPrompt(sel, coords?)` → `src/api.js:66`  
**Backend handler:** `GET /api/ai/prompt/[date]` → `functions/api/[[route]].js:368`  
**Max tokens:** 100

### Inputs fed to the prompt

| Input | Source | Notes |
|-------|--------|-------|
| Time of day | Server clock (Pacific TZ) | night / morning / afternoon / evening |
| Weather | Open-Meteo API (live) | Temperature °F + WMO code mapped to description |
| Weekly theme | Current week's theme from R2 | Appended as context so prompt aligns with theme |
| Recent captions | Last 7 days of photo metadata | Prevents repeating similar prompts |
| Coordinates | Client query string (`?lat=&lon=`) | Optional; falls back to Seattle (47.6, -122.3) |

### System prompt

```
You are Scout, a charming photography mentor for a daily photo journaler.
You're encouraging, direct, and a little campy — like a creative friend who
happens to be great at this.

Current conditions:
- Time: ${timeOfDay}
- Weather: ${weatherDesc}${themeContext}

Recent journal entries (date: caption):
${recentContext}

Write one daily photography prompt. Rules:
- One sentence only. Hard limit: 120 characters.
- Imperative or present tense ("Find…" / "Shoot…" / "Look for…")
- Name one concrete subject or situation. No vague words like "something interesting."
- No subordinate clauses. No commas if you can help it.
- No technique explanation. Trust the photographer.
- Must work anywhere — city, suburb, indoors, outdoors.
- Tone: confident, a little playful. Not a lesson. More like a dare.

Good examples: "Find a long shadow and walk toward it." / "Shoot what you'd normally walk past." / "Chase the shadow, not the light."

Respond with the prompt only. No quotes, no explanation.
```

### Output

Single sentence, ≤120 characters. Displayed in the "TODAY'S SHOT" section when there's no photo for today.

---

## 2. Weekly Theme

**When it runs:** On page load. Generated once per week and cached in R2 at `themes/${weekKey}.json`. Next week's theme is also pre-fetched (and deduped against the current week's).

**Frontend calls:** `getTheme()` / `getNextWeekTheme()` → `src/api.js:50`  
**Backend handler:** `GET /api/theme/current?date=...` → `functions/api/[[route]].js:317`  
**Max tokens:** 120

### Inputs fed to the prompt

| Input | Source | Notes |
|-------|--------|-------|
| Week key | Sunday-based ISO week calc | Determines cache key in R2 |
| Current theme | R2 cache | Only when generating next week's — appended as avoidance clause |

### System prompt

```
Generate a weekly photography theme for Scout, a daily photo-a-day app.
Respond with JSON only, no markdown.

{"theme":"2–4 word evocative title","description":"one sentence. a frame for
how to see this week — not what to shoot."}

Voice: direct, slightly poetic, never instructional. The description names a
way of looking, not a technique.

Good examples:
{"theme":"Borrowed Light","description":"This week, nothing lit directly —
only light that passed through or bounced off something first."}
{"theme":"The In-Between","description":"The pause before and after. The
space between two things. The moment that isn't quite either."}
{"theme":"Made by Hand","description":"Evidence of a person's touch — worn
edges, adjusted angles, things arranged just so."}
{"theme":"What Persists","description":"Find what hasn't moved, changed, or
been claimed. The things that are simply still there."}

Bad (too instructional): {"theme":"Texture Week","description":"Look for
rough, smooth, and layered surfaces in your environment and photograph the
details."}
Bad (too vague): {"theme":"Everyday Beauty","description":"Find the beauty
in ordinary moments around you this week."}

Respond with JSON only. One theme object.${avoidClause}
```

**`${avoidClause}` when generating next week's theme:**
```
IMPORTANT: Do NOT use "${current.theme}" — that is this week's theme.
Generate something distinctly different.
```

### Output

JSON object:
```json
{ "theme": "Borrowed Light", "description": "This week, nothing lit directly — only light that passed through or bounced off something first.", "week": "2026-W15" }
```

Displayed as the "THEME" card in the Today tab. Title always visible; description expands on toggle. Next week's theme shown if it differs from current.

---

## 3. Caption Suggestion

**When it runs:** Manual only — user taps the "Suggest" button on a day with a photo.

**Frontend call:** `getCaptionSuggestion(date)` → `src/api.js:74`  
**Backend handler:** `POST /api/ai/caption/[date]` → `functions/api/[[route]].js:444`  
**Max tokens:** 60

### Inputs fed to the prompt

| Input | Source | Notes |
|-------|--------|-------|
| Photo image | R2: `photos/${uid}/${date}/full.jpg` | Full-resolution, base64-encoded |
| Image format | Magic byte detection | JPEG / PNG / WebP auto-detected |

### Prompt (user message — vision)

```
Write one caption for this photo. One sentence. Specific to what's in the
image — a detail, a feeling, a fact. No hashtags. No generic descriptions.
No "a moment of" or "capturing the". Write like a photographer, not a
copywriter.
```

### Output

Single sentence caption. Shown in an overlay — user can accept (saves to metadata) or dismiss.

---

## 4. Photo Feedback

**When it runs:** Auto-triggers immediately after a photo upload (if `aiEnabled`). Can also be re-requested manually.

**Frontend call:** `getFeedback(date)` → `src/api.js:102`  
**Backend handler:** `POST /api/ai/feedback/[date]` → `functions/api/[[route]].js:271`  
**Max tokens:** 200

### Inputs fed to the prompt

| Input | Source | Notes |
|-------|--------|-------|
| Photo image | R2: `photos/${uid}/${date}/full.jpg` | Full-resolution, base64-encoded |
| Image format | Magic byte detection | JPEG / PNG / WebP auto-detected |

### System prompt

```
You are Scout — a photography mentor. Warm, direct, a little campy. You
give real feedback, not hollow praise.

In 2–3 sentences: name one specific strength (light, composition, moment,
or texture), then one concrete suggestion. No title, no preamble. Reference
only what's visible. Never say "amazing", "beautiful", "capture", or
"journey". Sound like a friend who knows photography, not an AI writing a
report.
```

### Output

2–3 sentences. Displayed as a collapsible "Scout's take" card on the day detail view. Auto-expands on first load after upload. Persisted in photo metadata (`meta.json`) so it doesn't regenerate on revisit.

---

## 5. Photography Tips / Skills

**Not AI-generated** — this is a static curated list.

**Source:** `src/skills.js`  
**Function:** `getSkill(dateStr)` — deterministic, based on day-of-year mod 54

Returns a new tip each day from a fixed rotation of 52 photography concepts. The cycle is based on day-of-year mod 52, so every day of the year shows a different tip before repeating.

Full list (name + full tip text):

1. **Rule of Thirds** — Turn on your camera's grid overlay. Place your subject at one of the four intersection points instead of the center. Shoot both ways and compare.
2. **Golden Hour Timing** — Open a sunrise/sunset app and find today's golden hour window. Set an alarm. Show up five minutes early and shoot until the light is gone.
3. **Leading Lines** — Find a line — a road, fence, railing, or shadow — that starts near the camera and points toward your subject. Position yourself so that line enters the frame from a corner.
4. **Tap to Focus** — Don't let your phone decide what's sharp. Tap the exact thing you want in focus before shooting. For even more control, tap then drag the sun icon up or down to set exposure separately.
5. **Remove One Thing** — Before you shoot, look at your frame and find one distracting element — a sign, a trash can, a bright patch of sky. Move your feet until it's gone.
6. **Expose for the Background** — To create a silhouette, point your camera at the brightest part of the scene and lock exposure there. Your subject will go dark. On a phone, tap the bright area. On a camera, use spot metering.
7. **Door as Frame** — Stand inside a doorway, arch, or window and photograph your subject through it. The frame around your subject creates instant depth and draws the eye inward.
8. **Find the Axis** — For symmetry, your camera needs to be exactly level and centered. Use your grid lines. Even a few degrees off will make the symmetry feel accidental instead of intentional.
9. **Add a Foreground** — Before you shoot a wide scene, find something to place in the bottom third of the frame — a rock, a flower, a puddle. It gives the eye somewhere to enter.
10. **Change the Light Angle** — Walk around your subject before you shoot. Notice how side light creates shadow and texture, front light flattens, and back light creates a glow or rim. Choose the angle that does what you want.
11. **Slow Your Shutter for Water** — To make water silky, you need 1/4 second or slower. Find a shutter priority mode (Tv or S on most cameras) or use your phone's long exposure mode at dusk when light is low enough.
12. **Set ISO Before You Shoot** — In good daylight, set ISO 100–200. Indoors or at dusk, try ISO 800–1600. Grain at high ISO is texture — underexposure in trying to avoid it is worse than the grain itself.
13. **Compare Morning and Afternoon** — Photograph the same subject or location twice today — once in the morning and once in the afternoon. Put the two images side by side. The difference is color temperature.
14. **Fill the Frame with Pattern** — Find something that repeats — tiles, windows, leaves, shadows. Move close enough that the pattern fills the entire frame edge to edge, then look for the one thing that breaks it.
15. **Shoot the Shadow** — Find a subject casting an interesting shadow. Reposition until the shadow fills most of your frame and the object casting it is out of frame or barely visible.
16. **Get Closer** — Whatever distance feels right, halve it. Move until your subject fills the frame. Eliminate everything that isn't contributing. Shoot. Then decide if you went too far.
17. **Use Overcast Light** — On a grey day, find an open area outside — no overhead trees or awnings. The whole sky becomes a giant, even light source. Shoot portraits here. Notice the absence of harsh shadows.
18. **Side Light for Texture** — Find a textured surface — bark, concrete, brick, fabric. Position yourself so the light hits it from the side at a low angle. Shoot. Now move so light hits it straight on. Compare the difference.
19. **Put the Camera on the Ground** — Set your phone or camera flat on the ground, aim up toward your subject, and shoot. Don't look through the viewfinder — just aim and fire. Review and adjust. The perspective will surprise you.
20. **Find a Puddle** — After rain, find a puddle reflecting something interesting — a building, a light, a tree. Get low so the puddle fills the bottom half of your frame. Include just enough of the real scene above it.
21. **Show Where They Are** — For a portrait, step back until you can see the person's environment — their desk, their street, their kitchen. Let the surroundings say something about who they are without any caption.
22. **Find Complementary Colors** — Look for orange and blue, yellow and purple, or red and green in the same scene. These color pairs create natural tension. When you find one, compose so both colors have roughly equal weight in the frame.
23. **Imply Before and After** — Before you shoot, ask: what just happened here, and what's about to happen? Compose and time your shot to suggest both without showing either.
24. **Set Up a Window Portrait** — Place your subject facing a single window, about one meter back from it. Shoot from the side — between the window and your subject — so the light falls across their face. Add a white piece of paper on the shadow side to soften it.
25. **Include a Scale Reference** — When photographing something very large or very small, include a person, a hand, or a familiar object in the frame. Without context, size is invisible.
26. **Stabilize for Long Exposure** — Rest your camera or phone on a wall, railing, or bag rather than holding it. Set a 3-second timer so your tap doesn't cause blur. After dark, try 5–15 second exposures and watch light sources trace paths.
27. **Step Closer Instead of Zooming** — Optical zoom compresses a scene — distant things appear closer together. Walking closer expands the scene — nearby things loom larger than far ones. Try both and compare the relationship between foreground and background.
28. **Shoot Blue Hour** — Blue hour starts about 20 minutes after sunset and lasts roughly 10 minutes. Set up before it starts. Expose for the sky, not the foreground — let artificial lights glow against the blue. Bracket a few shots at different exposures.
29. **Find One Color in Neutral** — Look for a scene that's mostly grey, brown, or white — concrete, fog, dry grass — with one strong color in it. Compose so that color is surrounded by neutral. The isolation makes both more powerful.
30. **Pre-focus and Wait** — Find a spot where something interesting is likely to happen — a doorway, a corner, a puddle. Pre-focus on that spot. Then wait, camera ready, and press the shutter when the moment arrives rather than when you're still composing.
31. **Shoot RAW if You Can** — RAW files hold far more information than JPEGs — especially in highlights and shadows. If your camera or phone supports it, switch to RAW for a week. You'll have much more to work with when editing.
32. **Read Your Histogram** — After shooting, check your histogram — the graph of exposure. A spike hard against the right edge means blown highlights. Hard against the left means crushed shadows. Aim for a shape that stays off both edges.
33. **Adjust White Balance** — Set your camera to Daylight, Cloudy, or Shade white balance instead of Auto. Each reads the scene differently. Cloudy adds warmth. Shade adds more. Auto guesses — you can do better.
34. **Use Spot Metering** — Switch your camera's metering mode to Spot. Point the spot at the most important part of your scene — your subject's face, a bright sky — and lock exposure there before recomposing.
35. **Shoot a Sequence** — Pick one subject and shoot 10 frames of it without moving your feet — vary your framing, timing, and moment within the same position. Review all 10. The best frame is rarely the first.
36. **Separate Subject from Background** — Without using blur, try to make your subject stand out through tonal contrast — a dark subject against a light background, or vice versa. Move until the tones work before worrying about anything else.
37. **Find the Overlap** — Look for a scene where two seasons, two weathers, or two times of day are visible simultaneously. Compose so both are clearly present in the same frame.
38. **Check Your Horizon** — Before every landscape or architectural shot, check that your horizon line is level. Use your grid. A tilted horizon is almost always a mistake — and almost always fixable in 30 seconds if you catch it before you leave.
39. **Photograph the Wait** — Find someone or something in a state of pause — a person between actions, a door left ajar, a half-finished cup. Shoot before the moment resolves.
40. **Expose for Atmosphere** — In fog, mist, or haze, your camera will try to correct for the grey and overexpose. Dial in -1 stop of exposure compensation to keep the atmosphere feeling dense rather than washed out.
41. **Chase Peak Color** — Autumn color is predictable — check a foliage map for your area. Peak is often a narrower window than people expect. When you find it, shoot early morning when the light is low and colors saturate.
42. **Expose for the Light** — To render a clean silhouette, switch to spot metering and point it at the brightest area of your scene. Lock that exposure. Now reframe with your subject in the foreground. Their form goes dark.
43. **Story Without a Face** — Look for body language, posture, hands, clothing, or environment to carry the emotional weight of a portrait. Move around your subject until the story is there without the face.
44. **Balance Warm and Cool** — Interior warmth against a cool dark window or blue dusk sky creates natural contrast. Compose so both light sources are present — the warm interior glow and the cooler outside. Don't let one dominate entirely.
45. **Look for Edges of Change** — Find the boundary where something is deteriorating — paint peeling, wood splitting, rust spreading. Get close enough that the edge of decay fills the frame and becomes texture rather than damage.
46. **Expose for the Light Source** — At night, expose for whatever is glowing — a streetlight, a window, a neon sign — not for the darkness around it. Let the darkness be dark. The light sources should glow, not blow out.
47. **Position for Window Light** — Place your subject about one meter from a window, angled 45 degrees to it. The closer they are, the softer the light. The further, the harder. Move them toward or away from the window until the shadow on the far side of their face is about one stop darker than the lit side.
48. **Shoot from Hip Height** — Hold your camera at hip level and shoot without raising it to your eye. This changes your relationship to the scene and often removes self-consciousness from street shooting. Review and adjust angle as you go.
49. **Repeat a Shot Over Time** — Find a scene you can return to — a view from a window, a corner of your neighborhood. Photograph it the same way on different days, different seasons, different weather. The accumulation becomes the project.
50. **Tripod Technique** — Use a remote shutter or 2-second timer to eliminate camera shake. Expose for 10–30 seconds after dark. Moving lights trace paths; still things stay sharp; the world simplifies into what persists.
51. **Edit One Photo Carefully** — Take one image from this year and spend 20 minutes on it in any editing app. Adjust exposure, then contrast, then color. Make one deliberate decision at each step rather than sliding everything to see what happens.
52. **Print Something** — Choose one photograph from the year and order a print — even a small one. Seeing your work on paper changes how you evaluate it. Notice what holds up and what you'd do differently.

Displayed in the tips/skills sheet. No AI call — purely static content cycling by date.

---

## Summary

| Feature | Trigger | Backend | Model | Tokens | Cache |
|---------|---------|---------|-------|--------|-------|
| Daily Prompt | Auto, 1×/day (no photo) | `/api/ai/prompt/[date]` | Haiku 4.5 | 100 | `localStorage` per date |
| Weekly Theme | Auto on load | `/api/theme/current` | Haiku 4.5 | 120 | R2 per week |
| Caption Suggestion | Manual button | `/api/ai/caption/[date]` | Haiku 4.5 | 60 | None |
| Photo Feedback | Auto on upload + manual | `/api/ai/feedback/[date]` | Haiku 4.5 | 200 | `meta.json` per photo |
| Tips / Skills | Static | n/a | n/a | n/a | n/a (static) |

---

## Shared Implementation Notes

- **Image handling:** Full-resolution images sent as base64. Magic-byte detection picks the right MIME type (JPEG/PNG/WebP). Thumbnails are never sent to Claude.
- **Geolocation:** Client optionally passes `?lat=&lon=` for weather context. Falls back to Seattle if omitted.
- **Weather:** Live fetch from Open-Meteo on each prompt generation. WMO codes mapped to human-readable descriptions.
- **AI toggle:** All features respect `aiEnabled` state. When off, all AI UI elements are hidden and no API calls are made.
- **Feedback stripping:** Raw model output passes through `stripFeedback()` to remove any markdown or preamble before display.
