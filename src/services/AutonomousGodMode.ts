/**
 * 💤 AUTONOMOUS GOD MODE v1.0
 * Self-Maintaining Content Engine with URL Priority Queue
 * 
 * FEATURES:
 * - Toggle ON/OFF for autonomous maintenance
 * - Priority-based URL processing (Critical > High > Medium > Healthy)
 * - Automatic SOTA quality checks on all URLs
 * - Real-time status monitoring
 * - Selective URL targeting
 */

import {
  enhancedQualityCheck,
  factValidationEngine,
  stalenessDetector,
  FactValidationEngine,
} from './SOTAEnhancements';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type URLStatus = 'critical' | 'high' | 'medium' | 'healthy';

export interface URLMonitorItem {
  url: string;
  lastChecked: Date;
  status: URLStatus;
  qualityScore: number;
  stalenessScore: number;
  lastUpdated: Date;
  factCheckScore: number;
}

export interface AutonomousGodModeConfig {
  isEnabled: boolean;
  selectedUrls: string[];
  checkInterval: number; // milliseconds
  maxConcurrent: number;
  autoRefresh: boolean;
  priorityOrder: URLStatus[];
}

export interface GodModeStats {
  totalUrls: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  healthyCount: number;
  lastMaintenanceTime: Date;
  nextMaintenanceTime: Date;
  isRunning: boolean;
}

// ============================================================================
// PRIORITY QUEUE FOR URL PROCESSING
// ============================================================================

class URLPriorityQueue {
  private queue: URLMonitorItem[] = [];
  private readonly priorityMap = {
    critical: 0,
    high: 1,
    medium: 2,
    healthy: 3,
  };

  enqueue(item: URLMonitorItem): void {
    this.queue.push(item);
    this.sort();
  }

  enqueueMany(items: URLMonitorItem[]): void {
    this.queue.push(...items);
    this.sort();
  }

  dequeue(): URLMonitorItem | undefined {
    return this.queue.shift();
  }

  peek(): URLMonitorItem | undefined {
    return this.queue[0];
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  size(): number {
    return this.queue.length;
  }

  private sort(): void {
    this.queue.sort(
      (a, b) => this.priorityMap[a.status] - this.priorityMap[b.status]
    );
  }

  clear(): void {
    this.queue = [];
  }

  getAll(): URLMonitorItem[] {
    return [...this.queue];
  }
}

// ============================================================================
// AUTONOMOUS GOD MODE MAIN ENGINE
// ============================================================================

export class AutonomousGodMode {
  private config: AutonomousGodModeConfig = {
    isEnabled: false,
    selectedUrls: [],
    checkInterval: 3600000, // 1 hour
    maxConcurrent: 3,
    autoRefresh: true,
    priorityOrder: ['critical', 'high', 'medium', 'healthy'],
  };

  private urlMonitor = new Map<string, URLMonitorItem>();
  private priorityQueue = new URLPriorityQueue();
  private maintenanceTimer: NodeJS.Timer | null = null;
  private isProcessing = false;
  private stats: GodModeStats = {
    totalUrls: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    healthyCount: 0,
    lastMaintenanceTime: new Date(),
    nextMaintenanceTime: new Date(),
    isRunning: false,
  };

  private factEngine: FactValidationEngine | null = null;

  initialize(serperApiKey: string): void {
    this.factEngine = factValidationEngine(serperApiKey);
  }

  toggleAutonomousMode(enabled: boolean): void {
    this.config.isEnabled = enabled;
    this.stats.isRunning = enabled;

    if (enabled) {
      this.startMaintenance();
    } else {
      this.stopMaintenance();
    }
  }

  addUrlsToMonitor(urls: string[]): void {
    for (const url of urls) {
      if (!this.urlMonitor.has(url)) {
        const item: URLMonitorItem = {
          url,
          lastChecked: new Date(),
          status: 'healthy',
          qualityScore: 50,
          stalenessScore: 50,
          lastUpdated: new Date(),
          factCheckScore: 50,
        };
        this.urlMonitor.set(url, item);
      }
    }
    this.config.selectedUrls = Array.from(this.urlMonitor.keys());
    this.stats.totalUrls = this.urlMonitor.size;
    this.rebuildPriorityQueue();
  }

  removeUrlsFromMonitor(urls: string[]): void {
    for (const url of urls) {
      this.urlMonitor.delete(url);
    }
    this.config.selectedUrls = Array.from(this.urlMonitor.keys());
    this.stats.totalUrls = this.urlMonitor.size;
    this.rebuildPriorityQueue();
  }

  getMonitoredUrls(): URLMonitorItem[] {
    return Array.from(this.urlMonitor.values());
  }

  getUrlsByStatus(status: URLStatus): URLMonitorItem[] {
    return Array.from(this.urlMonitor.values()).filter(
      item => item.status === status
    );
  }

  private startMaintenance(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }

    this.maintenanceTimer = setInterval(() => {
      this.runMaintenanceCycle();
    }, this.config.checkInterval);

    this.runMaintenanceCycle();
  }

  private stopMaintenance(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  private async runMaintenanceCycle(): Promise<void> {
    if (this.isProcessing) {
      console.warn('[GodMode] Already processing, skipping cycle');
      return;
    }

    this.isProcessing = true;
    this.stats.lastMaintenanceTime = new Date();
    this.stats.nextMaintenanceTime = new Date(
      Date.now() + this.config.checkInterval
    );

    try {
      this.rebuildPriorityQueue();

      const processed: string[] = [];
      let concurrent = 0;

      while (!this.priorityQueue.isEmpty() && concurrent < this.config.maxConcurrent) {
        const item = this.priorityQueue.dequeue();
        if (item) {
          concurrent++;
          this.processUrlAsync(item).finally(() => {
            concurrent--;
          });
          processed.push(item.url);
        }
      }

      console.log(
        `[GodMode] Processed ${processed.length} URLs in priority order`
      );
    } catch (error) {
      console.error('[GodMode] Maintenance cycle failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processUrlAsync(item: URLMonitorItem): Promise<void> {
    try {
      const result = await enhancedQualityCheck(
        '',
        item.url,
        this.factEngine ? '' : '',
        item.lastUpdated
      );

      item.qualityScore = result.finalScore;
      item.stalenessScore = result.stalenessScore;
      item.factCheckScore = result.factValidationScore;
      item.lastChecked = new Date();

      if (result.finalScore < 60) {
        item.status = 'critical';
      } else if (result.finalScore < 75) {
        item.status = 'high';
      } else if (result.finalScore < 85) {
        item.status = 'medium';
      } else {
        item.status = 'healthy';
      }

      this.updateStats();

      console.log(
        `[GodMode] Processed ${item.url} - Status: ${item.status}, Score: ${item.qualityScore}`
      );
    } catch (error) {
      console.error(`[GodMode] Error processing ${item.url}:`, error);
    }
  }

  private rebuildPriorityQueue(): void {
    this.priorityQueue.clear();
    const allItems = Array.from(this.urlMonitor.values());
    this.priorityQueue.enqueueMany(allItems);
  }

  private updateStats(): void {
    this.stats.criticalCount = 0;
    this.stats.highCount = 0;
    this.stats.mediumCount = 0;
    this.stats.healthyCount = 0;

    for (const item of this.urlMonitor.values()) {
      switch (item.status) {
        case 'critical':
          this.stats.criticalCount++;
          break;
        case 'high':
          this.stats.highCount++;
          break;
        case 'medium':
          this.stats.mediumCount++;
          break;
        case 'healthy':
          this.stats.healthyCount++;
          break;
      }
    }
  }

  getStats(): GodModeStats {
    return { ...this.stats };
  }

  getConfig(): AutonomousGodModeConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<AutonomousGodModeConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.isEnabled) {
      this.startMaintenance();
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const autonomousGodMode = new AutonomousGodMode();

export { URLPriorityQueue };
