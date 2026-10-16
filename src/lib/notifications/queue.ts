/**
 * Resilient Retry Queue for Notifications
 * Retries failed deliveries with exponential backoff before marking as failed.
 */

import type { NotificationEvent, NotificationChannel, NotificationContext, ProviderSendResult } from "./types";
import { logNotificationDelivery } from "./delivery-logger";

export interface QueueItem {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  context: NotificationContext;
  attempt: number;
  maxAttempts: number;
  nextAttemptTime: number;
  executor: () => Promise<ProviderSendResult>;
}

class NotificationQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private readonly defaultMaxAttempts = 3;
  private readonly backoffDelays = [1000, 5000, 15000]; // 1s, 5s, 15s

  public async enqueue(
    event: NotificationEvent,
    channel: NotificationChannel,
    recipient: string,
    context: NotificationContext,
    executor: () => Promise<ProviderSendResult>,
    maxAttempts = this.defaultMaxAttempts
  ): Promise<ProviderSendResult> {
    // Attempt 1 synchronously
    try {
      const result = await executor();
      if (result.success) {
        await logNotificationDelivery({
          eventType: event,
          channel,
          recipient,
          status: "sent",
          provider: result.provider,
          messagePreview: `Event: ${event} via ${channel}`,
          attempts: 1,
          bookingCode: context.bookingCode,
        });
        return result;
      }

      // If initial attempt failed, queue for retry
      this.addQueueItem({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        event,
        channel,
        recipient,
        context,
        attempt: 1,
        maxAttempts,
        nextAttemptTime: Date.now() + this.backoffDelays[0],
        executor,
      });

      this.scheduleProcessing();
      return result;
    } catch (err: any) {
      this.addQueueItem({
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        event,
        channel,
        recipient,
        context,
        attempt: 1,
        maxAttempts,
        nextAttemptTime: Date.now() + this.backoffDelays[0],
        executor,
      });

      this.scheduleProcessing();
      return {
        success: false,
        error: err?.message || "Initial dispatch threw exception",
        provider: "unknown",
      };
    }
  }

  private addQueueItem(item: QueueItem) {
    this.queue.push(item);
  }

  private scheduleProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    setTimeout(() => this.processQueue(), 500);
  }

  private async processQueue() {
    const now = Date.now();
    const readyItems = this.queue.filter((item) => item.nextAttemptTime <= now);

    for (const item of readyItems) {
      // Remove from queue
      this.queue = this.queue.filter((i) => i.id !== item.id);

      item.attempt++;
      try {
        const result = await item.executor();
        if (result.success) {
          await logNotificationDelivery({
            eventType: item.event,
            channel: item.channel,
            recipient: item.recipient,
            status: "sent",
            provider: result.provider,
            messagePreview: `Retry ${item.attempt} succeeded`,
            attempts: item.attempt,
            bookingCode: item.context.bookingCode,
          });
          continue;
        }

        // Retry failed
        if (item.attempt < item.maxAttempts) {
          const delay = this.backoffDelays[item.attempt - 1] || 15000;
          item.nextAttemptTime = Date.now() + delay;
          this.queue.push(item);
        } else {
          // Max attempts reached, mark as permanently failed
          await logNotificationDelivery({
            eventType: item.event,
            channel: item.channel,
            recipient: item.recipient,
            status: "failed",
            provider: result.provider,
            errorMessage: result.error || "Exceeded max retry attempts",
            attempts: item.attempt,
            bookingCode: item.context.bookingCode,
          });
        }
      } catch (err: any) {
        if (item.attempt < item.maxAttempts) {
          const delay = this.backoffDelays[item.attempt - 1] || 15000;
          item.nextAttemptTime = Date.now() + delay;
          this.queue.push(item);
        } else {
          await logNotificationDelivery({
            eventType: item.event,
            channel: item.channel,
            recipient: item.recipient,
            status: "failed",
            provider: "retry_worker",
            errorMessage: err?.message || "Retry worker exception",
            attempts: item.attempt,
            bookingCode: item.context.bookingCode,
          });
        }
      }
    }

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    } else {
      this.isProcessing = false;
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const notificationQueue = new NotificationQueue();
