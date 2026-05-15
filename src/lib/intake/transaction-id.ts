function sanitizeCodePart(input: string, fallback: string): string {
  const normalized = input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
  return normalized || fallback;
}

function formatDateUtcYYYYMMDD(date: Date): string {
  const year = date.getUTCFullYear().toString();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function buildIntakeTransactionId(params: {
  clientCode: string;
  projectCode: string;
  sequence: number;
  now?: Date;
}): string {
  const date = formatDateUtcYYYYMMDD(params.now ?? new Date());
  const client = sanitizeCodePart(params.clientCode, "CLIENT");
  const project = sanitizeCodePart(params.projectCode, "PROJECT");
  const sequence = Math.max(1, Math.trunc(params.sequence || 1))
    .toString()
    .padStart(4, "0");
  return `INTAKE-${client}-${project}-${date}-${sequence}`;
}
