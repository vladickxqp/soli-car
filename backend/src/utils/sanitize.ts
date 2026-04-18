const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const sanitizeInlineText = (value: string) =>
  value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();

export const sanitizeMultilineText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
