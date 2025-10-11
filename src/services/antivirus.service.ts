// src/services/antivirus.service.ts
import crypto from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface VirusTotalScanResult {
  isSafe: boolean;
  scanId: string;
  threats: string[];
  details?: {
    positives: number;
    total: number;
    scanDate: string;
    engines: Array<{
      name: string;
      detected: boolean;
      result?: string;
    }>;
  };
  error?: string;
}

interface VirusTotalUploadResponse {
  scan_id: string;
  resource: string;
  response_code: number;
  verbose_msg: string;
}

interface VirusTotalReportResponse {
  response_code: number;
  verbose_msg: string;
  resource: string;
  scan_id: string;
  scan_date: string;
  positives: number;
  total: number;
  scans: {
    [engineName: string]: {
      detected: boolean;
      version?: string;
      result?: string;
      update?: string;
    };
  };
}

class AntivirusService {
  private readonly API_KEY = process.env.VIRUSTOTAL_API_KEY || '';
  private readonly BASE_URL = 'https://www.virustotal.com/vtapi/v2';
  private readonly MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB límite de VirusTotal free
  private readonly RATE_LIMIT_DELAY = 15000; // 15 segundos entre requests (free tier: 4 requests/minute)
  
  private lastRequestTime = 0;
  private requestCount = 0;
  private dailyRequestCount = 0;
  private lastResetDate = new Date().toDateString();

  constructor() {
    if (!this.API_KEY) {
      console.warn('[ANTIVIRUS] VirusTotal API key not configured');
    }
  }

  private async rateLimitCheck(): Promise<void> {
    const currentDate = new Date().toDateString();
    
    // Resetear contador diario
    if (this.lastResetDate !== currentDate) {
      this.dailyRequestCount = 0;
      this.lastResetDate = currentDate;
    }

    // Verificar límite diario (500 requests/día para free tier)
    if (this.dailyRequestCount >= 500) {
      throw new Error('Límite diario de escaneo alcanzado. Intenta mañana.');
    }

    // Verificar rate limit por minuto
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
      console.log(`[ANTIVIRUS] Rate limit: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
    this.dailyRequestCount++;
  }

  private calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async uploadFileForScan(buffer: Buffer, filename: string): Promise<string> {
    try {
      await this.rateLimitCheck();

      console.log('[ANTIVIRUS] Uploading file to VirusTotal:', {
        filename,
        size: `${(buffer.length / (1024 * 1024)).toFixed(2)}MB`
      });

      if (buffer.length > this.MAX_FILE_SIZE) {
        throw new Error(`Archivo demasiado grande para escaneo. Máximo: ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      const formData = new FormData();
      formData.append('apikey', this.API_KEY);
      formData.append('file', buffer, {
        filename: filename,
        contentType: 'application/octet-stream'
      });

      const response = await fetch(`${this.BASE_URL}/file/scan`, {
        method: 'POST',
        body: formData,
        timeout: 60000 // 60 segundos timeout
      });

      if (!response.ok) {
        throw new Error(`VirusTotal upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as VirusTotalUploadResponse;
      
      if (result.response_code !== 1) {
        throw new Error(`VirusTotal upload error: ${result.verbose_msg}`);
      }

      console.log('[ANTIVIRUS] File uploaded successfully, scan_id:', result.scan_id);
      return result.scan_id;

    } catch (error: any) {
      console.error('[ANTIVIRUS] Upload error:', error.message);
      throw new Error(`Error al subir archivo para escaneo: ${error.message}`);
    }
  }

  private async getScanReport(resource: string, maxRetries = 10): Promise<VirusTotalReportResponse> {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        await this.rateLimitCheck();

        console.log(`[ANTIVIRUS] Getting scan report (attempt ${retries + 1}/${maxRetries}):`, resource);

        const response = await fetch(`${this.BASE_URL}/file/report?apikey=${this.API_KEY}&resource=${resource}`, {
          method: 'GET',
          timeout: 30000
        });

        if (!response.ok) {
          throw new Error(`VirusTotal report request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json() as VirusTotalReportResponse;
        
        if (result.response_code === 1) {
          // Escaneo completado
          console.log('[ANTIVIRUS] Scan completed:', {
            positives: result.positives,
            total: result.total,
            scan_date: result.scan_date
          });
          return result;
        } else if (result.response_code === -2) {
          // Escaneo en progreso
          console.log('[ANTIVIRUS] Scan in progress, waiting...');
          retries++;
          
          if (retries >= maxRetries) {
            throw new Error('Timeout esperando resultados del escaneo');
          }
          
          // Esperar antes del siguiente intento (progresivo)
          const waitTime = Math.min(10000 + (retries * 2000), 30000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          throw new Error(`VirusTotal report error: ${result.verbose_msg}`);
        }
        
      } catch (error: any) {
        console.error(`[ANTIVIRUS] Report attempt ${retries + 1} failed:`, error.message);
        
        if (retries >= maxRetries - 1) {
          throw new Error(`Error al obtener reporte de escaneo: ${error.message}`);
        }
        
        retries++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw new Error('Máximo número de intentos alcanzado');
  }

  private async checkHashReport(hash: string): Promise<VirusTotalReportResponse | null> {
    try {
      await this.rateLimitCheck();

      console.log('[ANTIVIRUS] Checking existing hash report:', hash);

      const response = await fetch(`${this.BASE_URL}/file/report?apikey=${this.API_KEY}&resource=${hash}`, {
        method: 'GET',
        timeout: 30000
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json() as VirusTotalReportResponse;
      
      if (result.response_code === 1) {
        console.log('[ANTIVIRUS] Found existing scan result:', {
          positives: result.positives,
          total: result.total,
          scan_date: result.scan_date
        });
        return result;
      }
      
      return null;
      
    } catch (error: any) {
      console.warn('[ANTIVIRUS] Hash check failed:', error.message);
      return null;
    }
  }

  private processEngineResults(scans: VirusTotalReportResponse['scans']): string[] {
    const threats: string[] = [];
    
    Object.entries(scans).forEach(([engineName, result]) => {
      if (result.detected && result.result) {
        threats.push(`${engineName}: ${result.result}`);
      }
    });
    
    return threats;
  }

  public async scanWithVirusTotal(buffer: Buffer, filename: string): Promise<VirusTotalScanResult> {
    try {
      if (!this.API_KEY) {
        console.warn('[ANTIVIRUS] VirusTotal API key not configured, skipping scan');
        return {
          isSafe: true,
          scanId: 'no-api-key',
          threats: [],
          error: 'API key not configured'
        };
      }
      
      // ✅ NUEVO: Verificar límite diario ANTES de escanear
      if (this.dailyRequestCount >= 500) {
        console.warn('Límite diario alcanzado (500/500). Tu proyecto será revisado pronto por un administrador.');
        return {
          isSafe: true,
          scanId: 'daily-limit-reached',
          threats: [],
          error: 'Límite diario alcanzado (500/500). Tu proyecto será revisado pronto por un administrador.'
        };
      }

      console.log('[ANTIVIRUS] Starting virus scan for:', filename);

      // Calcular hash del archivo
      const fileHash = this.calculateFileHash(buffer);
      console.log('[ANTIVIRUS] File hash:', fileHash);

      // Primero verificar si ya existe un reporte para este hash
      const existingReport = await this.checkHashReport(fileHash);
      
      let report: VirusTotalReportResponse;
      
      if (existingReport) {
        console.log('[ANTIVIRUS] Using existing scan report');
        report = existingReport;
      } else {
        // Subir archivo para escaneo
        const scanId = await this.uploadFileForScan(buffer, filename);
        
        // Esperar y obtener resultados
        report = await this.getScanReport(scanId);
      }

      // Procesar resultados
      const threats = this.processEngineResults(report.scans);
      const isSafe = report.positives === 0;

      const result: VirusTotalScanResult = {
        isSafe,
        scanId: report.scan_id,
        threats,
        details: {
          positives: report.positives,
          total: report.total,
          scanDate: report.scan_date,
          engines: Object.entries(report.scans).map(([name, result]) => ({
            name,
            detected: result.detected,
            result: result.result
          }))
        }
      };

      console.log('[ANTIVIRUS] Scan completed:', {
        filename,
        isSafe,
        positives: report.positives,
        total: report.total,
        threatsCount: threats.length
      });

      if (!isSafe) {
        console.warn('[ANTIVIRUS] THREATS DETECTED:', threats);
      }

      return result;

    } catch (error: any) {
      console.error('[ANTIVIRUS] Scan failed:', error.message);
      
      // En caso de error, permitir el archivo pero registrar el error
      // Puedes cambiar este comportamiento según tus necesidades de seguridad
      return {
        isSafe: true,
        scanId: 'error',
        threats: [],
        error: error.message
      };
    }
  }

  public async scanMultipleFiles(files: Array<{ buffer: Buffer; filename: string }>): Promise<VirusTotalScanResult[]> {
    const results: VirusTotalScanResult[] = [];
    
    for (const file of files) {
      try {
        const result = await this.scanWithVirusTotal(file.buffer, file.filename);
        results.push(result);
        
        // Si encontramos amenazas, podemos decidir si continuar o parar
        if (!result.isSafe) {
          console.warn(`[ANTIVIRUS] Threats found in ${file.filename}, stopping batch scan`);
          break;
        }
        
      } catch (error: any) {
        console.error(`[ANTIVIRUS] Failed to scan ${file.filename}:`, error.message);
        results.push({
          isSafe: false,
          scanId: 'error',
          threats: [`Scan error: ${error.message}`],
          error: error.message
        });
      }
    }
    
    return results;
  }

  public getStats(): {
    requestCount: number;
    dailyRequestCount: number;
    remainingDailyRequests: number;
    lastRequestTime: number;
  } {
    return {
      requestCount: this.requestCount,
      dailyRequestCount: this.dailyRequestCount,
      remainingDailyRequests: Math.max(0, 500 - this.dailyRequestCount),
      lastRequestTime: this.lastRequestTime
    };
  }
}

// Exportar instancia singleton
export const antivirusService = new AntivirusService();
export default antivirusService;

// Función de conveniencia para escaneo simple
export async function scanWithVirusTotal(buffer: Buffer, filename: string): Promise<VirusTotalScanResult> {
  return antivirusService.scanWithVirusTotal(buffer, filename);
}

// Función para escanear múltiples archivos
export async function scanMultipleFiles(files: Array<{ buffer: Buffer; filename: string }>): Promise<VirusTotalScanResult[]> {
  return antivirusService.scanMultipleFiles(files);
}