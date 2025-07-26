# Clauded Development Guide

## Running Clauded Locally

### Method 1: npm link (Recommended for Development)

```bash
# In the clauded project directory
npm install
npm link

# Now you can use clauded from anywhere
clauded --help
clauded setup
clauded confidence 75
clauded logs
```

### Method 2: Direct Execution

```bash
# From the project directory
node bin/clauded.js --help
node bin/clauded.js setup
node bin/clauded.js confidence 75
```

### Method 3: Local Script

```bash
# From the project directory
./run-local.sh --help
./run-local.sh setup
./run-local.sh confidence 75
```

### Method 4: npx (for testing)

```bash
# If published to npm
npx clauded --help
npx clauded setup
```

## Development Workflow

1. **Make changes** to the code
2. **Test locally** using any of the methods above
3. **npm link** to use globally during development
4. **Test the validator** by making changes with Claude
5. **Check logs** with `clauded logs --follow`

## File Structure

```
npm-clauded/
├── bin/clauded.js          # Main CLI entry point
├── src/
│   ├── index.js            # Main exports
│   ├── confidence-manager.js # Confidence level management
│   └── setup/
│       ├── installer.js    # Installation logic
│       ├── wizard.js       # Setup wizard
│       └── detector.js     # OS detection
├── run-local.sh            # Local execution script
└── package.json            # Package configuration
```

## Testing

```bash
# Test confidence validation
clauded confidence 75
clauded confidence abc  # Should fail

# Test setup
clauded setup

# Test logs
clauded logs
clauded logs --follow
clauded logs --clear

# Debug logging includes:
# - User input context (truncated for readability)
# - Response analysis details
# - Confidence statement detection
# - Threshold validation results
# - User feedback: Always shows confidence validation results

# Test uninstall
clauded uninstall
```

## Publishing

When ready to publish:

```bash
npm version patch  # or minor/major
npm publish
```

## Troubleshooting

### Command not found
- Run `npm link` in the project directory
- Check `which clauded` to see which version is being used
- Ensure PATH is correct: `echo $PATH | grep homebrew`

### Permission errors
- Check file permissions: `ls -la bin/clauded.js`
- Make executable: `chmod +x bin/clauded.js`

### Module not found
- Ensure dependencies are installed: `npm install`
- Check node_modules exists: `ls node_modules/commander` 