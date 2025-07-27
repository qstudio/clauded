#!/usr/bin/env python3
"""
Unified PostToolUse hook for Claude Code - combines scoring and notification.
This consolidates confidence-scorer.py and confidence-notification-hook.py for better performance.
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
            f.write(f"[UNIFIED-POSTTOOL {timestamp}] {message}\n")
    except Exception:
        pass

# Import shared config cache
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("config_cache", os.path.join(os.path.dirname(os.path.abspath(__file__)), "config-cache.py"))
config_cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config_cache)
get_cached_config = config_cache.get_cached_config
get_min_confidence = config_cache.get_min_confidence
get_verbose_mode = config_cache.get_verbose_mode

def get_config():
    """Load configuration settings with caching"""
    return get_cached_config()

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

def assess_risk_level(response_content, tool_calls):
    """Assess the risk level of the operations being performed"""
    high_risk_keywords = [
        'delete', 'remove', 'rm ', 'unlink', 'drop', 'truncate',
        'format', 'wipe', 'destroy', 'kill', 'terminate',
        'sudo', 'chmod', 'chown', 'mv ', 'move'
    ]
    
    medium_risk_keywords = [
        'edit', 'modify', 'change', 'update', 'replace',
        'install', 'config', 'settings', 'deploy'
    ]
    
    response_lower = response_content.lower() if response_content else ""
    
    # Check for high-risk operations
    if any(keyword in response_lower for keyword in high_risk_keywords):
        return 'high'
    
    # Check for medium-risk operations
    if any(keyword in response_lower for keyword in medium_risk_keywords):
        return 'medium'
    
    # Check tool calls for risk
    if len(tool_calls) > 3:  # Many tool calls = higher risk
        return 'medium'
    
    return 'low'

def estimate_confidence(response_content, tool_calls, config):
    """Estimate confidence when explicit confidence is missing"""
    debug_log("Estimating confidence based on response analysis")
    
    if not response_content:
        return 50  # Neutral default
    
    score = 60  # Base score for responses with content
    
    # Tool usage indicates concrete action
    if len(tool_calls) > 0:
        score += 15
        debug_log(f"Added 15 points for {len(tool_calls)} tool calls")
    
    # Response characteristics
    response_lower = response_content.lower()
    
    # Positive indicators
    if any(word in response_lower for word in ['successfully', 'completed', 'working', 'fixed']):
        score += 10
    
    # Uncertainty indicators
    if any(word in response_lower for word in ['might', 'maybe', 'possibly', 'not sure']):
        score -= 15
    
    # Length consideration
    if len(response_content) > 500:
        score += 5  # Detailed responses
    elif len(response_content) < 50:
        score -= 10  # Very short responses
    
    # Clamp to reasonable range
    score = max(30, min(85, score))
    debug_log(f"Estimated confidence: {score}%")
    
    return score

def main():
    debug_log("=== Unified PostToolUse hook started ===")
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input: {list(input_data.keys())}")
        
        # Get configuration
        config = get_config()
        min_confidence = config.get('minConfidence', 50)
        
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
        
        # Always show confidence for all responses
        debug_log("Processing response for confidence display")
        
        debug_log("Suggestions/changes detected, proceeding with analysis")
        
        # Assess risk level
        risk_level = assess_risk_level(response_content, tool_calls)
        debug_log(f"Assessed risk level: {risk_level}")
        
        # Estimate confidence for all responses
        estimated_confidence = estimate_confidence(response_content, tool_calls, config)
        debug_log(f"Estimated confidence: {estimated_confidence}%")
        
        # Create confidence display message with verbose details
        confidence_msg = f"🎯 Confidence: {estimated_confidence}% 🎯"
        
        # Add verbose reasoning if enabled
        verbose = get_verbose_mode()
        if verbose:
            reasons = []
            
            # Analyze factors that influenced confidence with meaningful context
            if len(tool_calls) > 0:
                if len(tool_calls) == 1:
                    reasons.append("• Taking concrete action with tool usage")
                else:
                    reasons.append(f"• Performing {len(tool_calls)} operations systematically")
            
            response_lower = response_content.lower()
            if any(word in response_lower for word in ['successfully', 'completed', 'working', 'fixed']):
                reasons.append("• Expressing completion or success")
            
            if any(word in response_lower for word in ['might', 'maybe', 'possibly', 'not sure']):
                reasons.append("• Contains uncertainty language")
            
            if any(word in response_lower for word in ['error', 'failed', 'problem', 'issue']):
                reasons.append("• Discussing problems or failures")
            
            if len(response_content) > 500:
                reasons.append("• Providing comprehensive explanation")
            elif len(response_content) < 50:
                reasons.append("• Very brief response may lack detail")
            
            if re.search(r'confidence:\s*\d+%', response_content.lower()):
                reasons.append("• Includes explicit confidence assessment")
            
            if reasons:
                confidence_msg += f"\nBased on:  {' '.join(reasons)}"
        
        # Add risk level if medium/high
        if risk_level in ['medium', 'high']:
            confidence_msg += f" (Risk: {risk_level})"
        
        # For high-risk operations with low confidence, still block
        if risk_level == 'high' and estimated_confidence < min_confidence:
            output = {
                "decision": "block",
                "reason": f"🎯 **MANDATORY CONFIDENCE REQUIRED**\n\nThis operation involves high-risk changes (file edits, system commands, deletions).\n\n**Please add explicit confidence to your response:**\n`Confidence: X% - [your reasoning]`\n\n**Then submit your response again.**"
            }
            print(json.dumps(output))
            sys.exit(1)
        
        # Standard approval with confidence display
        output = {
            "decision": "approve",
            "append_message": confidence_msg
        }
        
        print(json.dumps(output))
        sys.exit(0)
        
    except Exception as e:
        debug_log(f"Error in unified PostToolUse hook: {str(e)}")
        # Fail gracefully - don't block the response
        sys.exit(0)

if __name__ == "__main__":
    main()