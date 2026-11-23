# TEAM-TODO: what the documents cannot know

The documents are written from the code. These facts are in nobody's repository, so the team has to supply them (or confirm what is written). Each item says where it goes.

## Report 2, weekly report and project tracking

- **Weekly report, weeks 1–6** (07/09–18/10/2026): what each member did. Only the calendar is known (analysis and design, Review 1 on 30/09). Sheets W1–W6 of `Project Weekly Report_GroupName.xlsx`.
- **Weekly report, every week**: "Next Week Plan" and "Other Project Matters/Suggestions", and the supervisor's remarks. Marked in the sheets.
- **Meetings**: minutes and attendance of the weekly supervisor meetings and of the team meetings (Report 2, section 5).
- **Project Tracking, sheet Q&A**: the questions asked to the supervisor and her answers.
- **Project Tracking, sheet Issues**: open and close dates of the risks that have none (Azure limits, single VM, knowledge concentration, the AI model server).
- **Project Tracking, WBS, column Planned**: the iteration each function was planned for. The workbook shows the week of its first commit on `main` instead.
- **Training** (Report 2, section 2.3): any formal training session members attended, with dates.
- **First commit**: the repository history starts on 20/10/2026 (week 7), and it already holds the first slices of the system. The reports say: weeks 1–6 analysis and design, implementation from week 7. You told us weeks 1–7 had no code: please confirm which is right, and whether any earlier repository should be credited.

## Review findings still open

- **BE-AUTH-01 (Critical)**: the demo accounts have the password `123` in production. Setting a strong password on the server is a production change that the leader decides.
- 155 Low findings and 17 ideas are deferred until after the defense (`review/REVIEW.md`).

## Test documentation

- Settled: `MeterRemindersIT.lateMonthIsFlaggedAndRemindedOnce` is now TC-BIL-050 (TC-BIL-040 stays on `FinanceIT`); the second TC-ASG-053 was a reading error of the document generator (a class comment taken as `tearDown`'s), fixed. Nothing left to do.

## Existing systems (Report 1, section 3)

- The booking steps of FPT's dormitory site OCD are behind a login that no team account (all are Ho Chi Minh City campus) can open, so they are not described.
- The app "iDorm" for the VNU-HCM dormitory could not be read at its source, so it is not described.
- RMS Mercury and Adirondack Solutions (added to Report 1 in Review 2) were not re-checked at their sources and are left out.

## Report 5

- Section 2.2 says the team walks through the main workflows on production with the demo data stages before each review. Confirm this is true, or tell me to remove the sentence.

## Report 6

- Build the APK (`flutter build apk --dart-define-from-file=config.json` in `mobile/`) and attach it to a GitHub release of the repository, so the deliverable package has the file Report 6 describes.
- The Family Day and work-schedule screenshots show empty pages (the demo data loads none). If you want fuller pictures, create a Family Day and plan a week on a local stack, then run `node tools/docs/screenshots.mjs A` and rebuild Report 6.
