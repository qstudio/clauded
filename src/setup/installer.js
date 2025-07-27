import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { getShellConfig } from './detector.js';

const CLAUDE_DIR = path.join(homedir(), '.claude');
const CLAUDED_DIR = path.join(CLAUDE_DIR, 'clauded');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

async function createBackup() {
  const backup = {
    settingsExists: false,
    settingsContent: null,
    claudedDirExists: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Check if settings file exists and backup its content
    if (existsSync(SETTINGS_FILE)) {
      backup.settingsExists = true;
      backup.settingsContent = await fs.readFile(SETTINGS_FILE, 'utf8');
    }

    // Check if clauded directory exists
    if (existsSync(CLAUDED_DIR)) {
      backup.claudedDirExists = true;
    }

    console.log(chalk.gray('📋 Created installation backup'));
    return backup;
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not create backup, proceeding without rollback capability'));
    return backup;
  }
}

async function rollbackChanges(backup) {
  try {
    console.log(chalk.yellow('🔄 Rolling back installation changes...'));

    // Remove clauded directory if it didn't exist before
    if (!backup.claudedDirExists && existsSync(CLAUDED_DIR)) {
      await fs.rm(CLAUDED_DIR, { recursive: true, force: true });
      console.log(chalk.gray('   • Removed clauded directory'));
    }

    // Restore settings file
    if (backup.settingsExists && backup.settingsContent) {
      await fs.writeFile(SETTINGS_FILE, backup.settingsContent);
      console.log(chalk.gray('   • Restored settings.json'));
    } else if (!backup.settingsExists && existsSync(SETTINGS_FILE)) {
      // Remove settings file if it didn't exist before
      await fs.unlink(SETTINGS_FILE);
      console.log(chalk.gray('   • Removed settings.json'));
    }

    // Remove from PATH (best effort)
    try {
      const { getShellConfig } = await import('./detector.js');
      const shellConfig = getShellConfig();
      let content = await fs.readFile(shellConfig, 'utf8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => 
        !line.includes('clauded') && 
        !line.includes('clauded/scripts')
      );
      
      if (filtered.length !== lines.length) {
        await fs.writeFile(shellConfig, filtered.join('\n'));
        console.log(chalk.gray('   • Removed from PATH'));
      }
    } catch (error) {
      // PATH cleanup is best effort, don't fail rollback
    }

    console.log(chalk.green('✅ Rollback completed successfully'));
  } catch (error) {
    console.log(chalk.red('❌ Rollback failed:'), error.message);
    console.log(chalk.yellow('   Manual cleanup may be required'));
  }
}

export async function installClaudedSystem(config) {
  const backupData = await createBackup();
  
  try {
    // Ensure directories exist
    await ensureDirectories();
    
    // Install unified hooks (consolidates 4 hooks into 2 for better performance)
    await installUnifiedPromptHook(config);
    await installUnifiedPostToolHook();
    
    // Install clauded command script
    await installClaudedCommand();
    
    // Update Claude settings to include all hooks
    await updateClaudeSettings();
    
    // Add clauded command to PATH
    await addToPath();
    
    console.log(chalk.green('✅ Installation completed successfully'));
    
  } catch (error) {
    console.log(chalk.red('❌ Installation failed, rolling back changes...'));
    await rollbackChanges(backupData);
    throw error;
  }
}

async function ensureDirectories() {
  await fs.mkdir(path.join(CLAUDED_DIR, 'hooks'), { recursive: true });
  await fs.mkdir(path.join(CLAUDED_DIR, 'scripts'), { recursive: true });
}

async function installUnifiedPromptHook(_config) {
  const hookPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-unified-prompt.py');
  const sourcePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'confidence-unified-prompt.py');
  
  try {
    await fs.copyFile(sourcePath, hookPath);
    await fs.chmod(hookPath, 0o755); // Make executable
    console.log(chalk.green('✓ Installed unified prompt hook (UserPromptSubmit)'));
  } catch (error) {
    throw new Error(`Failed to install unified prompt hook: ${error.message}`);
  }
}

async function installUnifiedPostToolHook() {
  const hookPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-unified-posttool.py');
  const sourcePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'confidence-unified-posttool.py');
  
  try {
    await fs.copyFile(sourcePath, hookPath);
    await fs.chmod(hookPath, 0o755); // Make executable
    console.log(chalk.green('✓ Installed unified PostToolUse hook'));
  } catch (error) {
    throw new Error(`Failed to install unified PostToolUse hook: ${error.message}`);
  }
}

async function installConfidenceNotificationHook() {
  const hookPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-notification-hook.py');
  const sourcePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'confidence-notification-hook.py');
  
  try {
    // Copy the notification hook file
    await fs.copyFile(sourcePath, hookPath);
    await fs.chmod(hookPath, 0o755);
    console.log(chalk.green('✓ Installed confidence notification hook'));
  } catch (error) {
    console.log(chalk.red(`❌ Failed to install notification hook: ${error.message}`));
    throw error;
  }
}

async function installClaudedCommand() {
  const commandPath = path.join(CLAUDED_DIR, 'scripts', 'clauded');
  const sourcePath = path.join(process.cwd(), 'bin', 'clauded.js');
  
  try {
    // Copy the clauded.js file to the scripts directory
    await fs.copyFile(sourcePath, commandPath);
    console.log(chalk.green('✓ Installed clauded command'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not install clauded command (using npm link instead)'));
  }
}

async function updateClaudeSettings() {
  const settingsPath = path.join(homedir(), '.claude', 'settings.json');
  
  try {
    let settings = {};
    if (existsSync(settingsPath)) {
      const content = await fs.readFile(settingsPath, 'utf8');
      settings = JSON.parse(content);
    }
  
    // Initialize hooks if they don't exist
    if (!settings.hooks) {
      settings.hooks = {};
    }
  
    // Initialize UserPromptSubmit if it doesn't exist
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }
        
    // Initialize PostToolUse if it doesn't exist
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }
    
    // Initialize Notification if it doesn't exist
    if (!settings.hooks.Notification) {
      settings.hooks.Notification = [];
    }
        
    // Check if validator hook is already registered
    const validatorPath = path.join(homedir(), '.claude', 'clauded', 'hooks', 'confidence-validator.py');
    const existingValidatorHook = settings.hooks.UserPromptSubmit.find(hookGroup => 
      hookGroup.hooks && hookGroup.hooks.some(hook => 
        hook.command === validatorPath
      )
    );
        
    // Check if scorer hook is already registered
    const scorerPath = path.join(homedir(), '.claude', 'clauded', 'hooks', 'confidence-scorer.py');
    const existingScorerHook = settings.hooks.PostToolUse.find(hookGroup => 
      hookGroup.hooks && hookGroup.hooks.some(hook => 
        hook.command === scorerPath
      )
    );
        
    // Check if confidence display hook is already registered
    const displayPath = path.join(homedir(), '.claude', 'clauded', 'hooks', 'confidence-score-display.py');
    const existingDisplayHook = settings.hooks.UserPromptSubmit.find(hookGroup => 
      hookGroup.hooks && hookGroup.hooks.some(hook => 
        hook.command === displayPath
      )
    );
    
    // Check if notification hook is already registered
    const notificationPath = path.join(homedir(), '.claude', 'clauded', 'hooks', 'confidence-notification-hook.py');
    const existingNotificationHook = settings.hooks.Notification.find(hookGroup => 
      hookGroup.hooks && hookGroup.hooks.some(hook => 
        hook.command === notificationPath
      )
    );
        
    let modified = false;
        
    if (!existingValidatorHook) {
      // Add confidence validator hook to UserPromptSubmit
      settings.hooks.UserPromptSubmit.push({
        hooks: [
          {
            type: 'command',
            command: validatorPath
          }
        ]
      });
      modified = true;
      console.log('✅ Confidence validator hook added to UserPromptSubmit');
    } else {
      console.log('✅ Confidence validator hook already registered');
    }
        
    if (!existingScorerHook) {
      // Add confidence scorer hook to PostToolUse
      settings.hooks.PostToolUse.push({
        hooks: [
          {
            type: 'command',
            command: scorerPath
          }
        ]
      });
      modified = true;
      console.log('✅ Confidence scorer hook added to PostToolUse');
    } else {
      console.log('✅ Confidence scorer hook already registered');
    }
        
    if (!existingDisplayHook) {
      // Add confidence score display hook to UserPromptSubmit
      settings.hooks.UserPromptSubmit.push({
        hooks: [
          {
            type: 'command',
            command: displayPath
          }
        ]
      });
      modified = true;
      console.log('✅ Confidence score display hook added to UserPromptSubmit');
    } else {
      console.log('✅ Confidence score display hook already registered');
    }
    
    if (!existingNotificationHook) {
      // Add confidence notification hook to Notification
      settings.hooks.Notification.push({
        hooks: [
          {
            type: 'command',
            command: notificationPath
          }
        ]
      });
      modified = true;
      console.log('✅ Confidence notification hook added to Notification');
    } else {
      console.log('✅ Confidence notification hook already registered');
    }
        
    if (modified) {
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    }
  } catch (error) {
    console.error('❌ Error updating Claude settings:', error.message);
    throw error;
  }
}

async function addToPath() {
  const shellConfig = getShellConfig();
  const scriptsPath = path.join(CLAUDED_DIR, 'scripts');
  
  try {
    let content = await fs.readFile(shellConfig, 'utf8');
    
    // Check if already added
    if (content.includes('clauded')) {
      return;
    }
    
    // Add to PATH
    const pathLine = `\n# Clauded - Added by clauded\nexport PATH="${scriptsPath}:$PATH"\n`;
    
    content += pathLine;
    await fs.writeFile(shellConfig, content);
    
    console.log(chalk.yellow(`\n📝  Added clauded command to ${path.basename(shellConfig)}`));
    console.log(chalk.cyan('\n💡  To use immediately, run:'));
    console.log(chalk.white.bold(`   source ${shellConfig}\n`));
    
  } catch (error) {
    console.error(chalk.red(`\n⚠️  Could not add to PATH: ${error.message}`));
    console.log(chalk.gray('   You can manually add this to your shell config:'));
    console.log(chalk.cyan(`   export PATH="${scriptsPath}:$PATH"`));
  }
}

export async function uninstall() {
  console.log(chalk.yellow('\n🗑️  Uninstalling Clauded...\n'));
  
  try {
    // Remove hooks from settings
    try {
      const content = await fs.readFile(SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(content);
      
      if (settings.hooks) {
        let modified = false;
        
        // Handle PostToolUse hooks (remove both validator and scorer)
        if (settings.hooks.PostToolUse) {
          if (Array.isArray(settings.hooks.PostToolUse)) {
            settings.hooks.PostToolUse.forEach(postToolHook => {
              if (postToolHook.hooks && Array.isArray(postToolHook.hooks)) {
                const filteredHooks = postToolHook.hooks.filter(hook => 
                  !hook.command || (!hook.command.includes('confidence-validator.py') && !hook.command.includes('confidence-scorer.py'))
                );
                if (filteredHooks.length !== postToolHook.hooks.length) {
                  postToolHook.hooks = filteredHooks;
                  modified = true;
                }
              }
            });
            
            // Remove empty PostToolUse hooks
            settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(postToolHook => 
              postToolHook.hooks && postToolHook.hooks.length > 0
            );
            
            if (settings.hooks.PostToolUse.length === 0) {
              delete settings.hooks.PostToolUse;
            }
          }
        }
        
        // Handle Stop hooks (for backward compatibility)
        if (settings.hooks.Stop) {
        // Handle array format
          if (Array.isArray(settings.hooks.Stop)) {
            settings.hooks.Stop.forEach(stopHook => {
              if (stopHook.hooks && Array.isArray(stopHook.hooks)) {
                const filteredHooks = stopHook.hooks.filter(hook => 
                  !hook.command || !hook.command.includes('confidence-validator.py')
                );
                if (filteredHooks.length !== stopHook.hooks.length) {
                  stopHook.hooks = filteredHooks;
                  modified = true;
                }
              }
            });
          
            // Remove empty Stop hooks
            settings.hooks.Stop = settings.hooks.Stop.filter(stopHook => 
              stopHook.hooks && stopHook.hooks.length > 0
            );
          
            if (settings.hooks.Stop.length === 0) {
              delete settings.hooks.Stop;
            }
          } else if (typeof settings.hooks.Stop === 'string' && settings.hooks.Stop.includes('confidence-validator.py')) {
          // Handle old string format
            delete settings.hooks.Stop;
            modified = true;
          }
        }
        
        // Handle Before hooks (for backward compatibility)
        if (settings.hooks.Before) {
          // Handle array format
          if (Array.isArray(settings.hooks.Before)) {
            settings.hooks.Before.forEach(beforeHook => {
              if (beforeHook.hooks && Array.isArray(beforeHook.hooks)) {
                const filteredHooks = beforeHook.hooks.filter(hook => 
                  !hook.command || !hook.command.includes('confidence-validator.py')
                );
                if (filteredHooks.length !== beforeHook.hooks.length) {
                  beforeHook.hooks = filteredHooks;
                  modified = true;
                }
              }
            });
            
            // Remove empty Before hooks
            settings.hooks.Before = settings.hooks.Before.filter(beforeHook => 
              beforeHook.hooks && beforeHook.hooks.length > 0
            );
            
            if (settings.hooks.Before.length === 0) {
              delete settings.hooks.Before;
            }
          } else if (typeof settings.hooks.Before === 'string' && settings.hooks.Before.includes('confidence-validator.py')) {
            // Handle old string format
            delete settings.hooks.Before;
            modified = true;
          }
        }
        
        if (modified) {
          await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          console.log(chalk.green('✓ Removed confidence validator hook from settings'));
        }
      }
    } catch (error) {
      // Settings file doesn't exist or is invalid
    }
    
    // Remove from PATH
    const shellConfig = getShellConfig();
    try {
      let content = await fs.readFile(shellConfig, 'utf8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => 
        !line.includes('clauded') && 
        !line.includes('clauded/scripts')
      );
      
      if (filtered.length !== lines.length) {
        await fs.writeFile(shellConfig, filtered.join('\n'));
        console.log(chalk.green('✓ Removed from PATH'));
      }
    } catch (error) {
      // Shell config doesn't exist
    }
    
    // Remove clauded directory
    try {
      await fs.rm(CLAUDED_DIR, { recursive: true, force: true });
      console.log(chalk.green('✓ Removed clauded directory'));
    } catch (error) {
      // Directory doesn't exist
    }
    
    console.log(chalk.green('\n✅ Clauded uninstalled successfully!\n'));
  } catch (error) {
    console.error(chalk.red('❌ Error during uninstall:'), error.message);
    throw error;
  }
}