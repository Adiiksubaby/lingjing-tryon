import { JOB_STATUS_LABEL, SKU_STATUS_LABEL, type JobStatus, type SkuStatus } from '@lingjing/shared';

export function StatusPill({ status, kind }: { status: SkuStatus | JobStatus; kind: 'sku' | 'job' }) {
  const label = kind === 'job' ? JOB_STATUS_LABEL[status as JobStatus] : SKU_STATUS_LABEL[status as SkuStatus];
  return <span className={`pill ${status}`}>{label}</span>;
}
