# Talewind

**An AI story tutor that learns every child's world — then teaches them through a story that feels like it was made just for them.**

> Built for the [Microsoft JavaScript AI Build-a-Thon](https://github.com/Azure-Samples/JavaScript-AI-Buildathon) · Agents for Impacts Challenge

![Azure OpenAI](https://img.shields.io/badge/Azure_OpenAI-GPT--4o_mini-5c2d91?style=flat-square)
![Azure AI Search](https://img.shields.io/badge/Azure_AI_Search-RAG-0078d4?style=flat-square)
![Azure Speech](https://img.shields.io/badge/Azure_Speech-TTS%2FSTT-0078d4?style=flat-square)
![FLUX](https://img.shields.io/badge/FLUX_1.1_pro-Image_Gen-ff6b35?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js_15-App_Router-000000?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square)

---

## The Problem

First grade is the most critical literacy window in a child's life. Research consistently shows that a child who cannot read proficiently by the end of first grade is four times more likely to drop out of high school. Literacy isn't just a subject, it's the foundation every other subject is built on.

Existing ed-tech tools for this age group (ABCMouse, reading apps, adaptive platforms) share a fundamental flaw: **static content**. The story your child reads today is the same story every other child gets. There is no "you" in the curriculum.

Children ages 5–7 have short attention spans, emerging reading skills, and a deep need to feel seen. When the puppy in the story has their favorite animal's name, when the sky is their favorite color, when the math problem is about something they told the app they love they lean in. Engagement becomes attention, attention becomes comprehension, comprehension becomes memory.

And critically: many 5-year-olds cannot type. Any solution that is not voice-first is not actually accessible to this age group.

---

## What Talewind Does

Talewind is a fully voice-driven adaptive story tutor. Every session is a complete loop:

1. **Spriggle (the AI guide) meets the child** learns their name, favorite color, favorite animal, preferred subject, reading style, and story vibe through a warm conversation, not a form.
2. **A personalized story is generated** 4–6 illustrated scenes built from real curriculum content, with the child's details woven in by the AI at the prompt level.
3. **Spriggle narrates the story**  with real-time word-level caption sync, two distinct voices, and adjustable speed.
4. **The child answers 2–3 comprehension questions** by voice or text. Scoring is generous. There is no shame.
5. **The system learns**  comprehension score drives a silent difficulty adjustment. A three-layer memory system records what worked, what was hard, and what the child loves. The next session is smarter.

Every word that reaches a 5-year-old passes through a dedicated AI safety agent first. No adult content, no scary language, no assessment pressure ever surfaces.

---
## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind CSS v4, locked design token system |
| AI / LLM | Azure OpenAI GPT-4o mini (5 agents) |
| RAG | Azure AI Search — `talewind-curriculum` + `talewind-children` |
| TTS / STT | Azure AI Speech (AnaNeural + AmberNeural) + Web Speech API |
| Image Gen | FLUX 1.1 pro via Azure AI |
| Database | Supabase (Postgres) — `children`, `sessions`, `child_memory` |
| Fonts | Comfortaa (UI) · Playfair Display (narration) · Sacramento (display) · OpenDyslexic (accessibility) |
| Hosting | Vercel |


## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    CHILD BROWSER (Next.js)                   │
│  /child/intake  ──►  /child/story  ──►  /child/quiz          │
│  Web Speech API (STT)  ·  Audio API (TTS playback)           │
└────────────┬──────────────────────────────┬──────────────────┘
             │ HTTPS                         │ HTTPS
┌────────────▼──────────────────────────────▼──────────────────┐
│                  NEXT.JS API ROUTES                           │
│   /api/intake · /api/story · /api/quiz · /api/tts · /api/image│
└──┬───────────┬──────────┬──────────┬──────────┬──────────────┘
   │           │          │          │          │
   ▼           ▼          ▼          ▼          ▼
Azure       Azure AI   Azure AI   Azure     FLUX 1.1 pro
OpenAI      Search     Speech     OpenAI    (scene images)
GPT-4o mini (RAG)      (TTS+STT)  GPT-4o mini
   │           │                    │
   └───────────┴────────────────────┘
                      │
               ┌──────▼───────┐
               │   Supabase   │
               │   children   │
               │   sessions   │
               │ child_memory │
               └──────────────┘
```

Five API routes, four AI agents, two Azure AI Search indexes, one Supabase database. Every component has a single responsibility and fails gracefully.

---

## The Five AI Agents

### 1. Intake Agent — Spriggle

Spriggle is the AI character that greets every child. The intake conversation is powered by GPT-4o mini (max 150 tokens, temperature 0.7) with a carefully constrained system prompt.

The conversation collects exactly what the story engine needs:
- First name (only no last name, school, or contact info ever requested)
- Favorite color and favorite animal
- Preferred subject: Animals, Space, or Math
- Reading mode: "Read to me" or "Read together"
- Story vibe: Calm, Exciting, or Silly

**System prompt constraints enforced:**
- Never use the word "secret" replaced with "something really cool to share"
- Warmth is unconditional never tied to a correct answer
- Free-form conversation is blocked Spriggle always gently returns to the task
- After 3 failed confirmation attempts, the system accepts the last heard values and moves on
- Every step has hard-coded fallback text the child never sees an error or a blank screen

**Return sessions** use a 7-question rotating bank tracked by `lastQuestionAsked` index, so Spriggle asks a new personal question every session without repeating.

**Output:** ChildProfile written to Supabase, indexed to Azure AI Search (`talewind-children`), ChildMemory initialized.

---

### 2. Story Agent

The story engine is what makes Talewind genuinely different from a template system. GPT-4o mini (max 1,800 tokens, temperature 0.7) generates a unique 4–6 scene story on every session using two RAG sources:

**RAG Pipeline:**
1. Retrieve child profile document from `talewind-children` Azure AI Search index
2. Retrieve 4 curriculum chunks from `talewind-curriculum` by subject and personal detail search query
3. Inject both as structured context into the story prompt

**Personalization priority order (enforced in system prompt):**
1. Latest personal detail- highest priority (e.g., "loves the beach" → beach setting)
2. Favorite animal — must appear as a character or story element
3. Favorite color — must appear in scene descriptions and every image prompt
4. Derived memory — inferred themes from prior sessions (populated after 3 sessions)
5. Child's name — used naturally throughout

**Difficulty mapping** from the memory system:
- `currentDifficulty: "simplify"` → easy vocabulary and sentence structure
- `currentDifficulty: "hold"` → medium (default)
- `currentDifficulty: "enrich"` → richer vocabulary, more complex narrative

Every scene includes an image prompt that begins with `"Soft illustrated children's book style."`  this prefix is non-negotiable and enforces visual safety at the generation level before FLUX ever receives the request.

Output is validated for structure (4–6 scenes, required fields) and then passed to the Safety Agent before any data leaves the server.

---

### 3. Quiz Agent

The quiz system has two modes in a single route:

**Generate mode** (GPT-4o mini, max 900 tokens, temperature 0.7):
- 2–3 questions: at minimum one recall, optionally one inference or vocabulary question
- Each question has a gentle hint and a scene reference (0-based)
- `expectedAnswer` is generated server-side and **never sent to the client**

**Score mode** (GPT-4o mini, max 700 tokens, **temperature 0.3** for consistent scoring):
- Generous scoring: partial understanding counts as correct
- No spelling or grammar penalty — a 6-year-old's handwriting is not their comprehension
- "I don't know" scores zero; everything else gets fair partial credit

**Adaptation thresholds (silent — the child never sees these):**
| Score | Result | Next Session |
|-------|--------|-------------|
| ≤ 49 | `simplify` | Easier vocabulary, shorter sentences |
| 50–79 | `hold` | Maintain current level |
| ≥ 80 | `enrich` | Richer topics, more complex narrative |

After scoring, the route executes the full memory write pipeline: create session → merge into memory → re-derive memory if 3+ sessions → upsert `child_memory` → re-index Azure AI Search.

---

### 4. Safety Agent

Every AI-generated output, story narration and quiz questions  passes through a dedicated safety review before reaching the child. This is not a filter; it is a rewriting agent.

**Story safety** (GPT-4o mini, temperature 0.2, max 1,024 tokens) rejects content that contains:
- Vocabulary above first-grade reading level
- Scary, violent, or threatening elements; any mention of death, injury, blood, or fear
- Adult themes or emotionally complex moral situations
- Content outside the three approved subjects: Animals, Space, Math
- Conditional warmth affection tied to performance
- Assessment language any hint of testing, grading, or scoring pressure

When a scene fails, the agent rewrites only the narration of flagged scenes. Scene titles, structure, and educational intent are preserved. The client receives a `wasRewritten: boolean` flag.

**Quiz safety** (GPT-4o mini, temperature 0.2, max 512 tokens) additionally rejects:
- Assessment framing: "test", "score", "grade", "pass", "fail"
- Trick questions, double negatives, or ambiguous phrasing
- Cold, clinical, or pressuring tone

Separate rewrite maps exist for question text and hint text. `expectedAnswer` is never modified.

Safety check violations are logged by session ID (child ID omitted). The system is architected for a Phase 12 hook that writes hashed violation records to a `safety_logs` table — never surfaced to child or parent UI.

---

### 5. Derived Memory Agent

After 3 or more completed sessions, a fifth agent runs automatically as part of the memory write pipeline.

GPT-4o mini (max 300 tokens, temperature 0.4) analyzes the last 6 session entries and infers 2–4 short natural-language memory statements:

> "Responds well to silly animal stories"  
> "Requests 'make it easier' on math scenes"  
> "Engages best when the story has a beach or ocean setting"

**What it receives** (deliberately minimal — no names, no raw scores):
- Subject per session
- Adaptation result (simplify/hold/enrich — not the numeric score)
- Scenes the child flagged as hard
- Topics covered
- Tone used

These derived memory strings feed back into the Story Agent's context on the next session, closing the personalization loop.

---

## Three-Layer Adaptive Memory

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: STABLE PROFILE  (from intake, rarely changes)         │
│  name · favoriteColor · favoriteAnimal · preferredSubject       │
│  readingMode · storyTone · latestPersonalDetail                 │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: SESSION HISTORY  (append-only log)                    │
│  storyTitle · adaptationResult · madeEasierScenes               │
│  struggledWith · workedWell · topicsCovered · tone              │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: DERIVED MEMORY  (GPT inference after 3+ sessions)     │
│  "Engages best with calm space stories"                         │
│  "Requests 'make it easier' on math scenes"                     │
└─────────────────────────────────────────────────────────────────┘
```

All three layers live in a single `child_memory` Supabase row, updated atomically after every session. The entire record is re-synced to Azure AI Search `talewind-children` so the Story Agent always retrieves the latest state at the start of each session.

The memory system is designed to be additive — no session data is ever overwritten or summarized away. The derived memory layer provides a compressed signal without losing the raw session history.

---

## Responsible AI Design

Responsible AI isn't a checklist item in Talewind it shapes the architecture.

**Child-safe content pipeline.** No AI-generated text reaches the child without passing through the Safety Agent first. Flagged content is rewritten in-place. The child never sees a raw GPT response.

**Unconditional warmth.** Spriggle's system prompt explicitly forbids making warmth conditional on correct answers. "Good job for getting that right" is a disallowed pattern. Encouragement is identical regardless of comprehension score.

**Domain lock.** Story and quiz agents are system-prompted to only generate Animals, Space, or Math content. The Safety Agent independently enforces this as a rejection rule with automatic rewrite. Two independent barriers.

**Assessment language ban.** Words like "test", "score", "grade", "pass", and "fail" are rejected in quiz questions and hints. The quiz is framed as a playful conversation with Spriggle, not an evaluation.

**Adaptation without shame.** Difficulty changes silently. The child never knows the threshold was crossed. Spriggle's response to a low score is identical to its response to a high score.

**Bounded voice input.** During story reading, only 5 voice commands are accepted: `say it again`, `make it easier`, `tell me more`, `next`, `skip`. Matching uses an allowlist — no regex catch-alls. All STT results are treated as untrusted user input and pass through the same sanitization pipeline as typed text before any AI call.

**SSML injection prevention.** All user-controlled content (story text, child's name, quiz questions) is XML-escaped before reaching Azure Speech: `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`. Voice names and prosody values (rate, pitch) are validated against strict pattern allowlists before being included in SSML.

**Privacy-minimal intake.** Only a first name is collected from the child. No last name, address, school, email, or contact information is ever requested or stored. All inputs are trimmed to 100 characters and ASCII-sanitized before any AI call.

---

## Voice-First UX

A 5-year-old who can't type is a 5-year-old who can't use most ed-tech. Talewind is designed from the ground up for voice.

- **Browser STT** via Web Speech API — no audio uploads, no server-side recording
- **8-second silence timeout** → Spriggle gives a gentle nudge → second timeout → "I'm ready!" button appears so the child can restart when they want
- **Mic feedback indicator** — pulsing purple mic icon while listening, bouncing green checkmark the moment speech is captured — immediate feedback before the AI response arrives
- **Azure Neural TTS** — two distinct voices: Spriggle (`en-US-AnaNeural`, rate +5%, pitch +10%) and narration (`en-US-AmberNeural`, cheerful expressive style)
- **Word-level caption sync** — TTS `wordBoundary` events provide millisecond-accurate timing; a `requestAnimationFrame` loop highlights each word as it's spoken
- **Captions on by default** — accessibility is not opt-in

---

## The 4-Screen Intake Journey

```
Screen 1          Screen 2          Screen 3          Screen 4
──────────        ──────────        ──────────        ──────────
Spriggle          Three Magic       Reading           Story Vibe
meets child       Doors             Mode

Name              🐾 Animals        Read to me        😌 Calm
Fav. color        🚀 Space          Read together     ⚡ Exciting
Fav. animal       ➗ Math                              🎉 Silly

Voice or type     Tap to choose     Tap to choose     Animated
Mic → green ✓     Jewel-tone glow   Two large cards   3-sec clips
```

A 4-dot progress indicator shows position throughout. The confirm/retry loop on Screen 1 lets the child correct Spriggle's summary up to 3 times before the system accepts the last heard values.

---

## Accessibility

| Mode | Trigger | Effect |
|------|---------|--------|
| Reduced Motion | OS `prefers-reduced-motion` OR profile flag | All CSS keyframe animations disabled |
| Dyslexia Font | Profile toggle | Switches globally to OpenDyslexic |
| High Contrast | Profile toggle | Black/white high-contrast CSS override |
| Larger Text | Profile toggle | 1.5× base font scale |
| Captions | Always ON by default | Real-time word-highlighted caption bar |

Caption font size (px) and narration speed (slower / normal / faster) are additional per-child controls. The `AccessibilityProvider` context syncs OS-level motion preferences with profile-level flags — if either signals reduced motion, all animations are disabled.

---

## Curriculum

60 approved curriculum chunks across three subjects, indexed in Azure AI Search:

| Subject | Chunks | Topics |
|---------|--------|--------|
| Animals | 20 | Mammals, birds, ocean animals, habitats, diet, insects, reptiles, migration, camouflage, endangered species, animal homes, animal babies |
| Space | 20 | Sun, Moon, planets, stars, astronauts, rockets, Milky Way, gravity, ISS, comets, constellations, Earth, Mars, day & night |
| Math | 20 | Counting, addition, subtraction, shapes, patterns, measurement, even/odd, time, sorting, fractions, money, temperature, place value |

All chunks are: `grade_level: "1"`, `approved: true`. Every factual statement in every story must cite from the retrieved chunks — the Story Agent is explicitly prohibited from inventing facts.

---


---

## Getting Started

### Prerequisites

- Node.js 20+
- Azure OpenAI deployment (GPT-4o mini via Azure Foundry `/openai/v1/` endpoint)
- Azure AI Search resource with two indexes provisioned (see `docs/azure/search-indexes.json`)
- Azure AI Speech resource (swedencentral or region of choice)
- Azure AI / FLUX 1.1 pro image generation endpoint
- Supabase project with schema provisioned

### Environment Variables

Create `.env.local`:

```bash
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini

# Azure AI Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_KEY=your-key

# Azure Speech
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=swedencentral
AZURE_SPEECH_VOICE_SPRIGGLE=en-US-AnaNeural
AZURE_SPEECH_VOICE_NARRATION=en-US-AmberNeural

# FLUX Image Generation
AZURE_FLUX_ENDPOINT=https://your-flux-endpoint
AZURE_FLUX_KEY=your-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Run Locally

```bash
npm install
npm run dev
```

Navigate to `http://localhost:3000/child/intake?parentId=demo-parent`

### Index Curriculum Data

```bash
npx ts-node src/data/indexCurriculum.ts
```

### Verify All Connections

```bash
node tests/test-connections.js
```

Verifies: Azure OpenAI, Azure AI Search (document count), Supabase (children table), Azure Speech (confirms AnaNeural and AmberNeural are available in your region).

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── intake/route.ts       # Intake Agent (Spriggle)
│   │   ├── story/route.ts        # Story Agent + RAG
│   │   ├── quiz/route.ts         # Quiz Agent (generate + score)
│   │   ├── tts/route.ts          # TTS synthesis endpoint
│   │   └── image/route.ts        # FLUX image generation
│   ├── child/
│   │   ├── intake/page.tsx       # 4-screen intake UI
│   │   ├── story/page.tsx        # Story reader + voice commands
│   │   └── quiz/page.tsx         # Quiz UI
│   └── components/
│       ├── Spriggle.tsx           # SVG character + animations
│       ├── AccessibilityProvider.tsx
│       ├── CaptionBar.tsx         # Word-level caption sync
│       ├── SceneCard.tsx          # Story scene display
│       └── ui/                    # Button, Pill, Input, VoiceCommandBar
├── lib/
│   ├── azure/                     # openai.ts, search.ts, speech.ts, flux.ts
│   ├── supabase/                  # client.ts, profiles.ts, sessions.ts, memory.ts
│   ├── safety/                    # checkStoryOutput.ts, checkQuizOutput.ts
│   └── rag/                       # deriveMemory.ts, updateChildProfile.ts
├── data/curriculum/               # animals.json, space.json, math.json (60 chunks)
├── styles/tokens.ts               # Locked design token system
└── types/                         # Child.ts, Story.ts, Quiz.ts, Api.ts, Intake.ts
```

---

## Documentation Deep-Dives

The `/docs` folder contains the full specification behind every design decision in this project. These are worth reading.

---

### Agent Specifications — `docs/agents/`

Each AI agent has a dedicated spec document covering system prompt design, guardrails, output schema, and the rationale behind every constraint. A few things judges should notice:

**[`docs/agents/intake-agent.md`](docs/agents/intake-agent.md)**
- Documents exactly why the word "secret" is banned — it implies hiding and exclusivity, which is unsafe for children. The replacement phrase ("something really cool to share") is specified in the PRD.
- Spriggle shares something about itself *before* asking the child each question. This models reciprocal conversation and builds trust — it's not an interrogation.
- Sentences capped at 8 words for Spriggle's spoken dialogue. Every line was written to fit a 5-year-old's working memory.

**[`docs/agents/story-agent.md`](docs/agents/story-agent.md)**
- Vocabulary limits per difficulty level: 6 words/sentence (easy), 8 (medium), 10 (hard). These aren't arbitrary — they map to first-grade reading scaffolding research.
- *"The most recently collected personal detail is always the most important one. If the child just told Spriggle their favorite place is the beach, the beach appears in this story."* — This is the core personalization contract.
- Image prompts include consistent character description rules across scenes, ensuring visual continuity across FLUX-generated illustrations.

**[`docs/agents/quiz-agent.md`](docs/agents/quiz-agent.md)**
- Forbidden words in quiz feedback: "wrong", "incorrect". Required format: *"Good try! Spriggle thinks the answer was hiding in the [scene]."*
- *"If the answer shows understanding of the concept, even if not exact wording, score as correct. Never penalize spelling errors or grammar."* — Generous scoring is a deliberate design decision, not a bug.

**[`docs/agents/debugger-agent.md`](docs/agents/debugger-agent.md)**
- The Debugger Agent has explicit authority to **block** features from shipping. Not warn — block. Three flag levels: BLOCK (stops shipping), WARN (note and proceed), CRITICAL (security/child safety escalates immediately).
- An 18-point validation checklist: TypeScript strictness, secret management, AI call patterns, safety check coverage, accessibility compliance, child safety gates.

---

### Azure AI Search Index Design — `docs/azure/search-indexes.json`

[`docs/azure/search-indexes.json`](docs/azure/search-indexes.json) defines both RAG indexes with field-level comments explaining why each field exists.

Key design decisions:
- `talewind-curriculum` filters on `subject` (filterable, facetable) and `approved` (boolean gate — only `approved: true` chunks ever reach the Story Agent)
- `talewind-children` stores `personalDetails`, `currentDifficulty`, `sessionCount`, and `lastQuestionAsked` — all the signals the Story Agent needs at retrieval time, without requiring a Supabase round-trip on every story generation
- Every field has a `_comment` annotation in the spec explaining its role in the personalization pipeline

---

### Database Schema — `docs/supabase/`

**[`docs/supabase/schema.sql`](docs/supabase/schema.sql)**

The full Postgres schema with column-level comments:

- `children.accessibility` is a JSONB column — all five accessibility modes (reducedMotion, dyslexiaFont, highContrast, largerText, captionsEnabled) plus font size and narration speed are stored per child, not globally. A parent can configure different settings for different children.
- `child_memory` uses three JSONB columns for the layered memory system: `stable_profile` (intake snapshot), `session_history` (append-only array), `derived_memory` (GPT inference array).
- `safety_logs.flagged_text_hash` stores SHA-256 hashes, never plaintext. The actual flagged content never touches the database.
- RLS is enabled on all tables. Policy definitions are staged for Phase 12.

**[`docs/supabase/migrations/`](docs/supabase/migrations/)**

Two dated migrations capture real-world schema evolution:
- `2026-03-31-add-accessibility.sql` — adds the accessibility JSONB column with safe `IF NOT EXISTS` guards, backfills defaults for existing rows, and sends `NOTIFY pgrst, 'reload schema'` to invalidate the PostgREST cache.
- `2026-03-31-reconcile-schema.sql` — reconciles schema drift discovered during deployment: type corrections (`grade_level` → SMALLINT), NOT NULL constraints, UNIQUE constraint on `child_memory.child_id` with a PL/pgSQL guard to check before adding.

---

### Product Requirements Document — `docs/tasks/prd-talewind-mvp.md`

[`docs/tasks/prd-talewind-mvp.md`](docs/tasks/prd-talewind-mvp.md) is the complete product spec — 450+ lines covering architecture, agent design, safety rules, accessibility requirements, and success metrics.

Two things worth finding in it:

> *"Demonstrate RAG-powered adaptation — the child's story changes because the **retrieval** changes, not the model."*

This is the central technical insight Talewind is built around. The model doesn't change. The context retrieved changes — because the child's profile in Azure AI Search is re-indexed after every session with updated difficulty, latest personal detail, and derived memory. That's what makes each story genuinely different.

> Success metrics include: "Child can complete Magic Door intake in under 2 minutes", "Story generation under 15 seconds", "Zero child safety violations in 10 simulated test sessions."

These are measurable, specific, and achievable. They're not marketing.

---

## Hackathon Track Alignment

**Agents for Impacts Challenge** — Talewind addresses early childhood literacy with a five-agent AI system:

- **Intake Agent** — learns the child as an individual, not a user ID
- **Story Agent** — generates curriculum-grounded content personalized at the sentence level
- **Quiz Agent** — assesses comprehension generously, without shame
- **Safety Agent** — ensures every word reaching a 5-year-old is appropriate
- **Derived Memory Agent** — makes the system smarter with every session

**The impact:** A child using Talewind gets what was previously only available to families who can afford a private reading tutor — a patient, knowledgeable guide that knows their world and meets them in it. At scale, that matters.

**Agentic System Architecture** — each agent has a single defined responsibility, communicates via structured JSON, fails gracefully with pre-written fallbacks, and is independently replaceable. The RAG pipeline separates retrieval from generation. The memory system decouples session observation from adaptation state. No agent has access to more context than it needs.

---

## License

MIT
