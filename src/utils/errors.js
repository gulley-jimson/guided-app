export const ERROR_MESSAGES = {
  auth: 'Your API key looks incorrect — head to Settings to update it.',
  generic: 'Something went wrong — check your API key in Settings or try again.',
};

export function classifyError(err) {
  if (!err) return 'generic';
  if (err.status === 401) return 'auth';

  const innerType = err?.error?.error?.type ?? err?.error?.type;
  if (innerType === 'authentication_error' || innerType === 'permission_error') {
    return 'auth';
  }

  const name = err?.constructor?.name ?? err?.name ?? '';
  if (/^Authentication|^PermissionDenied/i.test(name)) return 'auth';

  if (typeof err.message === 'string' && /\b401\b|unauthorized|invalid.*api.*key/i.test(err.message)) {
    return 'auth';
  }

  return 'generic';
}
