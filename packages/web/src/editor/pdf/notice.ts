// A failure of Save PDF or Print… that the review shows as it is, without
// «The PDF could not be made.» above it: the PDF is fine, the browser is not
// letting it through.
export class NoticeError extends Error {
  override name = 'NoticeError';
}

export const POPUPS_BLOCKED = 'Allow pop-ups for this site to print.';
