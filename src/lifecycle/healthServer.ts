import http from 'node:http';
import type { IConnectionManager } from '../messaging/IConnectionManager';
import type { ILogger } from '../utils/ILogger';
import { logger as defaultLogger } from '../utils/logger';
import { metrics } from '../utils/metrics';

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3001', 10);

/**
 * Lightweight HTTP health-check server for the consumer worker (§5.2).
 * Reports connection status and metrics without Express overhead.
 */
export const startHealthServer = (
  connectionManager: IConnectionManager,
  logger: ILogger = defaultLogger
): http.Server => {
  const server = http.createServer((_req, res) => {
    const isConnected = connectionManager.isConnected();
    const status = isConnected ? 200 : 503;
    const body = JSON.stringify({
      status: isConnected ? 'ok' : 'disconnected',
      timestamp: new Date().toISOString(),
      metrics: metrics.getSnapshot(),
    });

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });

  server.listen(HEALTH_PORT, () => {
    logger.info('Health-check server started', { port: HEALTH_PORT });
  });

  return server;
};
