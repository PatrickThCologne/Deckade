/**
 * Opens the feedback dialog from the info menu and turns the form into an e-mail
 * (lib/feedback.ts). Without JavaScript the menu entry stays a plain mailto link.
 */
import { feedbackMail } from '../lib/feedback';

export function initFeedback(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-feedback-dialog]');
  const form = dialog?.querySelector<HTMLFormElement>('[data-feedback-form]');
  if (!dialog || !form) return;

  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-feedback-open]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      link.closest('details')?.removeAttribute('open');
      dialog.showModal();
    });
  }
  for (const button of dialog.querySelectorAll('[data-feedback-close]')) {
    button.addEventListener('click', () => dialog.close());
  }
  // The form fills the dialog, so a click on the dialog itself is a click on the backdrop
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    window.location.href = feedbackMail(form.dataset.address ?? '', form.dataset.subject ?? '', {
      topic: String(fields.get('topic') ?? ''),
      message: String(fields.get('message') ?? ''),
      page: window.location.href,
    });
    // The text stays in the form for anyone whose mail program does not open
    dialog.querySelector('[data-feedback-sent]')?.removeAttribute('hidden');
  });
}
