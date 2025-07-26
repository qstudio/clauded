import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const CLAUDE_DIR = path.join(homedir(), '.claude');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'clauded-config.json');
const DEBUG_LOG = path.join(CLAUDE_DIR, 'clauded-debug.log');

// Debug logging function
async function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  try {
    await fs.appendFile(DEBUG_LOG, logEntry);
  } catch (error) {
    // Silently fail if we can't write to debug log
  }
}

export async function setConfidenceLevel(level) {
  try {
    await debugLog(`Setting confidence level to ${level}%`);
    
    // Validate confidence level is a number first
    if (isNaN(level) || !Number.isInteger(Number(level))) {
      await debugLog(`ERROR: Invalid confidence level ${level} - must be a number`);
      console.error(chalk.red('Error: Confidence level must be a number'));
      process.exit(1);
    }
    
    // Validate confidence level range
    if (level < 0 || level > 100) {
      await debugLog(`ERROR: Invalid confidence level ${level} - must be between 0 and 100`);
      console.error(chalk.red('Error: Confidence level must be between 0 and 100'));
      process.exit(1);
    }

    // Ensure config directory exists
    await fs.mkdir(CLAUDE_DIR, { recursive: true });

    // Read existing config or create new one
    let config = {};
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf8');
      config = JSON.parse(content);
      await debugLog(`Loaded existing config: ${JSON.stringify(config)}`);
    } catch (error) {
      // Config file doesn't exist, start with defaults
      await debugLog('No existing config found, starting fresh');
    }

    // Update confidence level
    config.minConfidence = level;

    // Write config
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    await debugLog('Updated config file with new confidence level');

    console.log(chalk.green(`✓ Minimum confidence level set to ${level}%`));
    
    // Update the validator script with new confidence level
    await updateValidatorConfidence(level);

  } catch (error) {
    await debugLog(`ERROR setting confidence level: ${error.message}`);
    console.error(chalk.red('Error setting confidence level:'), error.message);
    process.exit(1);
  }
}

export async function getConfidenceLevel() {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(content);
    const level = config.minConfidence || 50; // Default to 50%
    await debugLog(`Retrieved confidence level: ${level}%`);
    return level;
  } catch (error) {
    await debugLog('No config found, using default confidence level: 50%');
    return 50; // Default if config doesn't exist
  }
}

async function updateValidatorConfidence(level) {
  try {
    await debugLog(`Updating validator script with confidence level ${level}%`);
    const validatorPath = path.join(CLAUDE_DIR, 'clauded', 'hooks', 'confidence-validator.py');
    
    // Read current validator
    let validatorContent = await fs.readFile(validatorPath, 'utf8');
    
    // Update the confidence threshold in the validator
    validatorContent = validatorContent.replace(
      /min_confidence = \d+/,
      `min_confidence = ${level}`
    );
    
    // Write updated validator
    await fs.writeFile(validatorPath, validatorContent);
    await debugLog('Successfully updated validator script');
    
    console.log(chalk.green('✓ Updated confidence validator with new threshold'));
  } catch (error) {
    await debugLog(`WARNING: Could not update validator: ${error.message}`);
    console.log(chalk.yellow('⚠️  Could not update validator (may not be installed yet)'));
  }
}

// Export debug log path for CLI access
export { DEBUG_LOG }; 