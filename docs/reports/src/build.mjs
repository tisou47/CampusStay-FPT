// Builds the reports: node docs/reports/src/build.mjs [Report1 Report3 ...] (default: all). Needs Word (Windows).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const cover = 'Ho Chi Minh City, October 2026';
const team = 'Lê Thành Minh Trung';
const tpl = (f) => `templates/SEP490_docs/${f}.docx`;
const REPORTS = {
  Report1: { template: tpl('Report1_Project Introduction'), changes: [
    ['28/10/2026', 'A', team, 'First version for Review 2: project information, team, background with the basis for the requirements (Review 1 feedback), existing systems, business opportunity, vision, scope and limitations'],
  ] },
  Report2: { template: tpl('Report2_Project Management Plan'), changes: [
    ['28/10/2026', 'A', team, 'First version for Review 2: scope and estimation, objectives, risks, process, quality, training, deliverables, responsibilities, communication, configuration management'],
  ] },
  Report3: { template: tpl('Report3_Software Requirement Specification'), changes: [
    ['28/10/2026', 'A', team, 'First version for Review 2: product overview, actors and use cases, screen flows and authorization, non-screen functions, ERD, functional requirements per feature, non-functional requirements, business rules, messages'],
  ] },
  Report4: { template: tpl('Report4_Software Design Document'), changes: [
    ['28/10/2026', 'A', team, 'First version for Review 2: architecture, technologies and AI tools, environments, packages, database design (logical ERD), state machines, activity diagrams of the main workflows, detailed design'],
  ] },
  Report5: { template: tpl('Report5_Test Documentation'), changes: [
    ['28/10/2026', 'A', team, 'First version for Review 2: scope, strategy, levels and tools, test plan, test case design for mandatory features, workflows, state transitions and NFRs, test report of the automated suite'],
  ] },
};
const pick = process.argv.slice(2);
for (const [name, r] of Object.entries(REPORTS)) {
  if (pick.length && !pick.includes(name)) continue;
  const html = `docs/reports/build/${name}.html`;
  execFileSync('node', [path.join(root, 'docs/tools/md2html.mjs'), path.join(here, `${name}.md`), path.join(root, html)], { stdio: 'inherit' });
  const cfg = path.join(root, `docs/reports/build/${name}.json`);
  fs.writeFileSync(cfg, JSON.stringify({ template: r.template, html, out: `docs/reports/out/SWP490_FA26SE260_R2_${name}`,
    coverDate: cover, bodyStart: 'II.', changes: r.changes }, null, 1));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'docs/tools/build-report.ps1'), '-Config', cfg], { stdio: 'inherit' });
}
