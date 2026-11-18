// Keep operational errors useful without leaking database credentials or URLs.
export function safeErrorDetails(error) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const message = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[redacted database URL]')
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .slice(0, 300);
  const code = typeof error?.code === 'string' && /^[a-z0-9_-]{1,20}$/i.test(error.code) ? error.code : undefined;
  return {
    name: typeof error?.name === 'string' ? error.name.slice(0, 80) : 'Error',
    ...(code ? { code } : {}),
    message
  };
}
