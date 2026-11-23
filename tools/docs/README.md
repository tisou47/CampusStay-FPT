# tools/docs — documents built from the code

The SEP490 documents in `docs/` are filled **from the code**. Generators read the code and write `data/*.json`. Every list and number in the documents comes from those files. The text is written in `src/*.md`, and Word/Excel pour it into the school templates in place.

## Requirements
- Node 20+.
- Windows PowerShell with **Microsoft Word and Excel**: the build drives them through COM.
- Docker, for the schema.
- A recent `mvn -B -o verify` in `backend/`, for the test results.
- Flutter, for the mobile test results.

## Order
```powershell
node tools/docs/gen/run.mjs all          # code, schema, states, tests, history, facts → tools/docs/data/
node --test tools/docs/gen/              # the parsers' own tests
node tools/docs/build.mjs Report1        # src/Report1.md → docs/SEP490_Report/Report1_Project Introduction.docx + .pdf
```

`build.mjs` always starts from the template as it was at the branch base (`git show <merge-base>:<path>`), so a rebuild is safe. After every build it runs `check-docx.ps1`, which fails when any of the following is true:
- a heading of the template is missing;
- the table of contents is missing;
- the Record of Changes is empty;
- template placeholder text (`<<…>>`, `System name1`, …) is left.

## Files
| Path | What |
|---|---|
| `gen/parse.mjs`, `gen/parse.test.mjs` | pure parsers: controllers, security rules, permissions, routes, mobile screens, CHECK constraints, status transitions, messages, test ids, JUnit XML, git log |
| `gen/run.mjs` | reads the repository and writes `data/endpoints.json`, `permissions.json`, `screens.json`, `messages.json`, `schema.json`, `states.json`, `tests.json`, `history.json` and `facts.json` |
| `outlines/*.json` | heading outline of each school template, captured before it was filled (`outline.ps1`); `templates.json` maps a document name to its file |
| `check-docx.ps1`, `docx-xml.ps1` | the document check, reading the `.docx` XML without Word |
| `pipeline/` | Markdown → HTML (`md2html.mjs`), HTML → template in Word (`build-report.ps1`), workbook filling (`fill-workbook.ps1`, `build-test-workbooks.ps1`), draw.io layout and PNG export (`drawio.mjs`, `drawio-page.js`) |
| `src/*.md`, `src/changes.json` | the documents' text, and their Record of Changes rows |
