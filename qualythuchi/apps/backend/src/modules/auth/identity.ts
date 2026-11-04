export function accountUsername(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.trim())) throw new Error('Use a username of 1–64 letters, numbers, dots, underscores or hyphens.');
  return value.trim().toLowerCase();
}
