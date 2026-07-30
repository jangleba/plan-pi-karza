# Plan Piłkarza

TASK:

Build the first working mobile-first MVP of Loadwise from scratch.

CONTEXT:

Loadwise is a football performance decision app for football players aged 13+. It is not a medical, diagnostic, rehab, or injury-treatment app. The core value is: decision-first training planning. The app should tell the player what to do today, why, and how hard, based on age, position, goal, match proximity, club training, readiness, pain/injury status, and available equipment.

LANGUAGE:

The whole visible app must be in Polish. No mixed English/Polish UI.

STYLE:

Premium, clean, Apple-like, mobile-first. Minimalist white/light interface with dark navy/deep blue accents, soft cards, rounded corners, clear typography. No childish gamification, no XP, no levels, no “Player DNA”, no “signature moves”.

MAIN NAVIGATION:

Create bottom navigation with exactly:

Start

Plan

AI Aparat

Scouting

Profil

ONBOARDING:

Create a short smart onboarding. Required fields only:

- name

- age

- position: goalkeeper, defender, midfielder, forward

- training level: beginner, intermediate, advanced

- main goal: speed, strength, endurance, mobility, return to rhythm, match readiness

- club training days

- next match day or match date

- available equipment

- pain/injury: yes/no

Rules:

- Support age 13+.

- If age is 13–17, show simple guardian/parent consent checkbox.

- Optional fields must not block plan generation.

- After onboarding, save the profile, mark onboarding as complete, generate the first 7-day forward-looking plan, and redirect to the Plan screen.

- Never send the user back to the start of onboarding after valid submission.

PLAN ENGINE:

Create a safe fallback plan generator in code. It must always generate a plan after onboarding.

Planning rules:

- Plan only forward from the current real date.

- Do not create workouts for past days.

- Use Europe/Warsaw timezone.

- If match date is missing, generate a safe 7-day plan anyway.

- Club training counts as load.

- Match day and MD-1 must reduce intensity.

- No heavy lower body or large sprint volume on MD-1.

- Maximum high-intensity sprint volume per session: 240 m.

- Ages 13–15 should avoid heavy adult-style loading and risky complex plyometric/strength pairings.

- One primary adaptation per session.

- No junk volume.

- Readiness and pain override the training goal.

READINESS LOGIC:

On the Start screen, show a daily readiness check-in with:

sleep, energy, fatigue, muscle soreness, joint pain, stress, motivation, overall readiness 1–10.

Decision logic:

- 8–10: normal session or slight progression

- 6–7: reduce volume by 10–20%

- 4–5: reduce volume by 30–40% and remove heavy/high-intensity work

- 1–3: recovery, mobility, breathing, easy technical work only

- pain/injury yes: block intense sprinting, heavy lower body, and risky plyometrics

PLAN SCREEN:

Show the generated weekly plan as clear cards with real dates.

Each card should show:

- day/date

- session type

- main goal

- intensity

- estimated duration

- short reason why this session was chosen

- safety adjustment if applied

When tapping a session, open a detailed session view with:

- warm-up

- main part

- accessory/technical part

- cooldown

- sets/reps/time/distance/intensity/rest

- short “why this today?” explanation

For club training days, show a monitoring card, not fake exercises.

START SCREEN:

After onboarding, show:

- today’s decision

- next match info

- readiness status

- today’s plan card

- quick button to complete readiness

- quick button to open today’s session

AI APARAT:

Create the screen as a useful MVP placeholder for future AI testing:

- sprint test

- vertical jump

- broad jump

- running technique video

For now allow manual result entry and show simple history cards. Do not pretend real AI camera analysis exists yet.

SCOUTING:

Create a useful MVP screen, not empty and not fake.

Include:

- player strengths

- development priorities

- observation notes

- clubs/trials/opportunities list with empty state and add button

Do not add fake real clubs or fake scout data.

PROFIL:

Create a profile dashboard, not just a form.

Show:

- player basics

- goal

- position

- equipment

- training level

- consent status

- edit profile button

- legal/privacy placeholder section

- data export/delete placeholder buttons

LEGAL/SAFETY:

Add clear disclaimer:

“Loadwise pomaga podejmować mądrzejsze decyzje treningowe w piłce nożnej. Nie diagnozuje, nie leczy i nie zastępuje konsultacji medycznej.”

DO NOT:

- Do not create generic fitness app logic.

- Do not create workouts without football context.

- Do not use fake past data.

- Do not generate null, undefined, NaN, or Invalid Date.

- Do not mix languages.

- Do not add XP, levels, Player DNA, or game character logic.

- Do not make the onboarding long.

- Do not block plan generation because optional data is missing.

ACCEPTANCE TEST:

After finishing, the app must pass this flow:

1. Open app.

2. Complete short onboarding for a 16-year-old midfielder.

3. Submit onboarding.

4. App saves profile.

5. App generates a forward-looking 7-day plan.

6. App redirects to Plan screen.

7. Tapping a session opens full details.

8. Start screen shows today’s decision and readiness check-in.

9. Bottom nav contains only Start, Plan, AI Aparat, Scouting, Profil.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/de7e9c03-6af5-4ba0-9a0c-426417d42531).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
