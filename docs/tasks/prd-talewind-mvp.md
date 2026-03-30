# PRD: Talewind MVP

**File Location:** `/docs/tasks/prd-talewind-mvp.md`
**Related Files:**
- `/docs/tasks/tasks-talewind-mvp.md` — implementation task list (generated from this PRD)
- `/docs/agents/intake-agent.md` — Intake Agent system prompt + guardrails
- `/docs/agents/story-agent.md` — Story Agent system prompt + guardrails
- `/docs/agents/quiz-agent.md` — Quiz Agent system prompt + guardrails
- `/docs/agents/frontend-agent.md` — Frontend Dev Agent system prompt + guardrails
- `/docs/agents/backend-agent.md` — Backend Dev Agent system prompt + guardrails
- `/docs/agents/debugger-agent.md` — Debugger Dev Agent system prompt + guardrails

---

## 1. Introduction / Overview

Talewind is a first-grade-safe, adaptive, narrated story tutor for children ages 5–7. It generates personalized learning stories from trusted curriculum content and learns the child over time — without any model retraining.

The app is guided by a character named **Spriggle**, who carries the child through an interactive intake experience, generates narrated scene-based stories tied to approved curriculum, and adapts to each child's reading level, interests, and quiz performance across sessions.

Talewind is built for the **JavaScript AI Build-a-thon Season 2 (March 2026)** and is submitted as a production-grade hackathon entry demonstrating multi-agent orchestration, RAG-powered personalization, accessibility, and child safety as first-class concerns.

**The product anchor sentence — every feature must pass this filter:**
> A first-grade-safe adaptive story tutor that creates narrated learning stories from trusted curriculum content and learns the child over time.

---

## 2. Goals

1. Deliver a narrated, scene-based story experience that a 6-year-old can navigate independently
2. Demonstrate RAG-powered adaptation — the child's story changes because the *retrieval* changes, not the model
3. Ship accessibility as a core pillar — captions on by default, reduced motion, dyslexia-friendly font, high contrast, narration speed control
4. Enforce strict child safety — no open-ended chat, no public web retrieval, domain-locked to 3 approved subjects
5. Give parents full oversight — profile setup, curriculum upload, session summaries, accessibility preferences
6. Prove multi-agent architecture — three product agents (Intake, Story, Quiz) coordinated through Azure AI Foundry
7. Submit a working, deployed application by March 31, 2026

---

## 3. User Stories

### Child
- As a child, I want Spriggle to greet me and walk me through a fun experience so that setting up my profile feels like the beginning of a story, not a form
- As a child, I want to pick a subject I like so that my story feels like it was made for me
- As a child, I want to listen to my story read aloud so that I can follow along even if I'm still learning to read
- As a child, I want to see the words on screen while Spriggle reads so that I can follow along and learn new words
- As a child, I want to answer questions about my story so that I feel smart and accomplished
- As a child, I want to say "say it again" or "make it easier" so that I never feel stuck or lost
- As a child, I want the font to be easy to read and the screen to not flash so that learning feels calm and comfortable

### Parent
- As a parent, I want to set up my child's profile privately so that my child sees a personalized experience from the start
- As a parent, I want to upload curriculum documents so that the stories connect to what my child is actually learning in school
- As a parent, I want to see what the app has learned about my child so that I can trust what it's doing
- As a parent, I want to control accessibility settings so that the app works for my child's specific learning needs
- As a parent, I want a PIN-protected parent area so that my child cannot accidentally change settings

---

## 4. Functional Requirements

### 4.1 Magic Door Intake (Child Onboarding)

1. The system must display a full-screen animated Spriggle character on first launch
2. The system must walk the child through 4 screens: Name + Personal Exchange, Subject Choice, Reading Mode, and Story Vibe
3. Screen 1 must follow the Introduction Exchange flow — Spriggle speaks first, then the child responds
4. Screen 1 must accept all input via voice (STT) with a typed text fallback — never a form
5. Screen 2 must display three illustrated doors with sound effects representing Animals, Space, and Math
6. Screen 3 must present two options: "Read to me" and "Let's read together" using Spriggle's voice
7. Screen 4 must present three 3-second animated clips representing Calm, Exciting, and Silly story tones
8. The system must write the intake responses to a structured child profile JSON in Supabase and index it in Azure AI Search
9. The intake must complete in under 2 minutes
10. The intake must NOT present any form fields, assessment language, or reading level tests

#### Screen 1 — The Introduction Exchange (Detailed Flow)

Spriggle always shares something about itself before asking the child. This models the interaction and builds trust.

**Step 1 — Name:**
Spriggle says: *"Hi! I'm Spriggle! What's your name?"*
Child responds by voice or text.
Spriggle confirms: *"Oh wow, [Name]! Love that name! 🌟"*

**Step 2 — Favorite color (Question 1):**
Spriggle says: *"I have something really cool to share — my favorite color is violet, just like the night sky! What's YOUR favorite color?"*
Child responds by voice. Spriggle affirms warmly.

**Step 3 — Favorite animal (Question 2):**
Spriggle says: *"You know what's really cool? My favorite creature is a glowing fox who lives in the clouds! What's your favorite animal?"*
Child responds by voice. Spriggle affirms warmly.

**Step 4 — Confirm / Retry:**
Spriggle says: *"So you're [Name], your favorite color is [color], and you love [animal]! Did I get that right?"*
Two large buttons appear: ✅ "Yes, that's me!" and 🔄 "Try again!"
If "Try again": replay Steps 2–3 only, not the name step.
After 3 failed attempts: accept last heard values and move forward gracefully.

#### The Rotating RAG Question Bank (7 Questions)

On first session: always ask Questions 1 and 2 (color and animal).
On each subsequent session: ask 1 new question from the bank in order.
Never repeat the same question in consecutive sessions.
Track with `lastQuestionAsked` field in the child profile.

| # | Spriggle shares | Then asks |
|---|---|---|
| 1 | "My favorite color is violet, just like the night sky!" | "What's YOUR favorite color?" |
| 2 | "My favorite creature is a glowing fox who lives in the clouds!" | "What's your favorite animal?" |
| 3 | "I really love the sound of rain. It makes me so happy." | "What's a sound that makes YOU happy?" |
| 4 | "I'm really good at remembering every story I've ever heard!" | "What's something YOU are really good at?" |
| 5 | "My favorite place is somewhere with big open skies and soft grass." | "What's your favorite place to go?" |
| 6 | "Someone who always makes me laugh is my friend the wind — she tells the best jokes!" | "Who makes YOU laugh the most?" |
| 7 | "Something that always cheers me up is thinking about a really yummy food." | "What's your favorite food?" |

The most recently collected answer must be incorporated into the very next story generated.

#### Voice Implementation
- Spriggle's voice: `en-US-AnaNeural` — child-like, bright, playful
- Story narration voice: `en-US-AriaNeural` with cheerful style
- SSML: Spriggle's voice is +5% rate, +10% pitch above baseline to feel distinct from narration
- STT timeout: 8 seconds, then gentle re-prompt: *"I'm listening! Take your time. 🌟"*
- After 2 unrecognized inputs: show visual button options as fallback

#### Language Safety Rules for Intake
- Never use the word "secret" — say "something really cool to share" instead
- Never make warmth conditional on the child performing correctly
- Never reference stories or learning when redirecting — keep redirects human and casual
- Unexpected input response: "Ha, I love that! Ready to go? 🌀"

### 4.2 Subject Selection

10. The system must display three subject cards on the home screen: Animals, Space, and Math
11. Each subject card must include an illustration, label, and tap/click target area
12. The system must retrieve the selected subject from the child's profile on return sessions

### 4.3 Story Generation

13. The system must generate a story containing 4–6 scenes per session
14. Each scene must contain: a title, 2–4 sentences of narration text, and an image prompt for FLUX 1.1 pro
15. The Story Agent must retrieve the child's profile doc and 3–5 relevant curriculum chunks from Azure AI Search before generating
16. All story vocabulary and sentence structure must be appropriate for first grade (ages 5–7)
17. The Story Agent must apply the child's preferred tone (Calm, Exciting, Silly) to the narrative style
18. The Story Agent must incorporate the child's favorite color into scene image prompts and setting descriptions
19. The Story Agent must include the child's favorite animal as a character, companion, or story element
20. The Story Agent must incorporate the most recently collected personal detail (from the rotating question bank) naturally into the story world — this is the highest priority personal detail each session
21. Every story output must pass a safety check before being displayed to the child
22. The system must generate one FLUX 1.1 pro image per scene using the scene's image prompt
23. Images must be child-appropriate, illustrated in style, and match the scene's setting and characters

### 4.4 Narration

22. The system must read every scene aloud using Azure AI Speech TTS
23. Narration must begin automatically when a scene loads
24. The system must display synchronized captions for every word spoken, on by default
25. Caption font size must be independently adjustable from the parent dashboard
26. The child must be able to replay narration by tapping a visible replay button or saying "say it again"
27. Narration speed must be adjustable (slower / normal / slightly faster) from the parent dashboard

### 4.5 Quiz System

28. The system must generate 2–3 quiz questions per session based on the completed story content
29. Quiz questions must be answerable by voice input or typed text
30. The Quiz Agent must score each response and store the result in Supabase
31. The Quiz Agent must update the child's memory doc in Azure AI Search after each session
32. If the child scores below the difficulty threshold, the next session must use simpler vocabulary, shorter sentences, and more repetition
33. If the child scores above the difficulty threshold, the next session must use slightly richer vocabulary and less scaffolding

### 4.6 Bounded Voice Commands

34. The system must support exactly 5 bounded voice commands in child mode: "Say it again", "Make it easier", "Tell me more", "Next", and quiz answer input
35. Any unrecognized voice input must trigger a gentle redirect, not an error message
36. Free-form conversation must not be available in child mode under any circumstance

### 4.7 Accessibility

37. Captions must be ON by default for all narration
38. The system must include a reduced motion mode that disables all animations
39. The system must include a dyslexia-friendly font toggle using OpenDyslexic
40. The system must include a high contrast mode
41. The system must include a larger text mode that increases all text globally
42. All accessibility settings must be controllable from the parent dashboard
43. All accessibility settings must persist across sessions per child profile

### 4.8 Parent Layer

44. The parent area must be protected by a year-of-birth PIN
45. The parent area must include a child profile setup form: name, age, grade, interests, reading comfort
46. The parent area must allow curriculum document upload (PDF or plain text)
47. Uploaded curriculum must be chunked and indexed into the `talewind-curriculum` Azure AI Search index
48. The parent dashboard must display session history: date, subject, quiz score
49. The parent dashboard must display what the app has learned about the child (derived memory)
50. The parent dashboard must display the child's current difficulty level and reading mode
51. Only the parent layer may edit profiles, upload curriculum, or review stored learning data

### 4.9 Memory and Adaptation

52. The system must maintain three layers of child memory: stable profile, session memory, and derived memory
53. Stable profile must include: name, grade, interests, preferred subjects, reading comfort
54. Session memory must include: subject chosen, quiz score, where the child needed help, themes that worked
55. Derived memory must be inferred over time: e.g., "responds well to animal stories", "struggles with math vocabulary"
56. All memory must be stored in Supabase and the child's profile doc must be refreshed in Azure AI Search after every session
57. The Story Agent must retrieve the updated child profile on every new session — this is the RAG adaptation mechanism

### 4.10 Safety

58. The system must restrict all content to 3 approved subjects: Animals, Space, Math
59. The system must not perform any public web retrieval — only approved curriculum docs
60. All outputs must be first-grade appropriate: gentle, encouraging, short, clear, free of scary or mature content
61. Every Story Agent output must pass an explicit safety check prompt before being displayed
62. Every Quiz Agent output must be checked for age-appropriate language before being displayed
63. Any flagged output must be rewritten, never shown, and logged silently
64. Child mode must have no path to parent settings

---

## 5. Non-Goals (Out of Scope for MVP)

- AI video generation (Phase 2)
- Multi-child profiles (Phase 2)
- PDF curriculum auto-chunking (Phase 2 — MVP uses manual JSON chunks)
- Emotional tone detection (Phase 2)
- Expanded subject library beyond 3 subjects (Phase 2)
- Gamification / badges (Phase 2)
- Long-term story arcs across sessions (Phase 2)
- Accessibility enhancements beyond the 5 MVP modes (Phase 2)
- Offline / local AI mode (Phase 2)

---

## 6. Design Considerations

### Brand
- **App name:** Talewind
- **Guide character:** Spriggle — tiny glowing creature made of story pages, wind-sprite energy, sparkly but cozy
- **Tagline:** "Where every story takes flight"
- **Visual energy:** Storybook + adventurous. Bold jewel tones. Shapes that move. Everything interactive.

### Locked Color Palette (Child UI)

| Token | Value | Usage |
|---|---|---|
| `background` | `#0d0d2b` | Cosmic dark — always the base in child mode |
| `primary` | `#7c3aed` | Purple — Spriggle's main color, buttons |
| `primaryLight` | `#a78bfa` | Light purple — captions, secondary elements |
| `primaryDark` | `#5b21b6` | Dark purple — Spriggle body depth |
| `animals` | `#10b981` | Emerald — Animals subject card and glow |
| `space` | `#3b82f6` | Sapphire — Space subject card and glow |
| `math` | `#f59e0b` | Amber — Math subject card and glow |
| `textPrimary` | `#e9d5ff` | Near-white with purple tint — all primary text |
| `textMuted` | `#c4b5fd` | Muted purple — story text, secondary labels |
| `accent` | `#fbbf24` | Gold — scene titles, Spriggle speech bubbles |

All tokens live in `/src/styles/tokens.ts`. Agents must import from there — never hardcode hex values.

### Typography
- **UI + Spriggle dialogue:** Comfortaa (Google Fonts)
- **Story narration text:** Playfair Display (Google Fonts)
- **Display/decorative headings:** Sacramento (Google Fonts)

### Spriggle Character Design
- Rendered as SVG — not an image file
- Floats continuously using CSS animation (`float` keyframe)
- Wiggles on hover
- Purple drop shadow: `drop-shadow(0 0 14px rgba(167,139,250,0.7))`
- Speech bubble: purple border, slight backdrop blur, gold text
- Always appears at top of every child-facing screen
- Reduced motion mode disables float and wiggle — Spriggle remains static

### Subject Card Design
- Each subject card has its jewel tone as border color and on-hover glow
- Animals: emerald (`#10b981`) glow — `box-shadow: 0 0 20px rgba(16,185,129,0.3)`
- Space: sapphire (`#3b82f6`) glow — `box-shadow: 0 0 20px rgba(59,130,246,0.3)`
- Math: amber (`#f59e0b`) glow — `box-shadow: 0 0 20px rgba(245,158,11,0.3)`
- Cards animate with `bounce-in` on screen load
- Cards scale up slightly on hover: `transform: scale(1.06) translateY(-4px)`

### Border Radius
- Cards: `22px`
- Buttons: `18px`
- Pills/voice command chips: `20px`
- Input fields: `18px`

### Motion Rules
- All animations wrapped in `prefers-reduced-motion` media query check
- Also check child profile `reducedMotion` setting from parent dashboard
- If either is true: disable ALL animations globally — no exceptions
- Starfield: 40 small twinkling stars in the background of child screens

### Voice Specs (Locked)
- **Spriggle's voice:** `en-US-AnaNeural`
- **Story narration voice:** `en-US-AriaNeural` with cheerful style
- **Spriggle SSML:** rate +5%, pitch +10% above baseline — makes Spriggle feel distinct
- Spriggle speaks first via TTS, then STT listens — never overlap
- STT timeout: 8 seconds, then gentle re-prompt

### Parent UI
- Clean, dark, informational — same dark background as child UI
- No animated elements — calm and trustworthy
- Clear data presentation: session history, derived memory, accessibility controls

### Accessibility (MVP — all required)
- Captions ON by default — always
- Reduced motion mode: disables ALL animations
- Dyslexia-friendly font: OpenDyslexic toggle
- High contrast mode: increases all contrast ratios
- Larger text mode: increases base font size 1.5x globally
- Captions match narration exactly — never summarized

---

## 7. Technical Considerations

### Project Structure
```
/docs
  /agents
    frontend-agent.md
    backend-agent.md
    debugger-agent.md
    intake-agent.md
    story-agent.md
    quiz-agent.md
  /tasks
    prd-talewind-mvp.md
    tasks-talewind-mvp.md
    setup-directions.md
/src
  /app
    /api
      /intake
      /story
      /quiz
      /tts
      /image
    /child
    /parent
    /components
  /lib
    /azure
      openai.ts
      search.ts
      speech.ts
      flux.ts
    /supabase
      client.ts
      profiles.ts
      sessions.ts
      memory.ts
    /safety
      checkStoryOutput.ts
      checkQuizOutput.ts
  /styles
    tokens.ts
  /types
    Child.ts
    Story.ts
    Quiz.ts
    Curriculum.ts
  /data
    /curriculum
      animals.json
      space.json
      math.json
    indexCurriculum.ts
/tests
  test-connections.js
```

### Stack
- **Frontend + Backend:** Next.js 14 (App Router) — TypeScript
- **Database:** Supabase — auth, profiles, sessions, curriculum chunks, memory
- **AI Orchestration:** Azure AI Foundry — multi-agent coordination
- **Story + Quiz Generation:** GPT-4o mini via Azure Foundry (`talewind-gpt4o-mini`)
- **Image Generation:** FLUX 1.1 pro via Azure Foundry (`FLUX-1.1-pro`)
- **Narration (TTS):** Azure AI Speech — Sweden Central
- **Voice Input (STT):** Azure AI Speech — Sweden Central
- **RAG Retrieval:** Azure AI Search — two indexes: `talewind-curriculum`, `talewind-children`
- **Deployment:** Vercel

### Code Style
- Functional over class-based — no class components, no OOP patterns
- Explicit over clever — verbose is fine, unclear is not
- Heavy comments — every function must have a comment explaining what it does and why
- TypeScript strict mode — all types defined, no `any`
- All AI calls go through Next.js API routes — never from client components
- All secrets stay server-side — no `NEXT_PUBLIC_` prefix for Azure or Supabase service keys

### Environment Variables
```
# Azure OpenAI (Foundry)
AZURE_OPENAI_ENDPOINT=https://proj-talewind-resource.openai.azure.com/openai/v1/
AZURE_OPENAI_KEY=
AZURE_OPENAI_DEPLOYMENT=talewind-gpt4o-mini

# FLUX 1.1 pro (Image Generation)
AZURE_FLUX_ENDPOINT=
AZURE_FLUX_KEY=

# Azure AI Search
AZURE_SEARCH_ENDPOINT=https://talewind-search.search.windows.net
AZURE_SEARCH_KEY=

# Azure Speech
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=swedencentral
AZURE_SPEECH_VOICE_SPRIGGLE=en-US-AnaNeural
AZURE_SPEECH_VOICE_NARRATION=en-US-AriaNeural

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Supabase Tables
- `parents` — id, email, year_of_birth_pin, created_at
- `children` — id, parent_id, name, age, grade, interests[], reading_comfort, preferred_subject, created_at
- `curriculum_chunks` — id, subject, topic, content, grade_level, source_label, approved, embedding_id
- `sessions` — id, child_id, subject, story_metadata (json), quiz_score, adaptation_result, created_at
- `child_memory` — id, child_id, stable_profile (json), session_history (json), derived_memory (json), updated_at

### RAG Design
- Curriculum chunks: one concept per chunk, max 150 words, metadata: subject, topic, grade_level, source_label, approved: true
- Child profile docs: indexed per child in `talewind-children`, updated after every session
- Retrieval: 3–5 curriculum chunks + full child profile doc retrieved before every story generation
- No public web retrieval ever — closed retrieval only

---

## 8. Success Metrics

- [ ] Child can complete the Magic Door intake in under 2 minutes without parent help
- [ ] Story generation produces a complete 4–6 scene story in under 15 seconds
- [ ] Quiz questions are correctly generated from story content
- [ ] Child memory updates correctly after each session
- [ ] Second session story reflects first session memory (demonstrates RAG adaptation)
- [ ] All 5 accessibility modes function correctly
- [ ] Parent PIN gate works and parent dashboard displays session data
- [ ] App is deployed to Vercel and accessible via public URL
- [ ] All Azure services respond without errors in production
- [ ] Zero child safety violations in 10 test sessions

---

## 9. Open Questions

- [ ] Will gpt-image access be approved? If yes, swap FLUX for gpt-image-1 — single env var change, no code changes
- [ ] Should the parent PIN be year-of-birth or a custom PIN set during onboarding?
- [ ] How should the app handle a quiz score exactly at the difficulty threshold — up, down, or hold?

### Resolved
- ✅ **Spriggle's voice:** `en-US-AnaNeural` — locked
- ✅ **Narration voice:** `en-US-AriaNeural` cheerful style — locked
- ✅ **Image generation:** FLUX 1.1 pro — locked (swap to gpt-image-1 if access granted)
- ✅ **RAG question bank:** 7 rotating questions, 2 asked per first session, 1 per subsequent session
- ✅ **Confirm/retry loop:** Summary → confirm → retry up to 3 times → graceful advance
- ✅ **Design system:** Jewel tones (emerald/sapphire/amber), cosmic dark background, Spriggle as SVG
- ✅ **Accessibility:** MVP pillar — all 5 modes required for submission
- ✅ **Latest RAG data priority:** Most recently collected personal detail is highest priority for story personalization