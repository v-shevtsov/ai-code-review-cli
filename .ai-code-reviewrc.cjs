module.exports = {
  modelUrl: 'http://localhost:11434',
  modelName: 'codellama:7b-instruct',
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
    'coverage/',
    '\\.git/',
    '\\.test\\.',
    '\\.spec\\.',
    '__tests__/',
    '\\.min\\.',
    'package-lock\\.json',
    'yarn\\.lock',
    'pnpm-lock\\.yaml',
    '\\.(jpg|jpeg|png|gif|webp|svg|ico|woff|woff2|ttf|eot|pdf)$',
    '\\.log$',
    'Dockerfile',
    'docker-compose\\.',
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
