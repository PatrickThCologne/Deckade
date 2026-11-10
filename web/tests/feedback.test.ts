import { describe, expect, it } from 'vitest';
import { feedbackMail } from '../src/lib/feedback';
import { mailto } from '../src/lib/links';

describe('mailto', () => {
  it('fills in only the subject when there is no text', () => {
    expect(mailto('a@example.com', 'Hi & bye')).toBe('mailto:a@example.com?subject=Hi%20%26%20bye');
  });

  it('writes line breaks in the text as CRLF', () => {
    expect(mailto('a@example.com', 'S', 'one\ntwo')).toBe(
      'mailto:a@example.com?subject=S&body=one%0D%0Atwo',
    );
  });
});

describe('feedbackMail', () => {
  it('puts the topic into the subject and the page under the message', () => {
    const link = new URL(
      feedbackMail('a@example.com', 'Feedback zu Deckade', {
        topic: 'Fehler',
        message: '  Preis von Opt fehlt  ',
        page: 'https://example.com/de/sets/dsk/',
      }),
    );

    expect(link.pathname).toBe('a@example.com');
    expect(link.searchParams.get('subject')).toBe('Feedback zu Deckade · Fehler');
    expect(link.searchParams.get('body')).toBe(
      'Preis von Opt fehlt\r\n\r\n--\r\nhttps://example.com/de/sets/dsk/',
    );
  });
});
