# Publishing to NPM

## Prerequisites

1. **Create npm account**: https://www.npmjs.com/signup
2. **Login to npm**:
   ```bash
   npm login
   ```

## Before Publishing

### 1. Update package.json

Replace placeholder values in `package.json`:

```json
{
  "name": "@your-username/ai-code-review-cli",  // Replace with your npm username
  "author": "Your Name <your.email@example.com>",  // Your info
  "repository": {
    "url": "git+https://github.com/your-username/ai-code-review-cli.git"  // Your repo
  },
  "bugs": {
    "url": "https://github.com/your-username/ai-code-review-cli/issues"  // Your repo
  },
  "homepage": "https://github.com/your-username/ai-code-review-cli#readme"  // Your repo
}
```

### 2. Update README.md

Replace installation commands in README.md:
```bash
# Change this:
npm install -g @your-username/ai-code-review-cli

# To your actual package name:
npm install -g @your-actual-username/ai-code-review-cli
```

### 3. Create GitHub repository

1. Create repository on GitHub
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial release"
   git branch -M main
   git remote add origin https://github.com/your-username/ai-code-review-cli.git
   git push -u origin main
   ```

## Publishing Steps

### 1. Final build and test

```bash
# Clean build
npm run build

# Test locally
npm link
ai-code-review --help

# Test package contents
npm pack --dry-run
```

### 2. Publish to npm

```bash
# Login if not already
npm login

# Publish
npm publish
```

### 3. Verify publication

```bash
# Check on npm
npm view @your-username/ai-code-review-cli

# Test installation
npm install -g @your-username/ai-code-review-cli
```

## Alternative: Scoped Package

If you want to publish under your own scope:

```bash
# Make sure you're logged in
npm login

# Publish with public access
npm publish --access public
```

## Updating the Package

For future updates:

```bash
# Update version
npm version patch  # for bug fixes
npm version minor  # for new features  
npm version major  # for breaking changes

# Publish update
npm publish
```

## Package Name Suggestions

If `@your-username/ai-code-review-cli` is taken, try:
- `@your-username/ai-code-reviewer`
- `@your-username/ollama-code-review`
- `@your-username/local-ai-review`
- `ai-code-review-local`
- `ollama-code-reviewer`

## Troubleshooting

### Package name taken
```bash
npm view package-name  # Check if name exists
```

### Authentication issues
```bash
npm whoami  # Check if logged in
npm login   # Login again
```

### Build issues
```bash
rm -rf dist node_modules
npm install
npm run build
```

## Post-Publication

1. **Add badges to README**:
   ```markdown
   [![npm version](https://badge.fury.io/js/@your-username%2Fai-code-review-cli.svg)](https://badge.fury.io/js/@your-username%2Fai-code-review-cli)
   [![downloads](https://img.shields.io/npm/dm/@your-username/ai-code-review-cli.svg)](https://www.npmjs.com/package/@your-username/ai-code-review-cli)
   ```

2. **Share on**:
   - Twitter/X
   - Reddit (r/javascript, r/programming)
   - Dev.to
   - Hacker News

3. **Consider adding**:
   - GitHub Actions for auto-publishing
   - Automated testing
   - Changelog generation 
