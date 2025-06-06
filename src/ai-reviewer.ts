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
            num_predict: Math.min(this.config.maxTokens || 2048, 2048), // Ограничиваем размер ответа
            stop: ['\n\n---', '```\n\n'], // Останавливаем на маркерах конца
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

IMPORTANT: Reply ONLY with valid JSON. No additional text before or after. Format:
{
  "reviews": [
    {
      "severity": "error",
      "line": 123,
      "message": "Short problem description",
      "suggestion": "How to fix it",
      "category": "bugs"
    }
  ]
}

If no issues found, return: {"reviews":[]}
Keep messages short and avoid special characters in strings.`;
  }

  private parseAIResponse(file: string, response: string): ReviewResult[] {
    try {
      // Ищем JSON в ответе более аккуратно
      let jsonText = this.extractJSON(response);
      
      // Попытка починить незавершенные строки
      jsonText = this.fixIncompleteJSON(jsonText);

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
          message: `AI analysis failed - model response was malformed`,
          category: 'general',
        },
      ];
    }
  }

  private extractJSON(response: string): string {
    let jsonText = response.trim();
    
    // Убираем markdown если есть
    if (jsonText.includes('```json')) {
      const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) jsonText = match[1];
    } else if (jsonText.includes('```')) {
      const match = jsonText.match(/```\s*([\s\S]*?)\s*```/);
      if (match) jsonText = match[1];
    }
    
    // Если JSON не найден, ищем объект {}
    if (!jsonText.startsWith('{')) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonText = jsonMatch[0];
    }

    return jsonText.trim();
  }

  private fixIncompleteJSON(jsonText: string): string {
    try {
      // Простая проверка - пробуем парсить как есть
      JSON.parse(jsonText);
      return jsonText;
    } catch (error) {
      // Если ошибка с незавершенной строкой, пытаемся починить
      if (error instanceof SyntaxError && error.message.includes('Unterminated string')) {
        // Находим последнюю открытую кавычку и закрываем её
        const lastQuoteIndex = jsonText.lastIndexOf('"');
        const afterLastQuote = jsonText.slice(lastQuoteIndex + 1);
        
        // Если после последней кавычки нет закрывающей кавычки перед } или ]
        if (afterLastQuote && !afterLastQuote.includes('"') && (afterLastQuote.includes('}') || afterLastQuote.includes(']'))) {
          const fixedJson = jsonText.slice(0, lastQuoteIndex + 1) + '"' + afterLastQuote;
          
          try {
            JSON.parse(fixedJson);
            return fixedJson;
          } catch {
            // Если не помогло, просто обрезаем до последней валидной части
            return this.truncateToValidJSON(jsonText);
          }
        }
      }
      
      // Для других ошибок пытаемся обрезать до последней валидной части
      return this.truncateToValidJSON(jsonText);
    }
  }

  private truncateToValidJSON(jsonText: string): string {
    // Пытаемся найти последний валидный объект/массив
    for (let i = jsonText.length - 1; i >= 0; i--) {
      if (jsonText[i] === '}' || jsonText[i] === ']') {
        const candidate = jsonText.slice(0, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
    }
    
    // Если ничего не найдено, возвращаем минимальный валидный JSON
    return '{"reviews":[]}';
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
