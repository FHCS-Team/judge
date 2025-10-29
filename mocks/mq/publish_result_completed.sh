#!/usr/bin/env bash
# Publish a mock result.evaluation.completed event

node - <<'NODE'
const { Publisher } = require('../../src/messaging/publisher');
(async () => {
  const pub = new Publisher({ rabbitUrl: process.env.JUDGE_QUEUE_URL || 'amqp://localhost', queueName: process.env.JUDGE_QUEUE_NAME || 'judge-queue' });
  const envelope = {
    type: 'result.evaluation.completed',
    payload: {
      submission_id: 'mock-sub-1',
      problem_id: 'db-optimization',
      team_id: 'mock-team',
      status: 'completed',
      evaluated_at: new Date().toISOString(),
      execution_status: 'success',
      total_score: 100,
      max_score: 100,
      percentage: 100
    }
  };
  await pub.publish(envelope);
  console.log('Published result.evaluation.completed');
  await pub.close();
  process.exit(0);
})();
NODE
