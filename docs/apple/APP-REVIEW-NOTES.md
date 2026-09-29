# App Review Notes — draft (English)

Draft aligned with repository code on 29 September 2026. Complete the review
access fields and verify the actual submitted build before copying these notes
to App Store Connect. This document is not evidence of deployment or device testing.

BallWise is a football training-planning and session-execution app. It is not a
medical device and does not diagnose, treat, or rehabilitate injuries.
Training recommendations use rule-based scheduling, the athlete profile, club
and match calendar, completed training, and user-provided context. The daily
plan decision lets athletes keep or adjust their schedule. Health/readiness
processing remains a separate, optional consent-based capability; declining or
withdrawing consent leaves the app usable with conservative defaults.

Football IQ provides interactive match situations. Fuel suggests meals from
entered ingredients and training context. Its current product lookup uses
Open Food Facts: the user enters a barcode or, where browser support exists,
selects a barcode image decoded on device. Optional speech input uses the
browser's speech-recognition service; text entry remains available. The
repository's meal-photo analysis Edge Function is not connected to this UI.

BallWise Lab uses the native iOS camera plugin to record supported sports tests
at 240 FPS. Users manually select event frames; timestamps are used for jump
flight time and timed running sections. The app keeps working video locally and
attempts removal after saving the result. Supabase receives measurement results
and timing/quality metadata, not the video. A compatible physical iPhone is
required; web/PWA does not provide this native capture. These are sports
measurements, not medical assessments. The retired Vision Lab is a separate
legacy feature.

Accounts for athletes aged 13–15 use a parent/guardian-owned account, a confirmed
owner email, and a guardian declaration. Email confirmation proves control of
the address; the app does not verify legal guardianship or identity documents.
Users under 13 can access a public demo, but cannot create a personalized profile.

Account deletion: **Profil → Moje dane i prawa → Usuń konto i dane**.
StoreKit/IAP is not implemented in the current repository. There are no
subscription-management or restore-purchase screens to describe. If the
submitted build introduces purchases, replace this paragraph and verify every
purchase path before submission.

## Review access — pending completion

- Submitted version/build and backend environment: [INSERT]
- Full-access test account and login steps: [INSERT IN APP STORE CONNECT; DO NOT COMMIT CREDENTIALS]
- Public demo: open `/demo`; this does not replace full review access.
- Lab: open the Lab tab; specify supported device models, test setup and review instructions: [INSERT]
- Privacy policy URL: [INSERT PUBLIC HTTPS URL]
- Support URL: [INSERT PUBLIC HTTPS URL]

Outstanding release checks, including export completeness and local-data
cleanup, are tracked in the [release checklist](../RELEASE-CHECKLIST.md).
