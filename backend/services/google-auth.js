import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client();
export async function verifyGoogleCredential(credential, verifier = client) {
  const audience = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  if (!audience) throw Object.assign(new Error('Google sign-in is not configured on this server.'), { status: 503 });
  if (typeof credential !== 'string' || credential.length > 16000) throw Object.assign(new Error('Invalid Google credential.'), { status: 400 });
  try {
    const ticket = await verifier.verifyIdToken({ idToken: credential, audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) throw new Error('Unverified identity');
    return payload;
  } catch {
    throw Object.assign(new Error('Google sign-in could not be verified. Please sign in again.'), { status: 401 });
  }
}
