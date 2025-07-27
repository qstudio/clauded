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

def analyze_operation_risk(response_content, tool_calls):
    """Analyze the risk level of operations in the response"""
    debug_log(f"Analyzing operation risk with {len(tool_calls)} tool calls")
    
    # Convert to string if needed
    if not isinstance(response_content, str):
        response_content = str(response_content)
    
    response_lower = response_content.lower()
    
    # HIGH RISK: Operations that can cause data loss or system changes
    high_risk_tools = [
        'edit', 'write', 'multiedit', 'delete', 'bash', 'remove', 'move',
        'notebookedit', 'rm ', 'mv ', 'cp -f'
    ]
    
    # MEDIUM RISK: Operations that change state but are recoverable
    medium_risk_tools = [
        'webfetch', 'task', 'commit', 'push', 'git '
    ]
    
    # LOW RISK: Read-only operations
    low_risk_tools = [
        'read', 'grep', 'glob', 'ls', 'notebookread'
    ]
    
    # Check for high-risk operations
    high_risk_count = sum(1 for tool in high_risk_tools if tool in response_lower)
    medium_risk_count = sum(1 for tool in medium_risk_tools if tool in response_lower)
    low_risk_count = sum(1 for tool in low_risk_tools if tool in response_lower)
    
    # Also check actual tool calls for risk assessment
    tool_call_risk = 'none'
    for tool_call in tool_calls:
        tool_name = tool_call.get('function', {}).get('name', '').lower()
        if any(risky in tool_name for risky in high_risk_tools):
            tool_call_risk = 'high'
            break
        elif any(medium in tool_name for medium in medium_risk_tools):
            tool_call_risk = 'medium'
        elif tool_call_risk == 'none' and any(low in tool_name for low in low_risk_tools):
            tool_call_risk = 'low'
    
    # Determine overall risk level
    if high_risk_count > 0 or tool_call_risk == 'high':
        risk_level = 'high'
    elif medium_risk_count > 0 or tool_call_risk == 'medium':
        risk_level = 'medium'
    elif low_risk_count > 0 or tool_call_risk == 'low' or len(tool_calls) > 0:
        risk_level = 'low'
    else:
        # Check for suggestion keywords for non-tool responses
        suggestion_keywords = [
            'suggest', 'recommend', 'should', 'could', 'would', 'consider',
            'improve', 'fix', 'change', 'update', 'modify', 'implement',
            'propose', 'add', 'remove', 'replace', 'refactor', 'optimize'
        ]
        has_suggestions = any(keyword in response_lower for keyword in suggestion_keywords)
        risk_level = 'low' if has_suggestions else 'none'
    
    debug_log(f"Risk assessment: {risk_level} (high:{high_risk_count}, medium:{medium_risk_count}, low:{low_risk_count}, tool_risk:{tool_call_risk})")
    
    return risk_level, {
        'high_risk_count': high_risk_count,
        'medium_risk_count': medium_risk_count,
        'low_risk_count': low_risk_count,
        'tool_call_risk': tool_call_risk
    }

def main():
    debug_log("=== Confidence scorer started (PostToolUse) ===")
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input: {list(input_data.keys())}")
        debug_log(f"Full input data structure: {json.dumps(input_data, indent=2)}")
        
        # Extract response and tool calls - try multiple possible locations
        response = input_data.get('response', {})
        tool_calls = input_data.get('tool_calls', [])
        
        # Also check for tool information in other locations
        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})
        tool_response = input_data.get('tool_response', '')
        
        debug_log(f"Direct tool info: name='{tool_name}', input_keys={list(tool_input.keys()) if isinstance(tool_input, dict) else 'not_dict'}")
        
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
        debug_log(f"Tool name from input: '{tool_name}'")
        
        # Check if we have any tool usage to analyze
        has_response_content = bool(response_content.strip())
        has_direct_tool = bool(tool_name.strip())
        
        if not has_response_content and not has_direct_tool:
            debug_log("No response content or tool usage detected, skipping")
            sys.exit(0)
        
        # Check if confidence already exists in response
        has_confidence = False
        if has_response_content:
            has_confidence = re.search(r'confidence:\s*\d+%', response_content.lower())
            if has_confidence:
                debug_log("Confidence already present in response, skipping")
                sys.exit(0)
        
        # Analyze operation risk level using both response content and direct tool info
        if has_direct_tool:
            # Create a synthetic tool_calls structure for the risk analyzer
            synthetic_tool_calls = [{'function': {'name': tool_name}}]
            risk_level, risk_details = analyze_operation_risk(f"Used tool: {tool_name}", synthetic_tool_calls)
            debug_log(f"Risk level based on direct tool '{tool_name}': {risk_level}")
        else:
            # Fall back to analyzing response content
            risk_level, risk_details = analyze_operation_risk(response_content, tool_calls)
            debug_log(f"Risk level based on response content: {risk_level}")
        
        # Skip if no risky operations detected
        if risk_level == 'none':
            debug_log("No risky operations detected, skipping confidence request")
            sys.exit(0)
        
        # Determine confidence requirement based on risk level
        if risk_level == 'high':
            # HIGH RISK: Mandatory confidence - block until provided
            debug_log("High-risk operation detected, requiring mandatory confidence")
            output = {
                "decision": "block", 
                "reason": f"🎯 **MANDATORY CONFIDENCE REQUIRED**\n\nThis operation involves high-risk changes (file edits, system commands, deletions).\n\n**Please add explicit confidence to your response:**\n`Confidence: X% - [your reasoning]`\n\n**Then submit your response again.**"
            }
            print(json.dumps(output))
            sys.exit(1)
            
        elif risk_level == 'medium':
            # MEDIUM RISK: Strong request for confidence
            debug_log("Medium-risk operation detected, strongly requesting confidence")
            confidence_request = f"\n\n⚠️ 🎯 **CONFIDENCE ASSESSMENT REQUESTED**\n\nThis operation has medium risk. Please evaluate your confidence:\n**Confidence: X% - [your reasoning]**"
            
            output = {
                "decision": "allow",
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse", 
                    "additionalContext": confidence_request
                }
            }
            print(json.dumps(output))
            sys.exit(0)
            
        else:  # risk_level == 'low'
            # LOW RISK: Optional confidence request
            debug_log("Low-risk operation detected, optional confidence request")
            confidence_request = f"\n\n💭 **Optional:** Consider adding confidence assessment:\n**Confidence: X% - [your reasoning]**"
            
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
