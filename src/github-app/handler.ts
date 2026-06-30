import { Probot } from 'probot';
import type { ExternalIssuePayload } from './types';
import { loadSyncConfig } from './config';
import { buildDedupeKey, claimDelivery, finaliseDelivery } from './dedupe';
import { syncIssueToTracker } from './sync';
export default (app: Probot) => {
  const config = loadSyncConfig();
  app.on('issues.opened', async (context) => {
    const issue = context.payload.issue;
    const repo = context.payload.repository;
    const key = buildDedupeKey((context as any).id ?? issue.node_id);
    if (!claimDelivery(key)) { context.log.info({ key }, 'Duplicate delivery ignored'); return; }
    const payload: ExternalIssuePayload = {
      title: issue.title, body: issue.body ?? '',
      githubUrl: issue.html_url, issueNumber: issue.number,
      repoFullName: repo.full_name, deliveryKey: key,
    };
    try {
      await syncIssueToTracker(payload, config);
      finaliseDelivery(key, 'completed');
      context.log.info({ key, issueNumber: issue.number }, 'Issue synced');
    } catch (error) {
      finaliseDelivery(key, 'failed');
      context.log.error({ key, error }, 'Issue sync failed');
      throw error;
    }
  });
};
