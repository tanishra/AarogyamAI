// API Health Monitoring
interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessfulRequest: string | null;
  averageResponseTime: number;
  consecutiveFailures: number;
  responseTimes: number[];
}

class HealthMonitor {
  private metrics: HealthMetrics = {
    status: 'healthy',
    lastSuccessfulRequest: null,
    averageResponseTime: 0,
    consecutiveFailures: 0,
    responseTimes: [],
  };

  private maxResponseTimes = 10;

  recordSuccess(responseTime: number): void {
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastSuccessfulRequest = new Date().toISOString();
    
    // Add response time
    this.metrics.responseTimes.push(responseTime);
    if (this.metrics.responseTimes.length > this.maxResponseTimes) {
      this.metrics.responseTimes.shift();
    }

    // Calculate average
    this.metrics.averageResponseTime =
      this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;

    // Update status
    if (this.metrics.averageResponseTime > 5000) {
      this.metrics.status = 'degraded';
    } else {
      this.metrics.status = 'healthy';
    }

    this.saveMetrics();
  }

  recordFailure(): void {
    this.metrics.consecutiveFailures++;

    // Update status based on consecutive failures
    if (this.metrics.consecutiveFailures >= 3) {
      this.metrics.status = 'down';
    } else if (this.metrics.consecutiveFailures >= 1) {
      this.metrics.status = 'degraded';
    }

    this.saveMetrics();
  }

  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  private saveMetrics(): void {
    try {
      localStorage.setItem('apiHealth', JSON.stringify(this.metrics));
    } catch (e) {
      console.error('Failed to save health metrics', e);
    }
  }

  loadMetrics(): void {
    try {
      const saved = localStorage.getItem('apiHealth');
      if (saved) {
        this.metrics = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load health metrics', e);
    }
  }
}

export const healthMonitor = new HealthMonitor();
