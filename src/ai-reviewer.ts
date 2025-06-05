import axios, { AxiosResponse } from 'axios';
import { GitDiff, ReviewConfig, ReviewResult, AIResponse, HealthCheck } from './types.js';

export class AIReviewer {
  private config: ReviewConfig;

  constructor(config: ReviewConfig) {
    this.config = config;
  }

  async checkHealth(): Promise<HealthCheck> {
    try {
      const response = await axios.get(`${this.config.modelUrl}/api/tags`, {
        timeout: this.config.timeout || 5000,
      });
      
      const models = response.data.models || [];
      const hasModel = models.some((model: any) => model.name.includes(this.config.modelName.split(':')[0]));
      
      if (!hasModel) {
        return {
          isHealthy: false,
          error: `Model ${this.config.modelName} not found. Available models: ${models.map((m: any) => m.name).join(', ')}`
        };
      }

      return { isHealthy: true };
    } catch (error: any) {
      return {
        isHealthy: false,
        error: `Ollama server unavailable: ${error.message}`
      };
    }
  }

  async reviewChanges(diffs: GitDiff[]): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];

    for (const diff of diffs) {
      if (this.shouldSkipFile(diff)) continue;

      try {
        const review = await this.reviewSingleFile(diff);
        results.push(...review);
      } catch (error: any) {
        console.error(`Error analyzing file ${diff.file}:`, error.message);
        
        // Добавляем результат с ошибкой
        results.push({
          file: diff.file,
          severity: 'error',
          message: `Failed to analyze file: ${error.message}`,
        });
      }
    }

    return results;
  }

  private async reviewSingleFile(diff: GitDiff): Promise<ReviewResult[]> {
    // Проверяем размер файла
    if (this.config.maxFileSize && diff.fileSize && diff.fileSize > this.config.maxFileSize) {
      return [{
        file: diff.file,
        severity: 'warning',
        message: `File too large for analysis (${diff.fileSize} bytes, limit: ${this.config.maxFileSize} bytes)`,
      }];
    }

    // Пропускаем бинарные файлы
    if (diff.isBinary) {
      return [{
        file: diff.file,
        severity: 'info',
        message: 'Binary file skipped',
      }];
    }

    const prompt = this.buildPrompt(diff);

    try {
      const response = await axios.post(
        `${this.config.modelUrl}/api/generate`,
        {
          model: this.config.modelName,
          prompt,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens,
          },
        },
        {
          timeout: this.config.timeout || 30000,
        }
      );

      return this.parseAIResponse(diff.file, response.data.response);
    } catch (error: any) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout when calling AI model');
      }
      throw error;
    }
  }

  private buildPrompt(diff: GitDiff): string {
    const fileInfo = [
      `File: ${diff.file}`,
      diff.isNew ? '🆕 NEW FILE' : '',
      diff.isDeleted ? '🗑️ DELETED FILE' : '',
      `📊 Changes: +${diff.additions} -${diff.deletions}`,
    ].filter(Boolean).join('\n');

    return `${this.config.reviewPrompt}

${fileInfo}

Changes:
\`\`\`diff
${diff.changes.slice(0, 10000)} ${diff.changes.length > 10000 ? '\n... (file truncated)' : ''}
\`\`\`

IMPORTANT: Reply ONLY in JSON format without additional text:
{
  "reviews": [
    {
      "severity": "error|warning|info",
      "line": 123,
             "message": "Problem description",
       "suggestion": "Fix suggestion",
      "category": "bugs|performance|security|style|architecture"
    }
  ]
}`;
  }

  private parseAIResponse(file: string, response: string): ReviewResult[] {
    try {
      // Ищем JSON в ответе более аккуратно
      let jsonText = response.trim();
      
      // Убираем markdown если есть
      if (jsonText.includes('```json')) {
        const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) jsonText = match[1];
      }
      
      // Если JSON не найден, ищем объект {}
      if (!jsonText.startsWith('{')) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonText = jsonMatch[0];
      }

      const parsed: AIResponse = JSON.parse(jsonText);
      
      if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
        throw new Error('Invalid AI response format');
      }

      return parsed.reviews.map((review) => ({
        file,
        severity: this.validateSeverity(review.severity),
        line: review.line,
        message: review.message || 'No description',
        suggestion: review.suggestion,
        category: review.category,
      }));
    } catch (error) {
      console.warn(`Failed to parse AI response for ${file}:`, error);
      
      // Fallback: создаем базовый результат из текста
      return [
        {
          file,
          severity: 'info' as const,
          message: `AI analysis (text): ${response.slice(0, 200)}${response.length > 200 ? '...' : ''}`,
          category: 'general',
        },
      ];
    }
  }

  private validateSeverity(severity: string): 'info' | 'warning' | 'error' {
    if (['error', 'warning', 'info'].includes(severity)) {
      return severity as 'info' | 'warning' | 'error';
    }
    return 'info';
  }

  private shouldSkipFile(diff: GitDiff): boolean {
    const { includePatterns, excludePatterns } = this.config;

    // Проверяем exclude паттерны
    if (excludePatterns.some((pattern) => new RegExp(pattern).test(diff.file))) {
      return true;
    }

    // Проверяем include паттерны (если есть)
    if (includePatterns.length > 0) {
      return !includePatterns.some((pattern) => new RegExp(pattern).test(diff.file));
    }

    return false;
  }
} 
