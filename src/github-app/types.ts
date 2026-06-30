export type ExternalIssuePayload = {
  title: string;
  body: string;
  githubUrl: string;
  issueNumber: number;
  repoFullName: string;
  deliveryKey: string;
};

export type DeliveryStatus = 'pending' | 'completed' | 'failed';

export type SyncConfig = {
  trackerUrl: string;
  trackerToken: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
};
