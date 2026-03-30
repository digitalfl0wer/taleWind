# Tasks: Talewind MVP

**Generated from:** `prd-talewind-mvp.md`
**Deadline:** March 31, 2026
**Branch:** `scaffold`

---

## Phase 1: Foundation & Infrastructure

- [x] **1.1** Create `.env.local` with all required environment variables (Azure OpenAI, FLUX, AI Search, Speech, Supabase)
- [x] **1.2** Define all TypeScript types in `/src/types/` — `Child.ts`, `Story.ts`, `Quiz.ts`, `Curriculum.ts`
- [x] **1.3** Create design token file `/src/styles/tokens.ts` with full locked color palette, typography refs, border radius, and shadow values
- [x] **1.4** Set up Supabase schema — create tables: `parents`, `children`, `curriculum_chunks`, `sessions`, `child_memory`
- [x] **1.5** Create Azure AI Search indexes: `talewind-curriculum` and `talewind-children` with correct field schemas
- [x] **1.6** Scaffold `/src/lib/` module files: `azure/openai.ts`, `azure/search.ts`, `azure/speech.ts`, `azure/flux.ts`, `supabase/client.ts`, `supabase/profiles.ts`, `supabase/sessions.ts`, `supabase/memory.ts`
- [x] **1.7** Write `tests/test-connections.js` — verify all Azure and Supabase connections respond without errors

---

## Phase 2: Design System & Global UI

- [ ] **2.1** Add Google Fonts (Comfortaa, Playfair Display, Sacramento) and OpenDyslexic to the app
- [ ] **2.2** Build Spriggle SVG component — floating animation (`float` keyframe), hover wiggle, purple drop shadow, speech bubble with gold text and purple border
- [ ] **2.3** Build starfield background component — 40 small twinkling stars for all child-facing screens
- [ ] **2.4** Implement global accessibility CSS: reduced motion mode (disables all animations), dyslexia font toggle (OpenDyslexic), high contrast mode, larger text mode (1.5x base font size)
- [ ] **2.5** Wire accessibility state: read `reducedMotion` from child profile AND `prefers-reduced-motion` media query — if either is true, disable all animations globally
- [ ] **2.6** Build subject card components (Animals, Spaces, Math) — jewel tone borders and glow, `bounce-in` animation, hover scale, `22px` border radius
- [ ] **2.7** Build reusable button, pill/voice-chip, and input field components with locked border radii (`18px`, `20px`, `18px`)

---

## Phase 3: Supabase & Azure Integration Layer

- [x] **3.1** Implement `supabase/client.ts` — server-side client using service role key (no `NEXT_PUBLIC_` prefix for service key)
- [x] **3.2** Implement `supabase/profiles.ts` — CRUD for `children` and `parents` tables
- [x] **3.3** Implement `supabase/sessions.ts` — create and read session records
- [x] **3.4** Implement `supabase/memory.ts` — read and write `child_memory` rows; merge stable, session, and derived memory layers
- [x] **3.5** Implement `azure/openai.ts` — typed wrapper for GPT-4o mini via Azure Foundry endpoint (`talewind-gpt4o-mini`)
- [x] **3.6** Implement `azure/search.ts` — retrieval helpers for `talewind-curriculum` (3–5 chunks by subject) and `talewind-children` (full child profile doc by child ID)
- [x] **3.7** Implement `azure/speech.ts` — TTS function (returns audio buffer + word timing for caption sync) and STT function (stream from mic, 8s timeout, re-prompt on silence)
- [x] **3.8** Implement `azure/flux.ts` — image generation wrapper; accepts scene image prompt, returns URL; child-appropriate illustrated style enforced in system prompt
- [x] **3.9** Implement `safety/checkStoryOutput.ts` — send story content to GPT-4o mini with safety prompt; return pass/fail + rewrite if flagged; log failures silently
- [x] **3.10** Implement `safety/checkQuizOutput.ts` — same pattern as story safety check but scoped to quiz question language

---

## Phase 4: Curriculum Data

- [ ] **4.1** Author `src/data/curriculum/animals.json` — minimum 15 chunks, one concept per chunk, max 150 words, fields: `subject`, `topic`, `content`, `grade_level`, `source_label`, `approved: true`
- [ ] **4.2** Author `src/data/curriculum/space.json` — minimum 15 chunks, same schema
- [ ] **4.3** Author `src/data/curriculum/math.json` — minimum 15 chunks, same schema
- [ ] **4.4** Write `src/data/indexCurriculum.ts` — reads all three JSON files, upserts into `curriculum_chunks` Supabase table, and indexes into `talewind-curriculum` Azure AI Search index

---

## Phase 5: Intake Agent (Magic Door)

- [ ] **5.1** Build `src/app/api/intake/route.ts` — POST endpoint; accepts session state and child input; runs Intake Agent logic; returns next prompt, TTS audio, and STT instruction; writes completed profile to Supabase and indexes to `talewind-children`
- [ ] **5.2** Build Magic Door UI — `src/app/child/intake/` — full-screen layout with Spriggle at top, progress across 4 screens: Name + Exchange, Subject Choice, Reading Mode, Story Vibe
- [ ] **5.3** Implement Screen 1 (Introduction Exchange) — 7-question rotating RAG bank; on first session ask Q1 + Q2; each subsequent session ask 1 new question in order; track `lastQuestionAsked` in child profile; Spriggle shares something before asking
- [ ] **5.4** Implement Screen 1 confirm/retry loop — summary card → ✅ "Yes, that's me!" / 🔄 "Try again!" → retry Steps 2–3 only (not name) → after 3 failed attempts accept last heard values
- [ ] **5.5** Implement STT input for Screen 1 — 8s timeout, gentle re-prompt on silence (*"I'm listening! Take your time. 🌟"*), fallback to visual button options after 2 unrecognized inputs
- [ ] **5.6** Implement Screen 2 (Subject Choice) — 3 illustrated subject doors with sound effects; Animals, Space, Math
- [ ] **5.7** Implement Screen 3 (Reading Mode) — 2 large options: "Read to me" / "Let's read together"; Spriggle reads options aloud via TTS
- [ ] **5.8** Implement Screen 4 (Story Vibe) — 3 animated 3-second clips: Calm, Exciting, Silly
- [ ] **5.9** Enforce intake language safety rules — never use "secret"; warmth never conditional on correct performance; unexpected input → *"Ha, I love that! Ready to go? 🌀"*; no mention of stories/learning in redirects
- [ ] **5.10** Enforce 2-minute intake target — measure end-to-end and optimize prompts/TTS latency if needed

---

## Phase 6: Story Agent

- [ ] **6.1** Build `src/app/api/story/route.ts` — POST endpoint; retrieves child profile doc + 3–5 curriculum chunks from Azure AI Search; calls GPT-4o mini; runs safety check; returns 4–6 scene story object
- [ ] **6.2** Story Agent prompt — enforce: first-grade vocabulary, 2–4 sentence scenes, child's preferred tone, child's favorite color in image prompts and setting, favorite animal as story character, most recently collected RAG detail as highest-priority personalization
- [ ] **6.3** Build `src/app/api/image/route.ts` — accepts scene image prompt; calls FLUX 1.1 pro via `azure/flux.ts`; returns image URL; generate one image per scene
- [ ] **6.4** Build story reader UI — `src/app/child/story/` — scene card layout; scene title in Sacramento font with gold accent color; narration text in Playfair Display with `textMuted` color; scene image displayed above text
- [ ] **6.5** Story UI: auto-advance is off by default — child taps "Next" or says "Next" to advance scenes; display scene progress indicator

---

## Phase 7: Narration & Voice Commands

- [ ] **7.1** Build `src/app/api/tts/route.ts` — POST endpoint; accepts text + voice ID + SSML params; calls Azure Speech TTS; returns audio buffer + word-level timing array
- [ ] **7.2** Implement caption sync in story UI — highlight each word in narration text as it is spoken using word timing data; captions ON by default; Playfair Display font; `primaryLight` color
- [ ] **7.3** Implement "Say it again" — replay current scene narration from start on button tap or voice command
- [ ] **7.4** Implement all 5 bounded voice commands: `say it again`, `make it easier`, `tell me more`, `next`, and quiz answer input
- [ ] **7.5** Implement voice command STT loop during story — always listening for the 5 commands; unrecognized input triggers gentle redirect, not an error
- [ ] **7.6** Implement "Make it easier" — flag current scene in session memory; Story Agent uses this signal in next session to simplify vocabulary
- [ ] **7.7** Implement Spriggle SSML — apply rate +5%, pitch +10% to all Spriggle TTS audio to distinguish from narration voice

---

## Phase 8: Quiz Agent

- [ ] **8.1** Build `src/app/api/quiz/route.ts` — POST endpoint; accepts completed story content; calls GPT-4o mini to generate 2–3 questions; runs safety check on output; returns quiz questions
- [ ] **8.2** Build quiz UI — `src/app/child/quiz/` — one question at a time; large answer input; accepts voice or typed text; Spriggle present throughout
- [ ] **8.3** Quiz scoring — POST answers back to quiz route; score each response; store `quiz_score` and `adaptation_result` in `sessions` table
- [ ] **8.4** Quiz-driven adaptation — after scoring: if below threshold → write "simplify: true" to child memory; if above threshold → write "enrich: true"; Story Agent reads this on next session load

---

## Phase 9: Memory & Adaptation

- [ ] **9.1** After every session: update `child_memory` row in Supabase — append session data to `session_history`, refresh `derived_memory` inferences (e.g., "responds well to animal stories"), persist to Supabase
- [ ] **9.2** After every session: re-index child profile doc in `talewind-children` Azure AI Search — Story Agent always retrieves the latest version on next session
- [ ] **9.3** Derived memory inference — after 3+ sessions, GPT-4o mini analyzes session history and writes 2–4 natural-language inferences to `derived_memory` (e.g., "struggles with math vocabulary", "engages best with silly tone")
- [ ] **9.4** Verify RAG adaptation end-to-end — second session story must demonstrably reflect first session memory (include a test case in success metrics checklist)

---

## Phase 10: Parent Layer

- [ ] **10.1** Build parent PIN gate — `src/app/parent/` — year-of-birth PIN entry screen; validate against `parents.year_of_birth_pin`; no path from child mode to parent area
- [ ] **10.2** Build parent profile setup form — name, age, grade, interests, reading comfort fields; no open-ended free text visible to child
- [ ] **10.3** Build curriculum upload UI — accept PDF or plain text; chunk into `curriculum_chunks` schema; upsert to Supabase and index to Azure AI Search
- [ ] **10.4** Build parent dashboard — display: session history (date, subject, quiz score); derived memory (what the app has learned); current difficulty level and reading mode; all accessibility controls
- [ ] **10.5** Wire all accessibility toggles to child profile — reduced motion, dyslexia font, high contrast, larger text, caption font size, narration speed (slower / normal / faster); persist per child

---

## Phase 11: Safety Hardening

- [ ] **11.1** Domain lock — all story and quiz generation prompts must include explicit system instruction: only Animals, Space, and Math content; reject off-domain requests
- [ ] **11.2** No public web retrieval — confirm `azure/search.ts` only queries `talewind-curriculum` and `talewind-children`; no external search calls anywhere in codebase
- [ ] **11.3** Child mode has no path to parent settings — confirm routing; no parent links, buttons, or keyboard shortcuts accessible in child mode
- [ ] **11.4** Run 10 simulated test sessions — verify zero safety violations; all flagged outputs rewritten before display; failures logged silently

---

## Phase 12: Security

- [ ] **12.1** Enable Supabase Row Level Security (RLS) on all tables — `children` and `child_memory` rows must only be readable/writable by their owning `parent_id`; `sessions` scoped to child's parent; `curriculum_chunks` readable by authenticated users only
- [ ] **12.2** Validate and sanitize all API route inputs server-side — reject unexpected fields, enforce type and length constraints; never pass raw user input directly into AI prompts without sanitization
- [ ] **12.3** Enforce strict file upload security on curriculum upload — validate MIME type (PDF or plain text only), enforce max file size (e.g., 5MB), strip metadata, reject files with executable content before chunking
- [ ] **12.4** Add rate limiting to all AI API routes (`/api/intake`, `/api/story`, `/api/quiz`, `/api/tts`, `/api/image`) — prevent cost abuse and denial-of-service; use Vercel Edge middleware or an in-memory rate limiter
- [ ] **12.5** Confirm no secrets are exposed client-side — audit all `NEXT_PUBLIC_` env vars; Azure keys, Supabase service role key, and Speech keys must never appear in browser bundles; run `next build` and inspect client bundle
- [ ] **12.6** Set secure HTTP response headers via `next.config.js` — `Content-Security-Policy` (no inline scripts, restrict `img-src` to Supabase and Azure blob domains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
- [ ] **12.7** Harden parent PIN — enforce minimum 4-digit input, hash PIN before storing in Supabase (bcrypt), implement lockout after 5 failed attempts, never return PIN value from any API response
- [ ] **12.8** Protect all parent API routes with server-side session validation — unauthenticated requests to `/api/parent/**` must return 401; child-mode routes must be unreachable from parent context and vice versa
- [ ] **12.9** Audit logging for safety events — when `checkStoryOutput` or `checkQuizOutput` flags content: log child ID, session ID, flagged text hash (not plaintext), and timestamp to a `safety_logs` Supabase table; never expose logs to child or parent UI
- [ ] **12.10** STT input threat model — all speech-to-text results treated as untrusted user input; pass through the same sanitization pipeline as typed text before use in prompts; bounded command matching must use an allowlist, not a regex catch-all
- [ ] **12.11** Dependency audit — run `npm audit` and resolve all high/critical vulnerabilities before deployment; pin major dependency versions in `package.json`
- [ ] **12.12** COPPA alignment review — confirm no behavioral advertising, no persistent identifiers shared with third parties, parent consent gate before any child data is stored; document data retention policy (what is stored, for how long, how to delete)

---

## Phase 13: Deployment & Final Checks

- [ ] **13.1** Deploy to Vercel — configure all environment variables in Vercel dashboard; confirm build passes
- [ ] **13.2** Run `tests/test-connections.js` against production — all Azure and Supabase services respond without errors
- [ ] **13.3** Verify success metrics checklist from PRD section 8 — all 10 items must pass before submission
- [ ] **13.4** Final accessibility audit — test all 5 modes (reduced motion, OpenDyslexic, high contrast, larger text, captions); test on mobile viewport
- [ ] **13.5** Performance check — story generation under 15 seconds; intake under 2 minutes; no layout shift on scene transitions

---

## Completion Checklist (from PRD §8)

- [ ] Child can complete Magic Door intake in under 2 minutes without parent help
- [ ] Story generation produces a complete 4–6 scene story in under 15 seconds
- [ ] Quiz questions are correctly generated from story content
- [ ] Child memory updates correctly after each session
- [ ] Second session story reflects first session memory (RAG adaptation proven)
- [ ] All 5 accessibility modes function correctly
- [ ] Parent PIN gate works and dashboard displays session data
- [ ] App is deployed to Vercel and accessible via public URL
- [ ] All Azure services respond without errors in production
- [ ] Zero child safety violations in 10 test sessions
