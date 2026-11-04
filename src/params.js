export function parseTurnChance(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}
