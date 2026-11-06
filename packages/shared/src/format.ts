export function formatYuan(cents: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

export function ageFromBirthday(iso: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  if (age < 1 || age > 120) return null;
  return age;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
