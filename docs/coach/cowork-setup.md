# Cowork PT: setup kit

Three things to paste: the project **instructions** (`cowork-instructions.md`), the **scheduled
task** prompt and the **first message** below. Full plan reference: `pt-brief.md`.

## 1. Create the project

1. Claude app → left sidebar **Projects** → **+** → **Start from scratch**. Name: `PT · Padova 2027`.
2. **Instructions**: paste the whole of `cowork-instructions.md`.
3. Connectors: **Customize → Connectors** → make sure **Supabase** is connected (it's on your
   account). In a task, the **+** menu in the message box shows which connectors are on.

## 2. First message (in a new task inside the project)

```
Hi, you're my PT from today. Read your project instructions.
1) Run: select count(*) from activities;  and tell me the number (to check your data access).
2) Read this week's proposed sessions (week of 5 Oct) and the season targets, and tell me if you'd change anything.
3) Remember: you only propose, I approve in the app.
```

If step 1 fails, the Supabase connector isn't on for this project: enable it from the **+** menu.

## 3. Scheduled task: weekly review

In the project: **Scheduled tasks** → **New task** → **Set up manually** (or type `/schedule`).

- Name: `Weekly review`
- Frequency: **weekly, Sunday 20:00**
- Prompt:

```
Weekly review for Tommaso. Follow the "Weekly check-in" section of the project instructions:
read the last 7 days, check-ins, flags and the season targets for last and next week; review last
week in max 5 lines; plan next week within its targets on Tue/Thu/Sat/Sun unless I told you other
days this week; insert the sessions into weekly_plans as status 'proposed' (check for duplicates
first); reply in the output format. Flag anything about calves, sleep, illness or ACWR above 1.3.
```

It runs even with the computer off and uses the Supabase connector. If it pauses for permission
on database writes, allow `execute_sql` for this task: it only ever inserts proposals.

## 4. Your weekly rhythm

| When | You | PT (Cowork) | App |
|---|---|---|---|
| After each workout | Fill the feedback card (RPE, feeling, notes) | – | Garmin syncs by itself |
| 2× a week | Check-in (sleep, soreness, stress) | – | – |
| Sunday 20:00 | Read the review, send availability if different | Review + next week as proposals | Shows proposals |
| Sunday/Monday | **Approve week** (or edit days) on the Week View | – | Approved plan |
| Anytime | Ask questions ("calves sore, run today?") in the project | Answers within the plan | – |
| Plan change | Approve or reject on the Season page | Proposes a new season version | Shows the diff + checks |

## 5. When to come to Claude Code instead

Only for the app itself: a feature, a bug, a new metric. Open a Claude Code session on
`tommm-mm/trainer`, describe what you want and why. You get a plan and questions first, then a PR
with a preview link. Nothing is merged without your OK.
