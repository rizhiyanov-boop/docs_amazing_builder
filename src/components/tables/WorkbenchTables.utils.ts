export function isRequired(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return value === '+' || value === 'Да' || normalized === 'true' || value === '1' || normalized === 'required';
}
