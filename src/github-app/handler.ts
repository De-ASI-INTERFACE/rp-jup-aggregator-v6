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
    const rawId = (context as unknown as { id?: string }).id ?? issue.node_id;
    const key = buildDedupeKey(rawId);
    if (!claimDelivery(key)) {
      context.log.info({ key, issueNumber: issue.number }, 'Duplicate delivery ignored');
      return;
    }
    const payload: ExternalIssuePayload = {
      title: issue.title,
      body: issue.body ?? '',
      githubUrl: issue.html_url,
      issueNumber: issue.number,
      repoFullName: repo.full_name,
      deliveryKey: key,
    };
    try {
      await syncIssueToTracker(payload, config);
      finaliseDelivery(key, 'completed');
      context.log.info({ key, issueNumber: issue.number }, 'Issue synced to external tracker');
    } catch (error) {
      finaliseDelivery(key, 'failed');
      const status = (error as { response?: { status?: number } })?.response?.status ?? 'network';
      context.log.error({ key, issueNumber: issue.number, status, error }, 'Issue sync failed');
      throw error;
    }
  });
};
