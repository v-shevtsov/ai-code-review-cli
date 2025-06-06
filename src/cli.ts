#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { cosmiconfig } from 'cosmiconfig';
import { GitAnalyzer } from './git-analyzer.js';
import { AIReviewer } from './ai-reviewer.js';
import { ReviewConfig, ReviewResult } from './types.js';

const DEFAULT_CONFIG: ReviewConfig = {
  modelUrl: 'http://localhost:11434',
  modelName: 'codellama:7b-instruct',
  maxTokens: 2048,
  temperature: 0.1,
  maxFileSize: 500000, // 500KB
  timeout: 120000, // 2 minutes
  includePatterns: [],
  excludePatterns: [
    'node_modules/',
    '\\.git/',
    '\\.jpg$',
    '\\.png$',
    '\\.pdf$',
    '\\.gif$',
    '\\.webp$',
    '\\.svg$',
    '\\.ico$',
    '\\.woff$',
    '\\.woff2$',
    '\\.ttf$',
    '\\.eot$',
    'package-lock\\.json$',
    'yarn\\.lock$',
    'pnpm-lock\\.yaml$',
    '\\.min\\.(js|css)$',
    'dist/',
    'build/',
    'coverage/',
    '\\.log$',
  ],
  reviewPrompt: `You are a senior developer conducting code review. 
Analyze the code and find:

🐛 Bugs and logical errors
⚡ Performance issues  
🔒 Security vulnerabilities
📚 Architectural principle violations
✨ Improvement opportunities
🎨 Code style issues

Be specific and suggest concrete solutions.`,
};

const program = new Command();

program
  .name('ai-code-review')
  .description('CLI tool for code review with local AI model')
  .version('1.0.0');

program
  .command('review')
  .description('Analyze code changes')
  .option('-s, --staged', 'Analyze staged changes')
  .option('-c, --commit <hash>', 'Analyze specific commit')
  .option('--config <path>', 'Path to configuration file')
  .option('-q, --quiet', 'Quiet mode (errors only)')
  .option('--no-health-check', 'Skip AI service health check')
  .action(async (options) => {
    const config = await loadConfig(options.config);
    const analyzer = new GitAnalyzer();
    const reviewer = new AIReviewer(config);

    let spinner: any;
    
    try {
      // Проверка здоровья AI сервиса
      if (!options.noHealthCheck) {
        spinner = ora('Checking AI model connection...').start();
        const health = await reviewer.checkHealth();
        
        if (!health.isHealthy) {
          spinner.fail(`❌ ${health.error}`);
          console.log('\n💡 Make sure that:');
          console.log('  1. Ollama is running: ollama serve');
          console.log('  2. Model is downloaded: ollama pull ' + config.modelName);
          console.log('  3. URL is correct: ' + config.modelUrl);
          process.exit(1);
        }
        
        spinner.succeed('✅ AI model is available');
      }

            // Получение изменений
      spinner = ora('Getting changes...').start();
      
      let diffs;
      if (options.commit) {
        diffs = await analyzer.getCommitDiff(options.commit);
      } else if (options.staged) {
        diffs = await analyzer.getStagedChanges();
      } else {
        diffs = await analyzer.getUnstagedChanges();
      }
      
      spinner.stop();

      if (diffs.length === 0) {
        console.log('ℹ️  No changes found for analysis');
        return;
      }

      const totalFiles = diffs.length;
      const skippedFiles = diffs.filter(d => d.isBinary || (config.maxFileSize && d.fileSize && d.fileSize > config.maxFileSize)).length;
      
      if (!options.quiet) {
        console.log(`📁 Found ${totalFiles} files for analysis${skippedFiles > 0 ? ` (${skippedFiles} skipped)` : ''}`);
      }

      // AI анализ
      spinner = ora(`Analysis with AI model ${config.modelName}...`).start();
      
      let processedFiles = 0;
      const updateProgress = () => {
        processedFiles++;
        spinner.text = `Analyzing files... ${processedFiles}/${totalFiles - skippedFiles}`;
      };

      // Обработка файлов по одному для показа прогресса
      const results: ReviewResult[] = [];
      for (const diff of diffs) {
        if (diff.isBinary || (config.maxFileSize && diff.fileSize && diff.fileSize > config.maxFileSize)) {
          continue;
        }

        try {
          const fileResults = await reviewer.reviewChanges([diff]);
          results.push(...fileResults);
          updateProgress();
        } catch (error: any) {
          if (!options.quiet) {
            console.warn(`⚠️  Analysis error ${diff.file}: ${error.message}`);
          }
        }
      }

      spinner.stop();
      displayResults(results, options.quiet);

    } catch (error: any) {
      if (spinner) spinner.fail(`❌ ${error.message}`);
      
      if (!options.quiet) {
        console.error('\n🔍 Debug information:');
        console.error('  Configuration:', JSON.stringify(config, null, 2));
        console.error('  Error:', error);
      }
      
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .option('--init', 'Create configuration file')
  .action(async (options) => {
    if (options.init) {
      await initConfig();
    } else {
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
    }
  });

program
  .command('health')
  .description('Check AI service status')
  .option('--config <path>', 'Path to configuration file')
  .action(async (options) => {
    const config = await loadConfig(options.config);
    const reviewer = new AIReviewer(config);
    
    const spinner = ora('Checking AI service health...').start();
    
    try {
      const health = await reviewer.checkHealth();
      
      if (health.isHealthy) {
        spinner.succeed('✅ AI service is working correctly');
      } else {
        spinner.fail(`❌ ${health.error}`);
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(`❌ Check error: ${error.message}`);
      process.exit(1);
    }
  });

async function loadConfig(configPath?: string): Promise<ReviewConfig> {
  try {
    const explorer = cosmiconfig('ai-code-review');
    const result = configPath
      ? await explorer.load(configPath)
      : await explorer.search();

    const config = { ...DEFAULT_CONFIG, ...result?.config };
    
    // Валидация конфигурации
    if (!config.modelUrl || !config.modelName) {
      throw new Error('Invalid configuration: missing modelUrl or modelName');
    }

    return config;
  } catch (error: any) {
    throw new Error(`Configuration loading error: ${error.message}`);
  }
}

async function initConfig(): Promise<void> {
  const configContent = `module.exports = {
  modelUrl: '${DEFAULT_CONFIG.modelUrl}',
  modelName: '${DEFAULT_CONFIG.modelName}',
  maxTokens: ${DEFAULT_CONFIG.maxTokens},
  temperature: ${DEFAULT_CONFIG.temperature},
  maxFileSize: ${DEFAULT_CONFIG.maxFileSize},
  timeout: ${DEFAULT_CONFIG.timeout},

  includePatterns: [
    '\\\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|hpp|cs|rb|php)$'
  ],

  excludePatterns: ${JSON.stringify(DEFAULT_CONFIG.excludePatterns, null, 4)},

  reviewPrompt: \`${DEFAULT_CONFIG.reviewPrompt}\`
};
`;

  const fs = await import('fs');
  const path = await import('path');
  
  const configPath = path.join(process.cwd(), '.ai-code-reviewrc.js');
  
  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow('⚠️  Configuration file already exists'));
    return;
  }

  fs.writeFileSync(configPath, configContent);
  console.log(chalk.green('✅ Configuration file created: .ai-code-reviewrc.js'));
}

function displayResults(results: ReviewResult[], quiet: boolean = false): void {
  if (results.length === 0) {
    console.log(chalk.green('✅ No issues found!'));
    return;
  }

  const grouped = groupByFile(results);
  const fileCount = Object.keys(grouped).length;

  if (!quiet) {
    console.log(chalk.bold(`\n📋 Analysis results (${fileCount} files):`));
  }

  for (const [file, fileResults] of Object.entries(grouped)) {
    console.log(chalk.bold(`\n📁 ${file}`));

    fileResults
      .sort((a, b) => {
        const severityOrder = { error: 0, warning: 1, info: 2 };
        const aOrder = severityOrder[a.severity] ?? 3;
        const bOrder = severityOrder[b.severity] ?? 3;
        return aOrder - bOrder;
      })
      .forEach(result => {
        const icon = getSeverityIcon(result.severity);
        const color = getSeverityColor(result.severity);
        const lineInfo = result.line ? ` (line ${result.line})` : '';
        const categoryInfo = result.category ? ` [${result.category}]` : '';

        console.log(`  ${icon} ${color(result.message)}${lineInfo}${categoryInfo}`);

        if (result.suggestion) {
          console.log(`    ${chalk.dim('💡 ' + result.suggestion)}`);
        }
      });
  }

  const summary = getSummary(results);
  console.log(chalk.bold(`\n📊 Summary: ${summary}`));

  // Возвращаем ненулевой код если есть ошибки
  const hasErrors = results.some(r => r.severity === 'error');
  if (hasErrors) {
    process.exitCode = 1;
  }
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
  if (counts.error) parts.push(chalk.red(`${counts.error} errors`));
  if (counts.warning) parts.push(chalk.yellow(`${counts.warning} warnings`));
  if (counts.info) parts.push(chalk.blue(`${counts.info} info`));

  return parts.length > 0 ? parts.join(', ') : 'no issues';
}

// Обработка сигналов для graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Analysis interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Analysis completed');
  process.exit(0);
});

program.parse(); 
