export async function bodyOf(req) {
  return req.body ?? {};
}
