const ARRAY_SEGMENT_PATTERN = /\[(?:\d+|[oO])\]/g;

export function normalizeArrayFieldPath(path: string): string {
  if (!path) return path;
  return path.replace(ARRAY_SEGMENT_PATTERN, '[]');
}
