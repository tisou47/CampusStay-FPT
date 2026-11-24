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

## Review 2 forms (BM01–BM04, refilled from the code on 23/11/2026)

- Left empty for people to fill: BM04 reviewers' names, "Approved at Review 2", required fixes (section 9), reviewers' verification and signatures; BM03 section 3 (reviewers' decision).
- Check the names in BM03 "Proposed by" and the owners of decisions D1–D5 (BM01 §3): they repeat the Review 2 submission; rows 7 and 8 of BM03 are new.
- Workflow owners follow git authorship: WF-01 Trung, WF-02 and WF-03 Lộc, WF-04 and WF-05 Luân. Duy owns no main workflow (the form asks each member to own one): the team should pick one for Duy, then run `node tools/docs/src/forms.mjs` again.
- BM02 keeps the AI findings of the 28/10 run as they were; each Planned finding got its status on 23/11. Still open: SR-06 (load test), SR-11 (production index check), SR-13 (Term never Closed), SR-15 (reopen not limited), SR-27 (contract A-53, A-54).
- The Topic form was not edited: `docs/Topic/TOPIC-CHECK.md` lists where it differs from the system.
- BM04 sections 6.x ("Pass criteria at Defense 1.1") and 8.4 (agreed thresholds for workflows and demo scenarios): the results of the demo runs are left empty. Fill them after you run each scenario on staging.

## Report 7

- The Acknowledgement thanks Ms. Thân Thị Ngọc Vân for "her weekly guidance and her feedback at every review". Confirm or reword it.

## Report 5: system tests, exception matrix, AI assistant (24/11/2026)

- Run the 16 system tests ST-01…ST-16 (Report 5 §4.15, sheet "System tests" of the Test Report) on the deployed system with the demo stages they name. Keep a screenshot of each result, then mark Passed or Failed. Until then they stay Pending: nobody has run them.
- Read the Exception Scenario Matrix (Report 5 §4). It files each test case under a "what if…" by the words of its description, so a few may sit under the wrong question. The six situations marked "—" have no test: add one, or prepare the answer for the defense.
- AI assistant (Report 3 §4.2.7): rate it on a fixed set of questions taken from the guide (for example 30, in both languages), count the correct answers, and give me the result to put in the report.
