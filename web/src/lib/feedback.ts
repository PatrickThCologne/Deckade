/**
 * The feedback form (components/layout/FeedbackDialog.astro) becomes an e-mail or a GitHub
 * issue: a static site cannot send either, so the visitor's mail program or GitHub opens with
 * everything filled in.
 */
import { mailto } from './links';

export interface Feedback {
  readonly topic: string;
  readonly message: string;
  /** The page the visitor was on, so a reported mistake can be found. */
  readonly page: string;
}

export function feedbackMail(address: string, subject: string, feedback: Feedback): string {
  const body = `${feedback.message.trim()}\n\n--\n${feedback.page}`;
  return mailto(address, `${subject} · ${feedback.topic}`, body);
}

/** Longest issue title taken from the message, so the list of issues stays readable */
const TITLE_CHARS = 60;

/**
 * A link to a new issue in `repo` (a GitHub repository URL) with the feedback filled in. The
 * title is the topic and the start of the message's first line.
 */
export function feedbackIssue(repo: string, feedback: Feedback): string {
  const message = feedback.message.trim();
  const firstLine = message.split('\n')[0]!.trim();
  const start =
    firstLine.length > TITLE_CHARS
      ? `${firstLine.slice(0, TITLE_CHARS - 1).trimEnd()}…`
      : firstLine;
  const title = `${feedback.topic}: ${start}`;
  const body = `${message}\n\n---\n${feedback.page}`;
  return `${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
