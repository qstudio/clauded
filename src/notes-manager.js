import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const NOTES_DIR = join(homedir(), '.clauded');
const NOTES_FILE = join(NOTES_DIR, 'notes.json');

function ensureNotesDir() {
  if (!existsSync(NOTES_DIR)) {
    mkdirSync(NOTES_DIR, { recursive: true });
  }
}

function loadNotes() {
  ensureNotesDir();
  if (!existsSync(NOTES_FILE)) {
    return [];
  }
  try {
    const content = readFileSync(NOTES_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not load notes file, starting fresh'));
    return [];
  }
}

function saveNotes(notes) {
  ensureNotesDir();
  try {
    writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf8');
  } catch (error) {
    console.error(chalk.red('Error saving notes:'), error.message);
  }
}

export function addNote(message) {
  const notes = loadNotes();
  const note = {
    id: Date.now(),
    message,
    timestamp: new Date().toISOString(),
    cwd: process.cwd()
  };
  
  notes.unshift(note); // Add to beginning
  
  // Keep only last 20 notes
  if (notes.length > 20) {
    notes.splice(20);
  }
  
  saveNotes(notes);
  console.log(chalk.green('✓ Note saved'));
}

export function addRestartNote(customMessage = null) {
  const notes = loadNotes();
  
  // Get recent context from existing notes
  const recentNotes = notes.slice(0, 3);
  let contextSummary = '';
  
  if (recentNotes.length > 0) {
    contextSummary = recentNotes.map(note => note.message).join('; ');
    if (contextSummary.length > 100) {
      contextSummary = contextSummary.substring(0, 100) + '...';
    }
  }
  
  const message = customMessage || 
    (contextSummary ? `Restarted Claude. Previous context: ${contextSummary}` : 'Restarted Claude session');
  
  const note = {
    id: Date.now(),
    message,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    type: 'restart'
  };
  
  notes.unshift(note);
  
  // Keep only last 20 notes
  if (notes.length > 20) {
    notes.splice(20);
  }
  
  saveNotes(notes);
  console.log(chalk.blue('📝 Context note saved for restart'));
}

export function displayRecentNotes(count = 3) {
  const notes = loadNotes();
  
  if (notes.length === 0) {
    return;
  }
  
  console.log(chalk.cyan.bold('\n📝 Recent Notes:'));
  
  const recentNotes = notes.slice(0, count);
  recentNotes.forEach((note, index) => {
    const timeAgo = getTimeAgo(note.timestamp);
    const cwd = note.cwd === process.cwd() ? 'this directory' : note.cwd;
    
    console.log(chalk.gray(`  ${index + 1}. ${timeAgo} in ${cwd}:`));
    console.log(chalk.white(`     ${note.message}`));
  });
  
  if (notes.length > count) {
    console.log(chalk.gray(`     ... and ${notes.length - count} more notes (use 'clauded notes' to see all)`));
  }
  console.log('');
}

export function listAllNotes() {
  const notes = loadNotes();
  
  if (notes.length === 0) {
    console.log(chalk.yellow('No notes found. Use "clauded note -m \'your message\'" to create one.'));
    return;
  }
  
  console.log(chalk.cyan.bold('\n📝 All Notes:'));
  
  notes.forEach((note, index) => {
    const timeAgo = getTimeAgo(note.timestamp);
    const cwd = note.cwd === process.cwd() ? 'this directory' : note.cwd;
    
    console.log(chalk.gray(`  ${index + 1}. ${timeAgo} in ${cwd}:`));
    console.log(chalk.white(`     ${note.message}`));
  });
  console.log('');
}

export function clearNotes() {
  ensureNotesDir();
  try {
    if (existsSync(NOTES_FILE)) {
      writeFileSync(NOTES_FILE, JSON.stringify([], null, 2), 'utf8');
      console.log(chalk.green('✓ All notes cleared'));
    } else {
      console.log(chalk.yellow('No notes file found to clear.'));
    }
  } catch (error) {
    console.error(chalk.red('Error clearing notes:'), error.message);
  }
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}