/**
 * Configuration for Health Check Tool integration via shared directory
 *
 * Set HEALTH_CHECK_SHARED_DIR in .env to override the default path.
 * Local default: /Users/niranjankarthikeyan/Downloads/Archive/health-check-shared
 * Fyre production: /root/health-check-shared
 */

const BASE_DIR = process.env.HEALTH_CHECK_SHARED_DIR?.trim()
  || '/Users/niranjankarthikeyan/Downloads/Archive/health-check-shared';

export const HEALTH_CHECK_SHARED_CONFIG = {
  baseDir: BASE_DIR,
  
  // Subdirectories
  requestsDir: `${BASE_DIR}/requests`,
  completedDir: `${BASE_DIR}/completed`,
  
  // File naming patterns
  requestFilePattern: (clientId: string, timestamp: string) => 
    `health-check-request-${clientId}-${timestamp}.xlsx`,
  
  completedFilePattern: (clientId: string, timestamp: string) => 
    `health-check-request-${clientId}-${timestamp}-completed.xlsx`,
  
  // Polling configuration (for auto-refresh)
  pollingEnabled: false, // Set to true to enable auto-polling
  pollingIntervalMs: 5000, // Check every 5 seconds
  
  // Excel template structure
  templateColumns: [
    'Client ID',
    'Client Name',
    'Product',
    'Main KPI',
    'Sub KPI',
    'Status',
    'Score',
    'Last Updated'
  ]
};

/**
 * Get the request file path for a client
 * Uses full timestamp (date + time) to avoid overwriting multiple requests on same day
 */
export function getRequestFilePath(clientId: string, timestamp?: string): string {
  const ts = timestamp || (() => {
    const now = new Date();
    const date = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const time = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    return `${date}_${time}`;
  })();
  return `${HEALTH_CHECK_SHARED_CONFIG.requestsDir}/${HEALTH_CHECK_SHARED_CONFIG.requestFilePattern(clientId, ts)}`;
}

/**
 * Get the completed file path for a client
 */
export function getCompletedFilePath(clientId: string, timestamp?: string): string {
  const ts = timestamp || new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `${HEALTH_CHECK_SHARED_CONFIG.completedDir}/${HEALTH_CHECK_SHARED_CONFIG.completedFilePattern(clientId, ts)}`;
}

/**
 * Get the most recent completed file for a client
 */
export function getLatestCompletedFilePattern(clientId: string): string {
  return `health-check-request-${clientId}-*-completed.xlsx`;
}

// Made with Bob
