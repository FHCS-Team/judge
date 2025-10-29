#!/usr/bin/env bash
# Publish a submission message with inline base64 archive_data using node
# Usage: ./publish_submission_buffer.sh

node - <<'NODE'
const { Publisher } = require('../../src/messaging/publisher');
const fs = require('fs');
(async () => {
  const pub = new Publisher({ rabbitUrl: process.env.RABBITMQ_URL || 'amqp://localhost', queueName: process.env.JUDGE_QUEUE_NAME || 'judge-queue' });
  // Create a small tar.gz buffer from fixtures (use existing sample archive if present)
  const sampleArchive = fs.readFileSync(__dirname + '/../../tests/fixtures/sample.tar.gz');
  const envelope = {
    type: 'submission',
    payload: {
      submission_id: 'mock-sub-buffer-1',
      problem_id: 'db-optimization',
      team_id: 'mock-team',
      archive_data: sampleArchive.toString('base64')
    },
    max_retries: 1
  };
  await pub.publish(envelope);
  console.log('Published submission (buffer)');
  await pub.close();
  process.exit(0);
})();
NODE
