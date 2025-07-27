#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { setupWizard } from '../src/setup/wizard.js';
import { uninstall } from '../src/setup/installer.js';
import { setConfidenceLevel, setVerboseMode, DEBUG_LOG } from '../src/confidence-manager.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;

program
  .name('clauded')
  .description('Tame Claude - reduce risk and time wasting. Confidence validation is just the first step.')
  .version(version);

program
  .command('setup')
  .description('Run the interactive setup wizard')
  .option('--auto', 'Run setup with default values (non-interactive)')
  .option('--confidence <level>', 'Set minimum confidence level (default: 50)')
  .action(async (options) => {
    if (options.auto) {
      const { installClaudedSystem } = await import('../src/setup/installer.js');
      const { detectOS } = await import('../src/setup/detector.js');
      
      const config = {
        minConfidence: parseInt(options.confidence) || 50,
        os: detectOS()
      };
      
      console.log(chalk.cyan.bold('\n🚀  Auto-installing Clauded...\n'));
      await installClaudedSystem(config);
      console.log(chalk.green.bold('\n✅  Clauded installed successfully!\n'));
    } else {
      await setupWizard();
    }
  });

program
  .command('uninstall')
  .description('Remove clauded system')
  .action(async () => {
    await uninstall();
  });

program
  .command('restart')
  .description('Restart Claude session in same window')
  .action(async () => {
    console.log(chalk.yellow('🔄 Restarting Claude session...'));
    
    // Kill current Claude process if running
    try {
      const { execSync } = await import('child_process');
      execSync('pkill -f "claude"', { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      // Process might not be running, continue
    }
    
    // Restart Claude in same window
    try {
      const { spawn } = await import('child_process');
      const claude = spawn('claude', [], {
        stdio: 'inherit',
        detached: false
      });
      
      console.log(chalk.green('✅ Claude session restarted'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('❌ Failed to restart Claude:', error.message));
      process.exit(1);
    }
  });

program
  .command('confidence <level>')
  .description('Set minimum confidence level (0-100)')
  .action(async (level) => {
    const confidenceLevel = parseInt(level);
    if (isNaN(confidenceLevel)) {
      console.error(chalk.red('Error: Confidence level must be a number'));
      process.exit(1);
    }
    await setConfidenceLevel(confidenceLevel);
  });

program
  .command('verbose <enabled>')
  .description('Enable or disable verbose output (true/false)')
  .action(async (enabled) => {
    const enabledLower = enabled.toLowerCase();
    if (enabledLower !== 'true' && enabledLower !== 'false') {
      console.error(chalk.red('Error: Verbose setting must be "true" or "false"'));
      process.exit(1);
    }
    await setVerboseMode(enabledLower === 'true');
  });

program
  .command('status')
  .description('Check system health and configuration status')
  .option('--detailed', 'Show detailed diagnostics')
  .action(async (options) => {
    const { checkSystemHealth } = await import('../src/system-health.js');
    await checkSystemHealth(options.detailed);
  });

program
  .command('logs')
  .description('View debug logs')
  .option('-f, --follow', 'Follow log file in real-time')
  .option('-c, --clear', 'Clear all debug logs')
  .action(async (options) => {
    if (options.clear) {
      try {
        if (existsSync(DEBUG_LOG)) {
          writeFileSync(DEBUG_LOG, '');
          console.log(chalk.green('✓ Debug logs cleared'));
        } else {
          console.log(chalk.yellow('No debug log file found to clear.'));
        }
      } catch (error) {
        console.error(chalk.red('Error clearing logs:'), error.message);
      }
      return;
    }
    
    if (!existsSync(DEBUG_LOG)) {
      console.log(chalk.yellow('No debug log file found. Run some clauded commands first.'));
      return;
    }
    
    if (options.follow) {
      console.log(chalk.cyan('Following debug log (Ctrl+C to stop):'));
      console.log(chalk.gray('Log file: ' + DEBUG_LOG));
      console.log('');
      
      // Simple tail implementation
      const { spawn } = await import('child_process');
      const tail = spawn('tail', ['-f', DEBUG_LOG]);
      
      tail.stdout.on('data', (data) => {
        process.stdout.write(data);
      });
      
      tail.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
      
      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      console.log(chalk.cyan('Debug log contents:'));
      console.log(chalk.gray('Log file: ' + DEBUG_LOG));
      console.log('');
      
      try {
        const content = readFileSync(DEBUG_LOG, 'utf8');
        if (content.trim()) {
          console.log(content);
        } else {
          console.log(chalk.yellow('Log file is empty.'));
        }
      } catch (error) {
        console.error(chalk.red('Error reading log file:'), error.message);
      }
    }
  });

// Default action - run setup
program
  .action(async () => {
    await setupWizard();
  });

program.parse(process.argv);