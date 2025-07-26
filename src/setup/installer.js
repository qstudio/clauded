import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { getShellConfig } from './detector.js';

const CLAUDE_DIR = path.join(homedir(), '.claude');
const CLAUDED_DIR = path.join(CLAUDE_DIR, 'clauded');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

export async function installClaudedSystem(config) {
  // Ensure directories exist
  await ensureDirectories();
  
  // Install confidence validator hook
  await installConfidenceValidator(config);
  
  // Install confidence scorer hook
  await installConfidenceScorer();
  
  // Install confidence score display hook
  await installConfidenceScoreDisplay();
  
  // Install confidence notification hook
  await installConfidenceNotificationHook();
  
  // Install clauded command script
  await installClaudedCommand();
  
  // Update Claude settings to include all hooks
  await updateClaudeSettings();
  
  // Add clauded command to PATH
  await addToPath();
}

async function ensureDirectories() {
  await fs.mkdir(path.join(CLAUDED_DIR, 'hooks'), { recursive: true });
  await fs.mkdir(path.join(CLAUDED_DIR, 'scripts'), { recursive: true });
}

async function installConfidenceValidator(_config) {
  const validatorPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-validator.py');
  const validatorSource = `#!/usr/bin/env python3
"""
UserPromptSubmit hook for Claude Code - validates confidence requirements on solutions.
Based on the working examples from claude-code-hooks-mastery repository.
"""

import sys
import re
import os
import json
from datetime import datetime

# Debug logging
DEBUG_LOG = os.path.expanduser("~/.claude/clauded-debug.log")

def debug_log(message):
    try:
        timestamp = datetime.now().isoformat()
        with open(DEBUG_LOG, 'a') as f:
            f.write(f"[{timestamp}] {message}\\n")
    except Exception:
        pass  # Silently fail if we can't write to debug log

def get_last_assistant_response(transcript_path):
    debug_log(f"Reading transcript from: {transcript_path}")
    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()
        
        debug_log(f"Transcript has {len(lines)} lines")
        
        # Find the last assistant message
        for line in reversed(lines):
            try:
                entry = json.loads(line.strip())
                if (entry.get('type') == 'assistant' and 
                    entry.get('message', {}).get('role') == 'assistant'):
                    content = entry.get('message', {}).get('content', '')
                    if content:
                        debug_log("Found assistant response with content")
                        # Handle both string and list formats - always return string
                        if isinstance(content, list):
                            # Extract text from list of content blocks
                            text_parts = []
                            for block in content:
                                if isinstance(block, dict) and block.get('type') == 'text':
                                    text_parts.append(block.get('text', ''))
                                elif isinstance(block, str):
                                    text_parts.append(block)
                            result = '\\n'.join(text_parts)
                            debug_log(f"Extracted text from list content: {len(result)} chars")
                            return result if result else None
                        elif isinstance(content, str):
                            debug_log(f"Found string content: {len(content)} chars")
                            return content
                        else:
                            # Convert any other type to string
                            result = str(content)
                            debug_log(f"Converted content to string: {len(result)} chars")
                            return result
            except json.JSONDecodeError:
                continue
        
        debug_log("No valid assistant response found")
        return None
    except Exception as e:
        debug_log(f"Error reading transcript: {str(e)}")
        return None

def main():
    debug_log("=== Confidence validator started (UserPromptSubmit) ===")
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input data: {list(input_data.keys())}")
        
        # Extract user prompt from UserPromptSubmit input
        user_prompt = input_data.get('prompt', '')
        debug_log(f"User prompt: {user_prompt}")
        
        # Extract transcript path
        transcript_path = input_data.get('transcript_path')
        if not transcript_path:
            debug_log("No transcript path provided, allowing prompt")
            sys.exit(0)  # No transcript, allow prompt
        
        debug_log(f"Processing transcript: {transcript_path}")
        
        # Read the last assistant response from transcript
        response = get_last_assistant_response(transcript_path)
        if not response:
            debug_log("No response found in transcript, allowing prompt")
            sys.exit(0)  # No response found, allow prompt
        
        debug_log(f"Analyzing response of {len(response)} characters")
        
        # Keywords that indicate actual code implementation (not discussion)
        implementation_keywords = [
            'edit_file', 'search_replace', 'run_terminal_cmd', 'codebase_search',
            'read_file', 'grep_search', 'file_search', 'delete_file', 'mcp_'
        ]
        
        # Ensure response is a string
        if not isinstance(response, str):
            response = str(response)
        
        # If no response found, allow prompt (nothing to validate)
        if not response:
            debug_log("No response found in transcript, allowing prompt")
            sys.exit(0)
        
        # Check for confidence statement in the required format
        confidence_pattern = r'confidence:\\s*(\\d{1,3})%'
        confidence_match = re.search(confidence_pattern, response.lower())
        
        if not confidence_match:
            debug_log("No confidence statement found in previous response, allowing prompt to continue")
            sys.exit(0)  # Allow prompt if no confidence statement (PostToolUse hook will handle this)
        
        # Extract confidence percentage
        confidence_pct = int(confidence_match.group(1))
        debug_log(f"Found confidence statement: {confidence_pct}%")
        
        # Check minimum confidence threshold (from config)
        config_path = os.path.expanduser('~/.claude/clauded-config.json')
        min_confidence = 50  # Default fallback
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
                min_confidence = config.get('minConfidence', 50)
        except Exception as e:
            debug_log(f"Could not read config, using default: {str(e)}")
        
        debug_log(f"Minimum confidence threshold: {min_confidence}%")
        
        if confidence_pct < min_confidence:
            debug_log(f"Confidence {confidence_pct}% below threshold {min_confidence}%, blocking")
            
            # Use JSON output to block with reason
            block_output = {
                "decision": "block",
                "reason": f"🚫 Confidence level {confidence_pct}% is below minimum threshold of {min_confidence}%. Please provide a higher confidence assessment or revise your approach."
            }
            print(json.dumps(block_output))
            sys.exit(1)
        
        debug_log(f"Confidence {confidence_pct}% meets threshold, allowing prompt")
        
        # Use JSON output to allow with confirmation
        allow_output = {
            "decision": "allow",
            "reason": f"✅ Confidence level {confidence_pct}% meets minimum threshold of {min_confidence}%"
        }
        print(json.dumps(allow_output))
        sys.exit(0)

    except json.JSONDecodeError as e:
        debug_log(f"JSON decode error: {str(e)}")
        # Handle JSON decode errors gracefully
        sys.exit(0)
    except Exception as e:
        debug_log(f"Unexpected error: {str(e)}")
        # Handle any other errors gracefully
        sys.exit(0)

if __name__ == "__main__":
    main()
`;

  await fs.writeFile(validatorPath, validatorSource);
  await fs.chmod(validatorPath, 0o755);
  console.log(chalk.green('✓ Installed confidence validator hook'));
}

async function installConfidenceScorer() {
  const scorerPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-scorer.py');
  const scorerSource = `#!/usr/bin/env python3
"""
PostToolUse hook for Claude Code - detects suggestions and requests confidence evaluation.
"""

import sys
import re
import os
import json
from datetime import datetime

# Debug logging
DEBUG_LOG = os.path.expanduser("~/.claude/clauded-debug.log")

def debug_log(message):
    try:
        timestamp = datetime.now().isoformat()
        with open(DEBUG_LOG, 'a') as f:
            f.write(f"[SCORER {timestamp}] {message}\\n")
    except Exception:
        pass

def contains_suggestions(response_content, tool_calls):
    """Check if response contains suggestions, recommendations, or code changes"""
    debug_log(f"Analyzing response with {len(tool_calls)} tool calls")
    
    # Convert to string if needed
    if not isinstance(response_content, str):
        response_content = str(response_content)
    
    response_lower = response_content.lower()
    
    # Keywords that indicate suggestions or recommendations
    suggestion_keywords = [
        'suggest', 'recommend', 'should', 'could', 'would', 'consider',
        'improve', 'fix', 'change', 'update', 'modify', 'implement',
        'propose', 'add', 'remove', 'replace', 'refactor', 'optimize'
    ]
    
    # Tool call patterns that indicate code changes
    tool_call_patterns = [
        'edit', 'write', 'create', 'delete', 'move', 'copy',
        'function_calls', 'antml:invoke', 'tool_calls'
    ]
    
    # Check for suggestion keywords
    has_suggestions = any(keyword in response_lower for keyword in suggestion_keywords)
    
    # Check for tool calls (actual code changes)
    has_tool_calls = len(tool_calls) > 0
    
    # Check for tool call patterns in text
    has_tool_patterns = any(pattern in response_lower for pattern in tool_call_patterns)
    
    debug_log(f"Has suggestions: {has_suggestions}, Has tool calls: {has_tool_calls}, Has tool patterns: {has_tool_patterns}")
    
    return has_suggestions or has_tool_calls or has_tool_patterns

def main():
    debug_log("=== Confidence scorer started (PostToolUse) ===")
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input: {list(input_data.keys())}")
        
        # Extract response and tool calls
        response = input_data.get('response', {})
        tool_calls = input_data.get('tool_calls', [])
        
        # Get response content
        response_content = response.get('content', '')
        if isinstance(response_content, list):
            # Handle list format - extract text
            text_parts = []
            for block in response_content:
                if isinstance(block, dict) and block.get('type') == 'text':
                    text_parts.append(block.get('text', ''))
            response_content = '\\n'.join(text_parts)
        
        debug_log(f"Response content length: {len(response_content)}")
        debug_log(f"Tool calls count: {len(tool_calls)}")
        
        # Skip if no meaningful content
        if not response_content.strip():
            debug_log("No response content, skipping")
            sys.exit(0)
        
        # Check if confidence already exists
        if re.search(r'confidence:\\s*\\d+%', response_content.lower()):
            debug_log("Confidence already present, skipping")
            sys.exit(0)
        
        # Check if response contains suggestions or changes
        if not contains_suggestions(response_content, tool_calls):
            debug_log("No suggestions or changes detected, skipping confidence request")
            sys.exit(0)
        
        debug_log("Suggestions/changes detected, requesting confidence evaluation")
        
        # Request confidence evaluation
        confidence_request = "\\n\\n🤔 **Please evaluate your confidence in these suggestions using the format:**\\n**Confidence: X% - [your reasoning]**"
        
        # Output JSON to request confidence evaluation
        output = {
            "decision": "approve"
        }
        
        print(json.dumps(output))
        sys.exit(0)
        
    except Exception as e:
        debug_log(f"Error in confidence scorer: {str(e)}")
        # Fail gracefully - don't block the response
        sys.exit(0)

if __name__ == "__main__":
    main()
`;

  await fs.writeFile(scorerPath, scorerSource);
  await fs.chmod(scorerPath, 0o755);
  console.log(chalk.green('✓ Installed confidence scorer hook'));
}

async function installConfidenceScoreDisplay() {
  const displayPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-score-display.py');
  const displaySource = `#!/usr/bin/env python3
"""
UserPromptSubmit hook for Claude Code - displays confidence scores from previous responses.
This hook analyzes the previous assistant response and adds confidence score info to the next prompt.
"""

import sys
import re
import os
import json
from datetime import datetime

# Debug logging
DEBUG_LOG = os.path.expanduser("~/.claude/clauded-debug.log")

def debug_log(message):
    try:
        timestamp = datetime.now().isoformat()
        with open(DEBUG_LOG, 'a') as f:
            f.write(f"[DISPLAY {timestamp}] {message}\\n")
    except Exception:
        pass  # Silently fail if we can't write to debug log

def get_last_assistant_response(transcript_path):
    debug_log(f"Reading transcript from: {transcript_path}")
    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()
        
        debug_log(f"Transcript has {len(lines)} lines")
        
        # Find the last assistant message
        for line in reversed(lines):
            try:
                entry = json.loads(line.strip())
                if (entry.get('type') == 'assistant' and 
                    entry.get('message', {}).get('role') == 'assistant'):
                    content = entry.get('message', {}).get('content', '')
                    if content:
                        debug_log("Found assistant response with content")
                        # Handle both string and list formats - always return string
                        if isinstance(content, list):
                            # Extract text from list of content blocks
                            text_parts = []
                            for block in content:
                                if isinstance(block, dict) and block.get('type') == 'text':
                                    text_parts.append(block.get('text', ''))
                                elif isinstance(block, str):
                                    text_parts.append(block)
                            result = '\\n'.join(text_parts)
                            debug_log(f"Extracted text from list content: {len(result)} chars")
                            return result if result else None
                        elif isinstance(content, str):
                            debug_log(f"Found string content: {len(content)} chars")
                            return content
                        else:
                            # Convert any other type to string
                            result = str(content)
                            debug_log(f"Converted content to string: {len(result)} chars")
                            return result
            except json.JSONDecodeError:
                continue
        
        debug_log("No valid assistant response found")
        return None
    except Exception as e:
        debug_log(f"Error reading transcript: {str(e)}")
        return None

def calculate_confidence_score(response):
    """Calculate confidence score based on response characteristics"""
    debug_log("Calculating confidence score")
    
    if not response:
        return 50  # Default neutral confidence
    
    score = 50  # Base score
    
    # Check for explicit confidence statements
    confidence_pattern = r'confidence:\\s*(\\d{1,3})%'
    confidence_match = re.search(confidence_pattern, response.lower())
    if confidence_match:
        explicit_confidence = int(confidence_match.group(1))
        debug_log(f"Found explicit confidence: {explicit_confidence}%")
        return explicit_confidence
    
    # Analyze response characteristics
    response_lower = response.lower()
    
    # Positive indicators
    if any(word in response_lower for word in ['successfully', 'completed', 'fixed', 'working']):
        score += 15
        debug_log("Added 15 points for success indicators")
    
    if any(word in response_lower for word in ['error', 'failed', 'issue', 'problem']):
        score += 10  # Finding/handling errors shows competence
        debug_log("Added 10 points for error handling")
    
    # Tool usage indicates concrete action
    tool_patterns = ['<function_calls>', '<invoke>', 'Read', 'Write', 'Edit', 'Bash']
    if any(pattern in response for pattern in tool_patterns):
        score += 20
        debug_log("Added 20 points for tool usage")
    
    # Code examples or specific solutions
    if '\`\`\`' in response or 'function' in response_lower or 'class' in response_lower:
        score += 15
        debug_log("Added 15 points for code examples")
    
    # Uncertainty indicators
    uncertainty_words = ['might', 'maybe', 'possibly', 'unclear', 'not sure', 'uncertain']
    if any(word in response_lower for word in uncertainty_words):
        score -= 20
        debug_log("Reduced 20 points for uncertainty indicators")
    
    # Very short responses might be less confident
    if len(response) < 100:
        score -= 10
        debug_log("Reduced 10 points for short response")
    
    # Very detailed responses show confidence
    if len(response) > 1000:
        score += 10
        debug_log("Added 10 points for detailed response")
    
    # Clamp to valid range
    score = max(10, min(95, score))
    debug_log(f"Final calculated confidence score: {score}%")
    
    return score

def main():
    debug_log("=== Confidence score display started (UserPromptSubmit) ===")
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input data: {list(input_data.keys())}")
        
        # Extract transcript path
        transcript_path = input_data.get('transcript_path')
        if not transcript_path:
            debug_log("No transcript path provided, exiting")
            sys.exit(0)  # No transcript, nothing to analyze
        
        debug_log(f"Processing transcript: {transcript_path}")
        
        # Read the last assistant response from transcript
        response = get_last_assistant_response(transcript_path)
        if not response:
            debug_log("No response found in transcript, exiting")
            sys.exit(0)  # No response found, nothing to analyze
        
        debug_log(f"Analyzing response of {len(response)} characters")
        
        # Check if this response already has a confidence score displayed
        if 'confidence:' in response.lower() and '%' in response:
            debug_log("Response already contains confidence score, skipping")
            sys.exit(0)
        
        # Check if this is a meaningful response that warrants a confidence score
        response_lower = response.lower()
        
        # Skip trivial responses
        trivial_patterns = [
            r'^(yes|no)\\.?$',
            r'^(ok|okay)\\.?$',
            r'^(thanks?|thank you)\\.?$',
            r'^[^a-zA-Z]*$'  # Only punctuation/numbers
        ]
        
        for pattern in trivial_patterns:
            if re.match(pattern, response_lower.strip()):
                debug_log("Detected trivial response, skipping confidence score")
                sys.exit(0)
        
        # Skip if response is too short to be meaningful
        if len(response.strip()) < 20:
            debug_log("Response too short for confidence scoring")
            sys.exit(0)
        
        # Calculate confidence score
        confidence_score = calculate_confidence_score(response)
        
        # Create confidence display as additional context for the next prompt
        confidence_display = f"\\n\\n🎯 **Previous Response Confidence: {confidence_score}%** - Assessment based on response completeness, tool usage, and specificity."
        
        # Output JSON with additional context to display confidence score
        output = {
            "decision": "allow",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": confidence_display
            }
        }
        
        debug_log(f"Adding confidence score display: {confidence_score}%")
        print(json.dumps(output))
        sys.exit(0)

    except json.JSONDecodeError as e:
        debug_log(f"JSON decode error: {str(e)}")
        sys.exit(0)
    except Exception as e:
        debug_log(f"Unexpected error: {str(e)}")
        sys.exit(0)

if __name__ == "__main__":
    main()
`;

  await fs.writeFile(displayPath, displaySource);
  await fs.chmod(displayPath, 0o755);
  console.log(chalk.green('✓ Installed confidence score display hook'));
}

async function installConfidenceNotificationHook() {
  const hookPath = path.join(CLAUDED_DIR, 'hooks', 'confidence-notification-hook.py');
  const sourcePath = path.join(process.cwd(), 'src', 'setup', 'confidence-notification-hook.py');
  
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