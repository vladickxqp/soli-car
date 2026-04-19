const VERIFICATION_PREVIEW_PREFIX = "soli-car-verification-preview:";

const buildVerificationPreviewKey = (email: string) =>
  `${VERIFICATION_PREVIEW_PREFIX}${email.trim().toLowerCase()}`;

export const storeVerificationPreview = (email: string, previewUrl?: string | null) => {
  if (!email) {
    return;
  }

  const key = buildVerificationPreviewKey(email);

  if (previewUrl) {
    sessionStorage.setItem(key, previewUrl);
    return;
  }

  sessionStorage.removeItem(key);
};

export const readVerificationPreview = (email: string) => {
  if (!email) {
    return null;
  }

  return sessionStorage.getItem(buildVerificationPreviewKey(email));
};

export const clearVerificationPreview = (email: string) => {
  if (!email) {
    return;
  }

  sessionStorage.removeItem(buildVerificationPreviewKey(email));
};
