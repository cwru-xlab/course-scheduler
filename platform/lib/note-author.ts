/** Characters before `@` in the user's email (login user id). */
export function emailUserId(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email.trim() : email.slice(0, at).trim();
}

/** Note signature: display name from login, then user id in parentheses. */
export function formatNoteAuthor(user: { name: string; email: string }): string {
  const name = user.name.trim();
  const id = emailUserId(user.email);
  return name ? `${name} (${id})` : `(${id})`;
}
