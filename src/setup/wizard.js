import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { installClaudedSystem } from './installer.js';
import { detectOS } from './detector.js';

export async function setupWizard() {
  console.log(chalk.cyan.bold('\n🚀  Welcome to Clauded Setup!\n'));
  
  console.log(chalk.gray('This will install confidence validation for Claude Code.'));
  console.log(chalk.gray('Responses with code changes will require confidence statements.\n'));

  try {
    // Step 1: Confirm installation
    const { confirmInstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmInstall',
        message: 'Install confidence validator for Claude Code?',
        default: true
      }
    ]);

    if (!confirmInstall) {
      console.log(chalk.yellow('\nInstallation cancelled.'));
      return;
    }

    // Step 2: Configuration options
    console.log(chalk.cyan('\nConfiguration options:\n'));
    
    const { minConfidence } = await inquirer.prompt([
      {
        type: 'number',
        name: 'minConfidence',
        message: 'Minimum confidence level required (0-100):',
        default: 50,
        validate: (input) => {
          const num = parseInt(input);
          if (isNaN(num)) return 'Please enter a valid number';
          if (num < 0 || num > 100) return 'Please enter a number between 0 and 100';
          return true;
        }
      }
    ]);

    // Step 3: Installation
    const spinner = ora('Installing confidence validator...').start();

    try {
      const config = {
        minConfidence,
        os: detectOS()
      };

      await installClaudedSystem(config);
      
      spinner.succeed('Confidence validator installed successfully!');
    } catch (installError) {
      spinner.fail('Installation failed');
      
      console.log(chalk.red('\n❌ Installation error details:'));
      console.log(chalk.gray(`   ${installError.message}`));
      
      if (installError.code === 'PERMISSION_DENIED') {
        console.log(chalk.yellow('\n💡 Try running with elevated permissions (sudo).'));
      } else if (installError.code === 'DEPENDENCY_MISSING') {
        console.log(chalk.yellow('\n💡 Install missing dependencies and try again.'));
      }
      
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Would you like to retry the installation?',
          default: false
        }
      ]);
      
      if (retry) {
        return setupWizard(); // Recursive retry
      } else {
        throw installError;
      }
    }

    // Step 4: Show success message and instructions
    console.log(chalk.green.bold('\n✅  Clauded is ready!\n'));

    console.log(chalk.cyan('📊  Configuration summary:'));
    console.log(chalk.gray(`   • Minimum confidence: ${minConfidence}%`));
    
    console.log(chalk.gray('\n'));

    console.log(chalk.cyan('🔒  Confidence validation is now active!'));
    console.log(chalk.gray('   Responses with code changes must include confidence statements.\n'));

    console.log(chalk.cyan('🛠️  Available commands:'));
    console.log(chalk.gray('   • ') + 'clauded confidence 75  - Set minimum confidence to 75%');
    console.log(chalk.gray('   • ') + 'clauded setup         - Re-run setup wizard');
    console.log(chalk.gray('   • ') + 'clauded status        - Check current configuration');
    console.log(chalk.gray('   • ') + 'clauded uninstall     - Remove clauded\n');

    console.log(chalk.yellow('💡  Try making a change with Claude to test the confidence validation!\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error.message);
    
    if (error.stack && process.env.DEBUG) {
      console.log(chalk.gray('\nDebug stack trace:'));
      console.log(chalk.gray(error.stack));
    }
    
    console.log(chalk.yellow('\n💡 For help, try:'));
    console.log(chalk.gray('   • Check the documentation'));
    console.log(chalk.gray('   • Run with DEBUG=1 for detailed error info'));
    console.log(chalk.gray('   • Report issues on GitHub\n'));
    
    process.exit(1);
  }
}