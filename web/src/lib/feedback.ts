/**
 * The feedback form (components/layout/FeedbackDialog.astro) becomes an e-mail: a static site
 * cannot send one, so the visitor's mail program opens with everything filled in.
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
