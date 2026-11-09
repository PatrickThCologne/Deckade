// Run with: node --test .claude/hooks/agent-guard-rules.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { refusal } from './agent-guard-rules.mjs';

const edit = (path) => ({ tool_name: 'Edit', tool_input: { file_path: path } });
const shell = (command) => ({ tool_name: 'Bash', tool_input: { command } });

describe('agent guard', () => {
  it('lets the test writer change test files only', () => {
    assert.equal(refusal('tests-only', edit('C:\\repo\\web\\tests\\cards.test.ts')), null);
    assert.equal(refusal('tests-only', edit('/repo/pipeline/tests/test_art.py')), null);
    assert.match(refusal('tests-only', edit('/repo/web/src/lib/cards.ts')), /Only test files/);
  });

  it('keeps the implementer away from the tests', () => {
    assert.match(refusal('no-tests', edit('/repo/web/tests/contract/snapshot.json')), /Tests/);
    assert.match(refusal('no-tests', edit('/repo/.claude/hooks/x.test.mjs')), /Tests/);
    assert.equal(refusal('no-tests', edit('/repo/pipeline/src/rotation_radar/build.py')), null);
    assert.equal(refusal('no-tests', shell('npm test')), null);
  });

  it('lets the reviewer read and run the checks, nothing else', () => {
    assert.match(refusal('read-only', edit('/repo/README.md')), /changes no files/);
    for (const command of ['git diff main...HEAD', 'npm run check', 'python -m pytest -q']) {
      assert.equal(refusal('read-only', shell(command)), null, command);
    }
    for (const command of ['git checkout -- .', 'git diff > out.txt', 'npm test && rm x']) {
      assert.match(refusal('read-only', shell(command)), /Only reading git/, command);
    }
  });

  it('allows tools it does not know about', () => {
    assert.equal(refusal('read-only', { tool_name: 'Read', tool_input: {} }), null);
  });
});
