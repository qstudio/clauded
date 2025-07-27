import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const CLAUDE_DIR = path.join(homedir(), '.claude');
const CLAUDED_DIR = path.join(CLAUDE_DIR, 'clauded');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'clauded-config.json');
const DEBUG_LOG = path.join(CLAUDE_DIR, 'clauded-debug.log');

export async function checkSystemHealth(detailed = false) {
  console.log(chalk.cyan.bold('\n🏥 Clauded System Health Check\n'));
  
  const results = {
    directories: await checkDirectories(),
    hooks: await checkHooks(),
    configuration: await checkConfiguration(),
    settings: await checkClaudeSettings(),
    performance: await checkPerformance()
  };
  
  // Summary
  const allHealthy = Object.values(results).every(check => check.status === 'healthy');
  const hasWarnings = Object.values(results).some(check => check.status === 'warning');
  
  if (allHealthy) {
    console.log(chalk.green.bold('✅ System Status: HEALTHY'));
  } else if (hasWarnings) {
    console.log(chalk.yellow.bold('⚠️  System Status: WARNING'));
  } else {
    console.log(chalk.red.bold('❌ System Status: UNHEALTHY'));
  }
  
  // Display results
  displayResults(results, detailed);
  
  // Recommendations
  if (!allHealthy) {
    console.log(chalk.cyan('\n💡 Recommendations:'));
    if (results.hooks.status !== 'healthy') {
      console.log(chalk.gray('   • Run "clauded setup" to reinstall hooks'));
    }
    if (results.configuration.status !== 'healthy') {
      console.log(chalk.gray('   • Check configuration with "clauded confidence --help"'));
    }
    if (results.settings.status !== 'healthy') {
      console.log(chalk.gray('   • Verify Claude Code settings integration'));
    }
  }
  
  console.log('');
}

async function checkDirectories() {
  const checks = [
    { path: CLAUDE_DIR, name: 'Claude directory' },
    { path: CLAUDED_DIR, name: 'Clauded directory' },
    { path: path.join(CLAUDED_DIR, 'hooks'), name: 'Hooks directory' },
    { path: path.join(CLAUDED_DIR, 'scripts'), name: 'Scripts directory' }
  ];
  
  const results = [];
  let allExist = true;
  
  for (const check of checks) {
    const exists = existsSync(check.path);
    results.push({
      name: check.name,
      exists,
      path: check.path
    });
    if (!exists) allExist = false;
  }
  
  return {
    status: allExist ? 'healthy' : 'error',
    message: allExist ? 'All directories exist' : 'Missing directories detected',
    details: results
  };
}

async function checkHooks() {
  const expectedHooks = [
    'confidence-unified-prompt.py',
    'confidence-unified-posttool.py'
  ];
  
  const results = [];
  let allExist = true;
  let totalSize = 0;
  
  for (const hookFile of expectedHooks) {
    const hookPath = path.join(CLAUDED_DIR, 'hooks', hookFile);
    const exists = existsSync(hookPath);
    
    let size = 0;
    let executable = false;
    if (exists) {
      try {
        const stats = await fs.stat(hookPath);
        size = stats.size;
        totalSize += size;
        executable = !!(stats.mode & parseInt('111', 8));
      } catch (error) {
        // Handle stat error
      }
    }
    
    results.push({
      name: hookFile,
      exists,
      executable,
      size,
      path: hookPath
    });
    
    if (!exists || !executable) allExist = false;
  }
  
  return {
    status: allExist ? 'healthy' : 'error',
    message: allExist ? `${expectedHooks.length} unified hooks installed` : 'Missing or non-executable hooks',
    details: results,
    totalSize
  };
}

async function checkConfiguration() {
  let config = null;
  let valid = false;
  let hasDefaults = false;
  
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, 'utf8');
      config = JSON.parse(content);
      valid = true;
      
      // Check for required fields
      const requiredFields = ['minConfidence', 'verbose'];
      hasDefaults = requiredFields.every(field => field in config);
    }
  } catch (error) {
    // Config file exists but is invalid
  }
  
  const status = valid && hasDefaults ? 'healthy' : 
                 valid ? 'warning' : 
                 'error';
  
  return {
    status,
    message: valid ? 
      (hasDefaults ? 'Configuration valid' : 'Configuration missing some defaults') :
      'Configuration file missing or invalid',
    details: {
      exists: existsSync(CONFIG_FILE),
      valid,
      config: config || {},
      path: CONFIG_FILE
    }
  };
}

async function checkClaudeSettings() {
  let settings = null;
  let hasHooks = false;
  let hookCount = 0;
  
  try {
    if (existsSync(SETTINGS_FILE)) {
      const content = await fs.readFile(SETTINGS_FILE, 'utf8');
      settings = JSON.parse(content);
      
      if (settings.hooks) {
        hasHooks = true;
        // Count registered hooks
        Object.values(settings.hooks).forEach(hookArray => {
          if (Array.isArray(hookArray)) {
            hookCount += hookArray.length;
          }
        });
      }
    }
  } catch (error) {
    // Settings file invalid
  }
  
  const status = hasHooks ? 'healthy' : 'warning';
  
  return {
    status,
    message: hasHooks ? `${hookCount} hooks registered in Claude settings` : 'No hooks found in Claude settings',
    details: {
      exists: existsSync(SETTINGS_FILE),
      hasHooks,
      hookCount,
      path: SETTINGS_FILE
    }
  };
}

async function checkPerformance() {
  let logSize = 0;
  let logLines = 0;
  let recentErrors = 0;
  
  try {
    if (existsSync(DEBUG_LOG)) {
      const stats = await fs.stat(DEBUG_LOG);
      logSize = stats.size;
      
      const content = await fs.readFile(DEBUG_LOG, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      logLines = lines.length;
      
      // Check for recent errors (last 50 lines)
      const recentLines = lines.slice(-50);
      recentErrors = recentLines.filter(line => 
        line.toLowerCase().includes('error') || 
        line.toLowerCase().includes('failed')
      ).length;
    }
  } catch (error) {
    // Log file issues
  }
  
  const status = recentErrors > 5 ? 'warning' : 'healthy';
  
  return {
    status,
    message: recentErrors > 5 ? 
      `${recentErrors} recent errors detected` : 
      'Performance metrics normal',
    details: {
      logExists: existsSync(DEBUG_LOG),
      logSize,
      logLines,
      recentErrors,
      logPath: DEBUG_LOG
    }
  };
}

function displayResults(results, detailed) {
  for (const [category, result] of Object.entries(results)) {
    const icon = result.status === 'healthy' ? '✅' : 
                 result.status === 'warning' ? '⚠️' : '❌';
    
    console.log(`${icon} ${chalk.bold(category.charAt(0).toUpperCase() + category.slice(1))}: ${result.message}`);
    
    if (detailed && result.details) {
      if (category === 'directories') {
        result.details.forEach(dir => {
          const dirIcon = dir.exists ? '✓' : '✗';
          console.log(chalk.gray(`   ${dirIcon} ${dir.name}: ${dir.path}`));
        });
      } else if (category === 'hooks') {
        result.details.forEach(hook => {
          const hookIcon = hook.exists && hook.executable ? '✓' : '✗';
          console.log(chalk.gray(`   ${hookIcon} ${hook.name} (${hook.size} bytes)`));
        });
        console.log(chalk.gray(`   Total size: ${result.totalSize} bytes`));
      } else if (category === 'configuration') {
        console.log(chalk.gray(`   Path: ${result.details.path}`));
        if (result.details.config.minConfidence) {
          console.log(chalk.gray(`   Min confidence: ${result.details.config.minConfidence}%`));
        }
        if (result.details.config.verbose !== undefined) {
          console.log(chalk.gray(`   Verbose mode: ${result.details.config.verbose}`));
        }
      } else if (category === 'performance') {
        console.log(chalk.gray(`   Log size: ${Math.round(result.details.logSize / 1024)}KB`));
        console.log(chalk.gray(`   Log lines: ${result.details.logLines}`));
        console.log(chalk.gray(`   Recent errors: ${result.details.recentErrors}`));
      }
    }
  }
}