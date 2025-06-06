# AI Code Review CLI

🤖 CLI tool for automated code review using local AI models (Ollama).

## Features

- 🤖 **Local AI Analysis** - Uses local AI models via Ollama (privacy-first)
- 🔍 **Smart Detection** - Finds bugs, performance issues, security vulnerabilities
- 📝 **Multiple Modes** - Analyze unstaged changes, staged files, or specific commits
- ⚙️ **Configurable** - Flexible configuration via config files
- 🎨 **Beautiful Output** - Colored output with icons and severity levels
- 🚀 **Multi-language** - Supports TypeScript, JavaScript, Python, Go, Rust, Java, C++, and more
- 🔄 **CI/CD Ready** - Perfect for pre-commit hooks and GitHub Actions

## Installation

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows - download from https://ollama.ai/
```

### 2. Download AI Model

```bash
# Recommended model for code review
ollama pull codellama:13b-instruct

# Or lightweight alternative
ollama pull codellama:7b-instruct
```

### 3. Install CLI Tool

```bash
# Install globally from npm
npm install -g @woobbe/ai-code-review-cli

# Or install locally in project
npm install --save-dev @woobbe/ai-code-review-cli

# Or use npx (no installation required)
npx @woobbe/ai-code-review-cli review
```

## Quick Start

```bash
# Start Ollama server (if not running)
ollama serve

# Analyze current changes
ai-code-review review

# Analyze staged changes
ai-code-review review --staged

# Analyze specific commit
ai-code-review review --commit abc123
```

## Usage

### Basic Commands

```bash
# Analyze unstaged changes
ai-code-review review

# Analyze staged changes
ai-code-review review --staged

# Analyze specific commit
ai-code-review review --commit <hash>

# Quiet mode (errors only)
ai-code-review review --quiet

# Skip health check
ai-code-review review --no-health-check
```

### Configuration Commands

```bash
# Show current configuration
ai-code-review config

# Create configuration file
ai-code-review config --init

# Check AI service status
ai-code-review health
```

## Configuration

Create `.ai-code-reviewrc.cjs` in your project root:

```javascript
module.exports = {
  modelUrl: 'http://localhost:11434',
  modelName: 'codellama:13b-instruct',
  maxTokens: 4096,
  temperature: 0.05,
  maxFileSize: 1000000, // 1MB
  timeout: 120000, // 2 minutes

  includePatterns: [
    '\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|hpp|cs|rb|php|swift|kt)$'
  ],

  excludePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '\\.test\\.',
    '\\.spec\\.',
    'package-lock\\.json'
  ],

  reviewPrompt: `You are a senior developer conducting code review. 
Analyze the code and find:

🐛 Bugs and logical errors
⚡ Performance issues  
🔒 Security vulnerabilities
📚 Architectural principle violations
✨ Improvement opportunities
🎨 Code style issues

Focus on critical issues. Be specific and suggest solutions.`
};
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `modelUrl` | Ollama server URL | `http://localhost:11434` |
| `modelName` | AI model to use | `codellama:7b-instruct` |
| `maxTokens` | Maximum tokens per request | `2048` |
| `temperature` | AI creativity (0-1) | `0.1` |
| `maxFileSize` | Max file size in bytes | `500000` |
| `timeout` | Request timeout in ms | `120000` |
| `includePatterns` | Files to include (regex) | `[]` |
| `excludePatterns` | Files to exclude (regex) | Common ignore patterns |
| `reviewPrompt` | Custom AI prompt | Default review prompt |

## Examples

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
ai-code-review review --staged --quiet
exit $?
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```


### Custom Rules

Create specialized configurations for different projects:

```javascript
// .ai-code-reviewrc.security.cjs - Security focused
module.exports = {
  modelName: 'codellama:13b-instruct',
  reviewPrompt: `You are a security expert reviewing code.
Focus ONLY on:
🔒 Security vulnerabilities
🛡️ Input validation issues
🔐 Authentication/authorization problems
💉 Injection vulnerabilities
🔓 Sensitive data exposure

Rate severity as: critical, high, medium, low.`
};
```

```javascript
// .ai-code-reviewrc.performance.cjs - Performance focused
module.exports = {
  modelName: 'codellama:13b-instruct',
  reviewPrompt: `You are a performance optimization expert.
Focus ONLY on:
⚡ Performance bottlenecks
🔄 Inefficient algorithms
💾 Memory leaks
🗄️ Database query optimization
📈 Scalability issues`
};
```

## Output Example

```
📁 Found 3 files for analysis

📋 Analysis results (3 files):

📁 src/auth.js
  ❌ Using eval() can lead to code injection vulnerabilities (line 12) [security]
    💡 Use JSON.parse() or a safer alternative for parsing data
  ⚠️ Synchronous file operations block the event loop (line 25) [performance]
    💡 Use fs.readFileSync() → fs.promises.readFile() for async operation

📁 src/utils.ts
  ℹ️ Consider using const assertion for better type safety (line 8) [style]
    💡 Change 'as string[]' to 'as const'

📁 src/api.py
  ❌ SQL query vulnerable to injection (line 34) [security]
    💡 Use parameterized queries or ORM methods

📊 Summary: 2 errors, 1 warnings, 1 info
```

## Supported Models

### Recommended Models

| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| `codellama:7b-instruct` | 3.8GB | Fast | Good | Quick reviews, CI/CD |
| `codellama:13b-instruct` | 7.3GB | Medium | Better | Detailed reviews |
| `codellama:34b-instruct` | 19GB | Slow | Best | Comprehensive analysis |

### Custom Models

You can use other code-focused models:
- `deepseek-coder:6.7b-instruct`
- `starcoder2:7b-instruct`
- `codeqwen:7b-instruct`

## Troubleshooting

### Common Issues

#### Ollama Not Running
```bash
# Start Ollama server
ollama serve

# Check if running
curl http://localhost:11434/api/tags
```

#### Model Not Found
```bash
# List available models
ollama list

# Pull missing model
ollama pull codellama:7b-instruct

# Check model status
ai-code-review health
```

#### Slow Analysis
- Use smaller model: `codellama:7b-instruct`
- Reduce `maxTokens` in config
- Add more patterns to `excludePatterns`
- Increase `maxFileSize` limit

#### No Changes Detected
```bash
# Check git status
git status

# Ensure you're in a git repository
git init

# For unstaged changes
git add -N <new-files>

# For staged analysis
git add <files>
ai-code-review review --staged
```

#### Memory Issues
```bash
# Monitor Ollama memory usage
docker stats # if using Docker
ps aux | grep ollama

# Use smaller model
ollama pull codellama:7b-instruct
```

### Error Messages

| Error | Solution |
|-------|----------|
| `Current directory is not a Git repository` | Run `git init` or navigate to git repo |
| `Ollama server unavailable` | Start with `ollama serve` |
| `Model not found` | Download with `ollama pull <model>` |
| `Timeout when calling AI model` | Increase `timeout` in config |
| `File too large for analysis` | Increase `maxFileSize` or exclude file |

## Performance Tips

1. **Use appropriate model size** for your hardware
2. **Configure file exclusions** to skip unnecessary files
3. **Set reasonable timeouts** based on model speed
4. **Use staged analysis** for faster CI/CD pipelines
5. **Run health checks** before important analysis

## Advanced Usage

### Custom Prompts for Different Languages

```javascript
// Language-specific prompts
const prompts = {
  javascript: `Focus on: async/await usage, memory leaks, security vulnerabilities`,
  python: `Focus on: PEP 8 compliance, security issues, performance bottlenecks`,
  rust: `Focus on: unsafe code, borrowing issues, performance optimizations`,
  go: `Focus on: goroutine leaks, error handling, concurrency issues`
};
```

### Integration with IDEs

Use with VS Code tasks:

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AI Code Review",
      "type": "shell",
      "command": "ai-code-review",
      "args": ["review", "--quiet"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Ollama](https://ollama.ai/) for local AI model hosting
- [CodeLlama](https://github.com/facebookresearch/codellama) for code understanding
- Contributors and testers

---

**Made with ❤️ for developers who care about code quality** 
