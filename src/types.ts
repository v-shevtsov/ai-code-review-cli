export interface ReviewConfig {
  modelUrl: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
  includePatterns: string[];
  excludePatterns: string[];
  reviewPrompt: string;
  maxFileSize?: number; // в байтах
  timeout?: number; // в миллисекундах
}

export interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  changes: string;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  fileSize?: number;
}

export interface ReviewResult {
  file: string;
  severity: 'info' | 'warning' | 'error';
  line?: number;
  message: string;
  suggestion?: string;
  category?: string;
}

export interface AIResponse {
  reviews: Array<{
    severity: 'info' | 'warning' | 'error';
    line?: number;
    message: string;
    suggestion?: string;
    category?: string;
  }>;
}

export interface HealthCheck {
  isHealthy: boolean;
  error?: string;
} 
