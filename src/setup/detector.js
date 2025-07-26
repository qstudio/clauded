import { platform } from 'os';

export function detectOS() {
  const osPlatform = platform();
  
  switch (osPlatform) {
  case 'darwin':
    return 'macOS';
  case 'win32':
    return 'Windows';
  case 'linux':
    return 'Linux';
  default:
    return osPlatform;
  }
}

export function getShellConfig() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const shell = process.env.SHELL || '';
  
  if (shell.includes('zsh')) {
    return `${homeDir}/.zshrc`;
  } else if (shell.includes('bash')) {
    return `${homeDir}/.bashrc`;
  } else if (process.platform === 'win32') {
    return `${homeDir}/.bashrc`; // Git Bash on Windows
  }
  
  // Default to bashrc
  return `${homeDir}/.bashrc`;
}