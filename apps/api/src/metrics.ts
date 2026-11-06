import { EVENT_LABEL, type EventType, type MetricsDto } from '@lingjing/shared';
import type { Repo } from './db.ts';
import { jobView, presentSession } from './present.ts';

const FUNNEL: EventType[] = ['browse', 'try_on', 'add_to_cart'];

export function collectMetrics(repo: Repo): MetricsDto {
  const baseline = repo.baselines();
  let liveReady = 0;
  let liveFailed = 0;
  let queue = 0;
  let running = 0;
  for (const row of repo.jobStatusCounts()) {
    if (row.origin === 'live' && row.status === 'ready') liveReady += row.n;
    if (row.origin === 'live' && row.status === 'failed') liveFailed += row.n;
    if (row.status === 'queued' || row.status === 'running') queue += row.n;
    if (row.status === 'running') running += row.n;
  }
  const events = repo.countEvents();
  const uploadSucceeded = (baseline.upload_ok ?? 0) + liveReady;
  const uploadFailed = (baseline.upload_fail ?? 0) + liveFailed;
  const uploadTotal = uploadSucceeded + uploadFailed;
  return {
    uploadSuccessRate: uploadTotal === 0 ? 1 : uploadSucceeded / uploadTotal,
    uploadSucceeded,
    uploadFailed,
    rebuildQueueDepth: queue,
    rebuildRunning: running,
    tryOnSessions: (baseline.sessions ?? 0) + repo.countSessions('live'),
    profiles: repo.countProfiles(),
    funnel: FUNNEL.map((key) => ({
      key,
      label: EVENT_LABEL[key],
      count: (baseline[key] ?? 0) + (events[key] ?? 0),
    })),
    recentJobs: repo.listJobs().slice(0, 8).map((job) => jobView(repo, job)),
    recentSessions: repo
      .listSessions()
      .slice(0, 6)
      .map((session) => presentSession(session, repo.latestOutfitName(session.id))),
    updatedAt: new Date().toISOString(),
  };
}
