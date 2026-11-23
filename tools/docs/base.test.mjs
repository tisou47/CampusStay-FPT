import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { TEMPLATE_BASE } from './base.mjs'

test('the template base is a commit of this history, before any document was filled', () => {
  execFileSync('git', ['merge-base', '--is-ancestor', TEMPLATE_BASE, 'HEAD'])
  const tpl = execFileSync('git', ['show', `${TEMPLATE_BASE}:docs/SEP490_R2_BM04_Review2-Document/SWP490_R2_BM01_Design_Brief_1.docx`])
  assert.ok(tpl.length > 0)
})
