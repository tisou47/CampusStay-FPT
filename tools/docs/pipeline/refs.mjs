// Removes references to documents a reader of the reports cannot open: the internal specification ("spec §6.8",
// "spec D-21", "D-27"), the Decision Log ("ADR-19"), the API contract ("contract A-71", "A-30") and the review findings
// ("BE-AUTH-02", "WEB-ADM-02", "REPO-10", "SR-06", "Wave 1 regression"). Used by md2html.mjs and report5.mjs.
// Contract numbers have two digits (A-01…A-80); Room codes such as A-801 have three or more, so they stay.
const REF = String.raw`(?:spec\s+(?:§[\d.]+|D-\d+)|D-\d+|ADR-\d+|(?:contract\s+)?[A-C]-\d{2}\b|(?:BE|WEB|REPO|MOB)-[A-Z0-9]+(?:-\d+)?|SR-\d+|Wave\s+\d\s+regression)`
const RUN = String.raw`${REF}(?:\s*(?:,|;|and)\s*${REF})*`

export function stripRefs(text) {
  let s = text
  // A title that starts with a review finding: "(Wave 1 regression): BE-AUTH-02: …", "(BE-3RD-05): …",
  // "BE-ASG-06 (uses …): …".
  s = s.replace(new RegExp(String.raw`^\(Wave\s+\d\s+regression\):\s*${REF}:\s*`), 'Regression: ')
  s = s.replace(new RegExp(String.raw`^\(${RUN}\):\s*`), '')
  s = s.replace(new RegExp(String.raw`^${REF}\s*(?:\([^)]*\))?:\s*`), '')
  s = s.replace(new RegExp(String.raw`^\([^)]*${REF}[^)]*\):\s*`), '')
  s = s.replace(new RegExp(String.raw`(finding)\s+${REF}`, 'g'), '$1')
  // A parenthesis of references only, or references heading a longer parenthesis.
  s = s.replace(new RegExp(String.raw`\s*\(\s*${RUN}\s*\)`, 'g'), '')
  s = s.replace(new RegExp(String.raw`(\()\s*${RUN}[,;:]?\s+`, 'g'), '$1')
  // A list of references closing a sentence ("…: ADR-29, contract A-69."), then bare spec sections.
  s = s.replace(new RegExp(String.raw`[:,]\s*${RUN}(?=\s*[.;]|$)`, 'g'), '')
  s = s.replace(/\s+of\s+spec\s+§[\d.]+/g, '').replace(/\s*spec\s+§[\d.]+/g, '')
  return s.replace(/\s+([,.;:])/g, '$1')
}
