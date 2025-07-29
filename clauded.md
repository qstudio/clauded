# Clauded - Claude Code Confidence System

## Overview
Clauded is a "Claude Taming System" that enhances Claude Code responses with self-evaluation, confidence scoring, and session management. It integrates with Claude Code through hooks to provide confidence analysis for AI responses.

## How It Actually Works (Based on Real Testing)

### Hook Behavior Patterns

**1. Chat Responses (Confidence Display)**
- **Trigger**: Simple conversational responses like "how are you?"
- **Hook**: `UserPromptSubmit` hook fires
- **Behavior**: Hook processes and **displays confidence** for all chat responses
- **Output Format**: JSON with `append_message` containing confidence analysis
- **Result**: Confidence score shown for all responses, including chat

**2. Tool Usage Responses (Confidence Display)**
- **Trigger**: Commands that use tools (delete, create, edit files, etc.)
- **Hook**: `PostToolUse` hook fires after tool execution
- **Behavior**: Hook analyzes response and **displays confidence score**
- **Special Handling**: Shows confidence even for empty tool responses
- **Result**: Confidence score displayed with detailed analysis

**3. High-Risk Operations (Mandatory Confidence)**
- **Trigger**: File deletions, system commands, high-risk changes
- **Hook**: `PostToolUse` hook with risk assessment
- **Behavior**: **Blocks response** and requires explicit confidence statement
- **Loop Prevention**: Checks for existing confidence before blocking
- **User Experience**: 
  ```
  **MANDATORY CONFIDENCE REQUIRED**
  This operation involves high-risk changes (file edits, system commands, deletions).
  **Please add explicit confidence to your response:**
  `Confidence: X% - [your reasoning]`
  **Then submit your response again.**
  ```

### Hook Execution Flow

**UserPromptSubmit Hook (Chat Responses)**
1. User types conversational message
2. Hook reads transcript to find last assistant response
3. Calculates confidence score based on response analysis
4. **Outputs JSON format** with confidence message
5. Claude Code displays response with appended confidence

**PostToolUse Hook (Tool Responses)**
1. User executes command with tool usage
2. Claude processes command and uses tools
3. Hook receives tool information and transcript path
4. Extracts response content from transcript
5. Analyzes response for risk level and confidence indicators
6. **Handles empty responses**: Shows confidence even with no text content
7. **Displays confidence score** with detailed reasoning
8. For high-risk operations: blocks and requires explicit confidence

**Stop Hook (Session End)**
1. Triggered when Claude finishes response
2. **Loop Prevention**: Checks if confidence already present in response
3. If confidence missing: adds minimal confidence display
4. If confidence already present: skips (prevents duplication)
5. **Critical Fix**: Prevents infinite loops by detecting existing confidence

### Confidence Calculation Factors

**Base Score**: 50%
**Tool Usage**: +20 points (indicates concrete action)
**Language Analysis**: 
- Uncertainty words (-15%): "might", "maybe", "possibly"
- Success words (+10%): "successfully", "completed", "working"
**Response Length**: 
- Long responses (+5%): >500 chars
- Short responses (-10%): <50 chars
**Risk Level Assessment**:
- High-risk operations: file edits, deletions, system commands
- Medium-risk: data analysis, code review
- Low-risk: explanations, documentation

### Configuration System

**Local vs Global Configuration**
- **Local Config**: `./claude/clauded-config.json` (project-specific)
- **Global Config**: `~/.claude/clauded-config.json` (system-wide)
- **Precedence**: Local config takes priority if exists
- **Required Fields**: `minConfidence`, `verbose`, `lastUpdated`

**Configuration Example**:
```json
{
  "minConfidence": 75,
  "verbose": true,
  "lastUpdated": "2025-07-29T06:55:55Z"
}
```

### Debug Logging System

**Log Locations**:
- **Local Logs**: `./claude/clauded-debug.log` (project directory)
- **Global Logs**: `~/.claude/clauded-debug.log` (system-wide)
- **Raw Input Logs**: `/tmp/clauded-raw-input.log` (temporary debugging)

**Log Content**:
- Hook execution timestamps
- Input data received from Claude Code
- Confidence calculation details
- Risk assessment results
- Configuration loading events

### Key Findings from Testing

**1. Universal Confidence Display**
- **Chat responses**: Confidence shown for all responses
- **Tool responses**: Confidence displayed with detailed analysis
- **High-risk operations**: Mandatory confidence requirement with loop prevention

**2. Hook Triggering Patterns**
- `UserPromptSubmit`: Fires for all user inputs, shows confidence
- `PostToolUse`: Fires only when tools are used, shows confidence
- `Stop`: Fires at end of responses, prevents loops

**3. Risk-Based Blocking with Loop Prevention**
- File deletions trigger mandatory confidence requirement
- System commands require explicit confidence statements
- **Loop Prevention**: Checks for existing confidence before blocking
- Once confidence provided, operation proceeds without loops

**4. Empty Response Handling**
- Tool operations show confidence even with no text content
- Higher confidence (75%) for tool usage vs chat (50%)
- Prevents "no confidence" issues on tool operations

**5. Configuration Precedence**
- Local project config overrides global config
- System health check uses global config path
- Python hooks use local config when available

### Critical Fixes Implemented

**1. JSON Output Format**
- **Problem**: Hooks were using `print()` instead of JSON format
- **Solution**: Changed to JSON output with `append_message` field
- **Result**: Claude Code properly captures and displays confidence

**2. Stop Hook Loop Prevention**
- **Problem**: Stop hook caused infinite loops by repeatedly adding confidence
- **Solution**: Added detection for existing confidence in response
- **Result**: No more infinite loops on tool operations

**3. Empty Response Confidence**
- **Problem**: Tool operations with no text content showed no confidence
- **Solution**: Added logic to show confidence even for empty responses
- **Result**: All tool operations now show confidence

**4. High-Risk Operation Handling**
- **Problem**: System blocked operations even when confidence was provided
- **Solution**: Check for explicit confidence statements before blocking
- **Result**: Operations proceed once confidence is provided

### Installation and Setup

**Local Development Setup**:
```bash
# Create test directory
mkdir test-install && cd test-install
npm init -y
npm install ../  # Install local package

# Setup Claude Code configuration
mkdir -p .claude
# Copy settings.json and clauded-config.json
```

**Global Installation**:
```bash
npm install -g clauded
clauded setup  # Interactive setup wizard
```

**Required Files**:
```
.claude/
├── settings.json          # Hook configuration
└── clauded-config.json    # Clauded settings
```

### Hook Scripts

**confidence-unified-posttool.py**
- Handles PostToolUse and Stop hooks
- Analyzes tool usage and response content
- Calculates confidence scores
- Prevents infinite loops
- Shows confidence for empty responses

**confidence-unified-prompt.py**
- Handles UserPromptSubmit hook
- Processes user prompts for context
- Shows confidence for all chat responses
- Outputs JSON format for Claude Code

**config-cache.py**
- Shared configuration management
- Handles local vs global config precedence
- Caches settings to avoid repeated file reads

### Environment Variables
- `CLAUDE_PROJECT_DIR`: Available in hook environment
- `CLAUDE_SESSION_ID`: Current session identifier
- `CLAUDE_CWD`: Current working directory

### Troubleshooting

**System Status Warnings**:
- **"Configuration missing some defaults"**: Add `verbose` field to global config
- **"No hooks found"**: Run `clauded setup` to reinstall hooks
- **"Directories missing"**: Ensure `.claude` directory exists

**Hook Not Triggering**:
- Check settings.json hook paths are correct
- Verify Python scripts are executable
- Clear Python cache files (`.pyc`, `__pycache__`)

**Confidence Not Displaying**:
- Check if response uses tools (PostToolUse hook)
- Verify configuration has required fields
- Check debug logs for hook execution
- Ensure JSON output format is used

**Infinite Loops**:
- Clear Python cache files
- Check Stop hook logic for existing confidence
- Verify hook event detection is working

### Performance Considerations

**Caching**:
- Configuration cached for 30 seconds
- Transcript reading optimized for recent responses
- Hook execution typically <100ms

**Logging Impact**:
- Debug logging adds minimal overhead
- Verbose mode increases log detail
- Log rotation prevents disk space issues

### Hook Output Format

**Required JSON Structure**:
```json
{
  "decision": "approve|block",
  "append_message": "text to append to response",
  "reason": "explanation for decision (optional)"
}
```

**Hook Input Format**:
```json
{
  "session_id": "string",
  "transcript_path": "path/to/transcript.jsonl",
  "cwd": "current/working/directory",
  "hook_event_name": "PostToolUse|UserPromptSubmit|Stop",
  "tool_name": "Write|Edit|Bash|etc",
  "tool_input": {...},
  "tool_response": {...},
  "prompt": "user prompt"
}
```

## Summary

Clauded now works correctly with **universal confidence display** for all responses (chat and tool usage), **loop prevention** for high-risk operations, and **proper JSON output format** that Claude Code can process. The system provides detailed confidence analysis with risk assessment and can intelligently block dangerous operations until explicit confidence is provided, without causing infinite loops. 