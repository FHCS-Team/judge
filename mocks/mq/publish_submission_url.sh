#!/usr/bin/env bash
# Publish a submission message pointing to a URL (assumes the URL is accessible)
# Usage: ./publish_submission_url.sh <archive_url>

ARCHIVE_URL=${1:-"http://example.test/sample.tar.gz"}

node - <<'NODE'
const { Publisher } = require('../../src/messaging/publisher');
(async () => {
  const pub = new Publisher({ rabbitUrl: process.env.JUDGE_QUEUE_URL || 'amqp://localhost', queueName: process.env.JUDGE_QUEUE_NAME || 'judge-queue' });
  const envelope = {
    type: 'submission',
    payload: {
      submission_id: 'mock-sub-url-1',
      problem_id: 'db-optimization',
      team_id: 'mock-team',
      archive_url: process.argv[1] || 'http://example.test/sample.tar.gz'
    },
    max_retries: 1
  };
  // argv mapping for inline script
  const argUrl = process.env.ARCHIVE_URL || 'http://example.test/sample.tar.gz';
  envelope.payload.archive_url = argUrl;
  await pub.publish(envelope);
  console.log('Published submission (url):', envelope.payload.archive_url);
  await pub.close();
  process.exit(0);
})();
NODE
