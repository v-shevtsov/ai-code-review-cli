# CLI утилита для Code Review с локальной AI моделью

## Архитектура решения

Утилита состоит из трёх основных компонентов:

- **Git анализатор** - извлекает diff и метаданные изменений
- **AI интерфейс** - взаимодействие с локальной моделью (Ollama)
- **CLI обёртка** - пользовательский интерфейс и конфигурация

## Требования

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "simple-git": "^3.19.1",
    "axios": "^1.5.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.1",
    "cosmiconfig": "^8.3.5"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  }
}
```

## Основной код CLI утилиты

### 1. Конфигурация и типы

```typescript
// src/types.ts
export interface ReviewConfig {
  modelUrl: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
  includePatterns: string[];
  excludePatterns: string[];
  reviewPrompt: string;
}

export interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  changes: string;
  isNew: boolean;
  isDeleted: boolean;
}

export interface ReviewResult {
  file: string;
  severity: 'info' | 'warning' | 'error';
  line?: number;
  message: string;
  suggestion?: string;
}
```

### 2. Git анализатор

```typescript
// src/git-analyzer.ts
import simpleGit, { SimpleGit } from 'simple-git';
import { GitDiff } from './types';

export class GitAnalyzer {
  private git: SimpleGit;

  constructor(repoPath: string = process.cwd()) {
    this.git = simpleGit(repoPath);
  }

  async getUnstagedChanges(): Promise<GitDiff[]> {
    const diff = await this.git.diff();
    return this.parseDiff(diff);
  }

  async getStagedChanges(): Promise<GitDiff[]> {
    const diff = await this.git.diff(['--cached']);
    return this.parseDiff(diff);
  }

  async getCommitDiff(commitHash?: string): Promise<GitDiff[]> {
    const diff = commitHash
      ? await this.git.diff([`${commitHash}^`, commitHash])
      : await this.git.diff(['HEAD^', 'HEAD']);
    return this.parseDiff(diff);
  }

  private parseDiff(diffText: string): GitDiff[] {
    const files: GitDiff[] = [];
    const fileBlocks = diffText.split('diff --git');

    for (const block of fileBlocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const fileMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
      if (!fileMatch) continue;

      const fileName = fileMatch[2];
      const isNew = block.includes('new file mode');
      const isDeleted = block.includes('deleted file mode');

      const additionsMatch = block.match(/\+\+\+.*\n([\s\S]*)/);
      const changes = additionsMatch ? additionsMatch[1] : '';

      const additions = (changes.match(/^\+(?!\+)/gm) || []).length;
      const deletions = (changes.match(/^-(?!-)/gm) || []).length;

      files.push({
        file: fileName,
        additions,
        deletions,
        changes,
        isNew,
        isDeleted,
      });
    }

    return files;
  }
}
```

### 3. AI интерфейс

```typescript
// src/ai-reviewer.ts
import axios from 'axios';
import { GitDiff, ReviewConfig, ReviewResult } from './types';

export class AIReviewer {
  private config: ReviewConfig;

  constructor(config: ReviewConfig) {
    this.config = config;
  }

  async reviewChanges(diffs: GitDiff[]): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];

    for (const diff of diffs) {
      if (this.shouldSkipFile(diff.file)) continue;

      try {
        const review = await this.reviewSingleFile(diff);
        results.push(...review);
      } catch (error) {
        console.error(`Ошибка при анализе файла ${diff.file}:`, error);
      }
    }

    return results;
  }

  private async reviewSingleFile(diff: GitDiff): Promise<ReviewResult[]> {
    const prompt = this.buildPrompt(diff);

    const response = await axios.post(`${this.config.modelUrl}/api/generate`, {
      model: this.config.modelName,
      prompt,
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    });

    return this.parseAIResponse(diff.file, response.data.response);
  }

  private buildPrompt(diff: GitDiff): string {
    return `${this.config.reviewPrompt}

Файл: ${diff.file}
${diff.isNew ? 'НОВЫЙ ФАЙЛ' : ''}
${diff.isDeleted ? 'УДАЛЁННЫЙ ФАЙЛ' : ''}

Изменения:
\`\`\`diff
${diff.changes}
\`\`\`

Верни результат в JSON формате:
{
  "reviews": [
    {
      "severity": "error|warning|info",
      "line": 123,
      "message": "Описание проблемы",
      "suggestion": "Предложение по исправлению"
    }
  ]
}`;
  }

  private parseAIResponse(file: string, response: string): ReviewResult[] {
    try {
      // Извлекаем JSON из ответа
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      return (
        parsed.reviews?.map((review: any) => ({
          file,
          severity: review.severity || 'info',
          line: review.line,
          message: review.message,
          suggestion: review.suggestion,
        })) || []
      );
    } catch (error) {
      // Fallback: парсим текстовый ответ
      return [
        {
          file,
          severity: 'info' as const,
          message: response.slice(0, 200) + '...',
        },
      ];
    }
  }

  private shouldSkipFile(fileName: string): boolean {
    const { includePatterns, excludePatterns } = this.config;

    if (excludePatterns.some((pattern) => fileName.match(pattern))) {
      return true;
    }

    if (includePatterns.length > 0) {
      return !includePatterns.some((pattern) => fileName.match(pattern));
    }

    return false;
  }
}
```

### 4. Основная CLI команда

```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { cosmiconfig } from 'cosmiconfig';
import { GitAnalyzer } from './git-analyzer';
import { AIReviewer } from './ai-reviewer';
import { ReviewConfig, ReviewResult } from './types';

const DEFAULT_CONFIG: ReviewConfig = {
  modelUrl: 'http://localhost:11434',
  modelName: 'codellama:7b',
  maxTokens: 2048,
  temperature: 0.1,
  includePatterns: [],
  excludePatterns: [
    'node_modules/',
    '\\.git/',
    '\\.jpg$',
    '\\.png$',
    '\\.pdf$',
    'package-lock\\.json$',
    'yarn\\.lock$'
  ],
  reviewPrompt: `Ты - опытный код-ревьюер. Проанализируй следующие изменения в коде и найди:
1. Потенциальные баги и ошибки
2. Проблемы производительности
3. Нарушения best practices
4. Проблемы безопасности
5. Улучшения читаемости кода

Будь конструктивным и предлагай конкретные решения.`
};

const program = new Command();

program
  .name('ai-code-review')
  .description('CLI утилита для code review с помощью локальной AI модели')
  .version('1.0.0');

program
  .command('review')
  .description('Анализировать изменения в коде')
  .option('-s, --staged', 'Анализировать staged изменения')
  .option('-c, --commit <hash>', 'Анализировать конкретный коммит')
  .option('--config <path>', 'Путь к файлу конфигурации')
  .action(async (options) => {
    const config = await loadConfig(options.config);
    const analyzer = new GitAnalyzer();
    const reviewer = new AIReviewer(config);

    const spinner = ora('Получение изменений...').start();

    try {
      let diffs;
      if (options.commit) {
        diffs = await analyzer.getCommitDiff(options.commit);
      } else if (options.staged) {
        diffs = await analyzer.getStagedChanges();
      } else {
        diffs = await analyzer.getUnstagedChanges();
      }

      if (diffs.length === 0) {
        spinner.succeed('Изменений не найдено');
        return;
      }

      spinner.text = `Анализ ${diffs.length} файлов...`;
      const results = await reviewer.reviewChanges(diffs);

      spinner.stop();
      displayResults(results);
    } catch (error) {
      spinner.fail(`Ошибка: ${error}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Показать текущую конфигурацию')
  .action(async () => {
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

async function loadConfig(configPath?: string): Promise<ReviewConfig> {
  const explorer = cosmiconfig('ai-code-review');
  const result = configPath
    ? await explorer.load(configPath)
    : await explorer.search();

  return { ...DEFAULT_CONFIG, ...result?.config };
}

function displayResults(results: ReviewResult[]): void {
  if (results.length === 0) {
    console.log(chalk.green('✅ Замечаний не найдено!'));
    return;
  }

  const grouped = groupByFile(results);

  for (const [file, fileResults] of Object.entries(grouped)) {
    console.log(chalk.bold(`\n📁 ${file}`));

    fileResults.forEach(result => {
      const icon = getSeverityIcon(result.severity);
      const color = getSeverityColor(result.severity);
      const lineInfo = result.line ? `:${result.line}` : '';

      console.log(`  ${icon} ${color(`${result.message}`)}${lineInfo}`);

      if (result.suggestion) {
        console.log(`    ${chalk.dim('💡 ' + result.suggestion)}`);
      }
    });
  }

  const summary = getSummary(results);
  console.log(chalk.bold(`\n📊 Итого: ${summary}`));
}

function groupByFile(results: ReviewResult[]): Record<string, ReviewResult[]> {
  return results.reduce((acc, result) => {
    if (!acc[result.file]) acc[result.file] = [];
    acc[result.file].push(result);
    return acc;
  }, {} as Record<string, ReviewResult[]>);
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '📝';
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'error': return chalk.red;
    case 'warning': return chalk.yellow;
    case 'info': return chalk.blue;
    default: return chalk.white;
  }
}

function getSummary(results: ReviewResult[]): string {
  const counts = results.reduce((acc, r) => {
    acc[r.severity] = (acc[r.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const parts = [];
  if (counts.error) parts.push(chalk.red(`${counts.error} ошибок`));
  if (counts.warning) parts.push(chalk.yellow(`${counts.warning} предупреждений`));
  if (counts.info) parts.push(chalk.blue(`${counts.info} замечаний`));

  return parts.join(', ');
}

program.parse();
```

### 5. Файл конфигурации

```typescript
// .ai-code-reviewrc.js
module.exports = {
  modelUrl: 'http://localhost:11434',
  modelName: 'codellama:13b-instruct',
  maxTokens: 4096,
  temperature: 0.05,

  includePatterns: ['\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|hpp)$'],

  excludePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '\\.test\\.',
    '\\.spec\\.',
    '__tests__/',
    '\\.min\\.',
    'package-lock\\.json',
    'yarn\\.lock',
  ],

  reviewPrompt: `Ты - senior разработчик, проводящий code review. 
Проанализируй код и найди:

🐛 Баги и логические ошибки
⚡ Проблемы производительности  
🔒 Уязвимости безопасности
📚 Нарушения архитектурных принципов
✨ Возможности для улучшения

Используй русский язык. Будь конкретным и предлагай решения.`,
};
```

## Установка и использование

### 1. Установка локальной AI модели

```bash
# Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull codellama:7b-instruct

# Или LM Studio
# Скачать с https://lmstudio.ai/
```

### 2. Сборка CLI утилиты

```bash
npm install
npm run build

# Глобальная установка
npm link
```

### 3. Примеры использования

```bash
# Анализ незакоммиченных изменений
ai-code-review review

# Анализ staged изменений
ai-code-review review --staged

# Анализ конкретного коммита
ai-code-review review --commit abc123

# Использование кастомной конфигурации
ai-code-review review --config ./custom-config.js

# Показать текущую конфигурацию
ai-code-review config
```

## Расширенные возможности

### 1. Интеграция с pre-commit хуком

```bash
#!/bin/sh
# .git/hooks/pre-commit
ai-code-review review --staged --quiet
exit $?
```

### 2. CI/CD интеграция

```yaml
# .github/workflows/code-review.yml
name: AI Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Ollama
        run: |
          curl -fsSL https://ollama.ai/install.sh | sh
          ollama pull codellama:7b-instruct
      - name: Run AI Review
        run: |
          npm install -g your-ai-review-package
          ai-code-review review --commit ${{ github.event.pull_request.head.sha }}
```

### 3. Кастомные правила

```typescript
// rules/typescript-rules.ts
export const typescriptRules = {
  'no-any': (code: string) => {
    const anyUsage = code.match(/:\s*any\b/g);
    return (
      anyUsage?.map((match) => ({
        severity: 'warning',
        message: 'Избегайте использования типа "any"',
        suggestion: 'Используйте более конкретные типы',
      })) || []
    );
  },
};
```

## Производительность и оптимизации

- Используйте потоковую обработку для больших файлов
- Кэшируйте результаты анализа неизменённых файлов
- Настройте параллельную обработку файлов
- Оптимизируйте промпты для конкретных языков программирования
