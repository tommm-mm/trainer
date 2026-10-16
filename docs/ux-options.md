# UX & UI options (draft, 16 Oct 2026)

For Tommaso to pick from before any UI code. The screens today grew feature by feature: the
Week View (`src/app/page.tsx`, ~600 lines) stacks sync, today card, season targets, load,
80/20, recovery, check-in, week checks, proposals, gym questions, the plan and each run's
detail in one long scroll. Everything is there; the problem is **priority**: the two questions you
open the app for ("what do I do today?" and "is anything wrong?") compete with a lot of numbers.

Four directions, each borrowed from apps that do one thing well. They can be mixed (see the end).
Numbers in the wireframes are illustrative, not your data.

---

## A. Today-first (WHOOP, Oura, Garmin Morning Report)

**Idea:** one screen answers "am I ready, and what do I do today?". Everything else is one tap away.

```
┌────────────────────────────────┐
│ Fri 16 Oct            ● synced │
│ ┌────────────────────────────┐ │
│ │ 🟢 Ready                    │ │  HRV 93 (normal 66) · RHR 47 · 8h36
│ └────────────────────────────┘ │
│ TODAY                          │
│ Easy run · 8 km · HR < 152     │
│ [ Start ]   [ Done ✓ ]         │
│                                │
│ ⚠ 2 things need you            │
│  · Cowork: 5 sessions to approve│
│  · Calves 2 days ≥ 2           │
│                                │
│ This week  ▓▓▓▓░░ 28/42 km     │
│ Padova     3:31 · on track     │
└────────────────────────────────┘
```

- **Borrow:** WHOOP's single readiness colour with the 3 inputs under it; Oura's "your
  day" order; Garmin's morning report sequence (sleep → readiness → today's workout).
- **Pros:** the fastest answer. It's where Readiness (#1) naturally lives, and it gives a clear home
  for the push-notification taps.
- **Cons:** you need a second screen for the week; numbers fans lose their dashboard home.

## B. Coach feed (Runna, Future, TrainingPeaks notes)

**Idea:** the app talks to you like a coach: a timeline of cards, newest first.

```
┌────────────────────────────────┐
│ Coach                          │
│ ┌ Sun 20:12 · Cowork ────────┐ │
│ │ Next week: 5 runs, 42 km.  │ │
│ │ Key: long run 18 km.       │ │
│ │ Why: build week 2 of 4 …   │ │
│ │ [ Approve all ] [ Review ] │ │
│ └────────────────────────────┘ │
│ ┌ Today ─────────────────────┐ │
│ │ Easy run 8 km  [ Start ]   │ │
│ └────────────────────────────┘ │
│ ┌ Yesterday · how did it go? ┐ │
│ │ Tempo 7.4 km  😀 🙂 😐 😣   │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- **Borrow:** Runna's workout cards with a one-line "why"; Future's human-coach tone and the
  "how did it feel" loop after each session; TrainingPeaks' coach comments on the workout.
- **Pros:** Cowork's rationale finally gets a visible place; approvals and feedback flow
  naturally; it feels like a PT.
- **Cons:** a feed is weak for planning ahead and for "where am I in the week".

## C. Plan calendar (TrainingPeaks, intervals.icu, Final Surge)

**Idea:** the week (and the block) as a calendar with compliance colours.

```
┌────────────────────────────────┐
│ Week 42 · Base 1 (2/4)   ‹  ›  │
│ M   T   W   T   F   S   S      │
│ ●   ●   ◐   ○   ·   ○   ○      │   ● done  ◐ changed  ○ planned  ✕ missed
│ 8k  gym 7k  T   –   18k gym    │
│ ───────────────────────────── │
│ Wed 14 · Easy 7 km             │
│ done 6.96 km · 6:28 · HR 145   │
│ [ splits · laps · HR drift ▾ ] │
│ ───────────────────────────── │
│ Week: 28/42 km · load 410/520  │
└────────────────────────────────┘
```

- **Borrow:** TrainingPeaks' green/yellow/red compliance; intervals.icu's dense week row with
  load; Final Surge's tap-a-day detail.
- **Pros:** best for planning, moving sessions and seeing the shape of the block; it matches
  how Cowork thinks (weeks).
- **Cons:** today's call is one row among seven; recovery/readiness has no obvious home.

## D. Goal dashboard (Runna race view, Garmin race widget, Strava progress)

**Idea:** everything framed by Padova: countdown, prediction, are you on track.

```
┌────────────────────────────────┐
│ Padova · 184 days              │
│ 3:31  (3:25–3:38)   target 3:30│
│ ├──────────●┼──────────┤       │
│ Fitness ▲  Shape 45% ▲  HR@MP ▼│
│ ───────────────────────────── │
│ Base 1 ▓▓░ Build ░░ Spec ░ Pk ░│
│ Next key sessions              │
│  · Sat 18 km long              │
│  · Wed tempo 3×10′             │
└────────────────────────────────┘
```

- **Borrow:** Runna's race countdown + plan phases; Garmin's race widget (prediction + days);
  Strava's progress charts (trend lines, not tables).
- **Pros:** motivating; makes the long game visible; the new prediction card fits here.
- **Cons:** it doesn't tell you what to do today; it's a weekly look, not a daily one.

---

## Recommendation: a hybrid in four tabs

| Tab | From | What's on it |
|---|---|---|
| **Today** (home) | A + B | Readiness colour → today's session with one big action → "needs you" cards (approvals with Cowork's why, check-in, warnings) → one line each for the week and Padova |
| **Plan** | C | Week calendar with compliance colours, tap a day for detail (splits, laps, feedback), block strip on top |
| **Progress** | D | Padova prediction + race pace, load / 80/20, recovery trends, strength |
| **Gym** | (today's logger) | unchanged, plus the templates |

Cross-cutting rules (a small design system):
- **One card anatomy everywhere**: title line (small caps) → one big number or sentence →
  one action → details folded ("How it's built", "Splits · laps").
- **Colour means something**: green = on track / ready, amber = look, red = act; the accent
  colour only for actions.
- **Progressive disclosure**: the first screen of each tab answers one question; numbers move
  one tap down.
- **Thumb-first**: primary actions at the bottom half, big touch targets, the push notification
  taps land on the card they talk about.

Next step if you like the direction: a screen-by-screen spec (what moves where, what's
removed), then code in small PRs (Today first).
