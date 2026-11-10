/**
 * Rules of the PreToolUse hook that keeps each agent in .claude/agents to its part of the work
 * (agent-guard.mjs runs them):
 *
 *   tests-only  edits files only in test folders                      (test-writer)
 *   no-tests    edits no file in a test folder                        (implementer)
 *   read-only   edits nothing; the shell only reads git or runs checks (reviewer)
 *
 * Shell commands of the first two are not checked: they need the shell to run the tests, and
 * a command that writes files is not reliably recognisable. Their instructions forbid it.
 */

const TEST_FILE =
  /(^|[\\/])(web[\\/]tests|pipeline[\\/]tests)[\\/]|\.test\.(ts|mjs)$|(^|[\\/])test_[^\\/]*\.py$/;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const CHECK_COMMAND =
  /^(git (diff|log|show|status|blame)|npm (test|run (lint|check))|\S*python(\.exe)? -m (pytest|ruff check|ruff format --check|mypy))(\s|$)/;
const CHAINING = /[;&|<>`]|\$\(/;

/**
 * Why the tool call is not allowed in this mode, or null if it is.
 * @param {string} mode
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown> }} call
 * @returns {string | null}
 */
export function refusal(mode, call) {
  const tool = call.tool_name ?? '';
  const input = call.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    const path = String(input.file_path ?? input.notebook_path ?? '');
    const isTest = TEST_FILE.test(path);
    if (mode === 'tests-only' && !isTest) return `Only test files may be changed: ${path}`;
    if (mode === 'no-tests' && isTest) return `Tests may not be changed: ${path}`;
    if (mode === 'read-only') return 'The reviewer changes no files.';
    return null;
  }
  if (tool === 'Bash' && mode === 'read-only') {
    const command = String(input.command ?? '').trim();
    if (CHAINING.test(command) || !CHECK_COMMAND.test(command)) {
      return `Only reading git or running the checks, one command at a time: ${command}`;
    }
  }
  return null;
}
