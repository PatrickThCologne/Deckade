/**
 * PreToolUse hook for the agents in .claude/agents. Usage in an agent's frontmatter:
 *
 *   node "$CLAUDE_PROJECT_DIR/.claude/hooks/agent-guard.mjs" <mode>
 *
 * Reads the tool call as JSON on stdin; exit code 2 blocks it and shows the agent why.
 * The modes are described in agent-guard-rules.mjs.
 */
import { readFileSync } from 'node:fs';

import { refusal } from './agent-guard-rules.mjs';

const reason = refusal(process.argv[2] ?? '', JSON.parse(readFileSync(0, 'utf8')));
if (reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}
