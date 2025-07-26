#!/usr/bin/env python3
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
            f.write(f"[SCORER {timestamp}] {message}\n")
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
            response_content = '\n'.join(text_parts)
        
        debug_log(f"Response content length: {len(response_content)}")
        debug_log(f"Tool calls count: {len(tool_calls)}")
        
        # Skip if no meaningful content
        if not response_content.strip():
            debug_log("No response content, skipping")
            sys.exit(0)
        
        # Check if confidence already exists
        if re.search(r'confidence:\s*\d+%', response_content.lower()):
            debug_log("Confidence already present, skipping")
            sys.exit(0)
        
        # Check if response contains suggestions or changes
        if not contains_suggestions(response_content, tool_calls):
            debug_log("No suggestions or changes detected, skipping confidence request")
            sys.exit(0)
        
        debug_log("Suggestions/changes detected, requesting confidence evaluation")
        
        # Request confidence evaluation
        confidence_request = "\n\n🤔 **Please evaluate your confidence in these suggestions using the format:**\n**Confidence: X% - [your reasoning]**"
        
        # Output JSON to request confidence evaluation
        output = {
            "decision": "allow",
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": confidence_request
            }
        }
        
        print(json.dumps(output))
        sys.exit(0)
        
    except Exception as e:
        debug_log(f"Error in confidence scorer: {str(e)}")
        # Fail gracefully - don't block the response
        sys.exit(0)

if __name__ == "__main__":
    main()
