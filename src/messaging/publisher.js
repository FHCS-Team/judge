/**
 * Messaging publisher module
 *
 * Minimal publisher that sends envelope messages into the RabbitMQ queue.
 */

const amqp = require("amqplib");

class Publisher {
  constructor(opts = {}) {
    this.rabbitUrl =
      opts.rabbitUrl || process.env.JUDGE_QUEUE_URL || "amqp://localhost";
    this.queueName =
      opts.queueName || process.env.JUDGE_QUEUE_NAME || "judge-queue";
    this._conn = null;
    this._ch = null;
  }

  async connect() {
    if (this._conn) return;
    this._conn = await amqp.connect(this.rabbitUrl);
    this._ch = await this._conn.createChannel();
    await this._ch.assertQueue(this.queueName, { durable: true });
  }

  async publish(envelope) {
    await this.connect();
    const buf = Buffer.from(JSON.stringify(envelope));
    return this._ch.sendToQueue(this.queueName, buf, { persistent: true });
  }

  async close() {
    try {
      if (this._ch) await this._ch.close();
    } catch (e) {}
    try {
      if (this._conn) await this._conn.close();
    } catch (e) {}
    this._ch = null;
    this._conn = null;
  }
}

module.exports = { Publisher };
