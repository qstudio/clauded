#!/usr/bin/env python3
"""
Notification hook for Claude Code - intercepts responses and validates confidence levels.
Shows warning notification if Claude's confidence is below user threshold.
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
            f.write(f"[NOTIFICATION {timestamp}] {message}\n")
    except Exception:
        pass  # Silently fail if we can't write to debug log

def get_config():
    """Load clauded configuration for minimum confidence threshold"""
    config_path = os.path.expanduser('~/.claude/clauded-config.json')
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            min_confidence = config.get('minConfidence', 50)
            debug_log(f"Loaded config: min confidence = {min_confidence}%")
            return min_confidence
    except Exception as e:
        debug_log(f"Could not read config, using default: {str(e)}")
        return 50  # Default fallback

def extract_confidence_from_response(content):
    """Extract confidence level from Claude's response"""
    if not content:
        return None
    
    # Convert to string if needed
    if isinstance(content, list):
        # Handle list format - extract text
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get('type') == 'text':
                text_parts.append(block.get('text', ''))
            elif isinstance(block, str):
                text_parts.append(block)
        content = '\n'.join(text_parts)
    elif not isinstance(content, str):
        content = str(content)
    
    # Look for confidence patterns
    confidence_patterns = [
        r'confidence:\s*(\d{1,3})%',  # "Confidence: 75%"
        r'confidence\s*[:\-]\s*(\d{1,3})%',  # "Confidence - 75%"
        r'(\d{1,3})%\s*confident',  # "75% confident"
    ]
    
    content_lower = content.lower()
    for pattern in confidence_patterns:
        match = re.search(pattern, content_lower)
        if match:
            confidence = int(match.group(1))
            debug_log(f"Found confidence level: {confidence}%")
            return confidence
    
    debug_log("No explicit confidence found in response")
    return None

def estimate_confidence(content, tool_calls):
    """Estimate confidence based on response characteristics if not explicitly stated"""
    if not content:
        return 50  # Default neutral
    
    # Convert to string if needed
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get('type') == 'text':
                text_parts.append(block.get('text', ''))
            elif isinstance(block, str):
                text_parts.append(block)
        content = '\n'.join(text_parts)
    elif not isinstance(content, str):
        content = str(content)
    
    score = 50  # Base score
    content_lower = content.lower()
    
    # Positive indicators
    if any(word in content_lower for word in ['successfully', 'completed', 'fixed', 'working', 'done']):
        score += 15
    
    if any(word in content_lower for word in ['correct', 'accurate', 'precise', 'exactly']):
        score += 10
    
    # Tool usage indicates concrete action
    if len(tool_calls) > 0:
        score += 20
        debug_log(f"Added 20 points for {len(tool_calls)} tool calls")
    
    # Code examples or specific solutions
    if '```' in content or 'function' in content_lower or 'class' in content_lower:
        score += 10
    
    # Uncertainty indicators
    uncertainty_words = ['might', 'maybe', 'possibly', 'unclear', 'not sure', 'uncertain', 'probably', 'likely']
    uncertainty_count = sum(1 for word in uncertainty_words if word in content_lower)
    score -= uncertainty_count * 5
    
    # Hedging language
    hedging_words = ['seems', 'appears', 'could be', 'might be', 'should work', 'try']
    hedging_count = sum(1 for word in hedging_words if word in content_lower)
    score -= hedging_count * 3
    
    # Very short responses might be less confident
    if len(content) < 50:
        score -= 15
    
    # Very detailed responses show confidence
    if len(content) > 500:
        score += 10
    
    # Clamp to valid range
    score = max(10, min(95, score))
    debug_log(f"Estimated confidence score: {score}%")
    
    return score

def should_show_warning(content, tool_calls, min_confidence):
    """Determine if we should show a confidence warning"""
    
    # First check for explicit confidence
    explicit_confidence = extract_confidence_from_response(content)
    if explicit_confidence is not None:
        debug_log(f"Using explicit confidence: {explicit_confidence}%")
        return explicit_confidence < min_confidence, explicit_confidence
    
    # Estimate confidence if not explicit
    estimated_confidence = estimate_confidence(content, tool_calls)
    debug_log(f"Using estimated confidence: {estimated_confidence}%")
    
    # Only show warning for significantly low confidence estimates
    # Add a buffer since estimated confidence is less reliable
    warning_threshold = min_confidence - 10
    return estimated_confidence < warning_threshold, estimated_confidence

def main():
    debug_log("=== Confidence notification hook started ===")
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received notification data: {list(input_data.keys())}")
        
        # Extract notification content
        notification = input_data.get('notification', {})
        content = notification.get('content', '')
        
        # Extract tool calls if available
        tool_calls = input_data.get('tool_calls', [])
        
        debug_log(f"Content length: {len(content) if content else 0}")
        debug_log(f"Tool calls: {len(tool_calls)}")
        
        # Skip if no meaningful content
        if not content or (isinstance(content, str) and len(content.strip()) < 10):
            debug_log("No meaningful content, skipping")
            sys.exit(0)
        
        # Get minimum confidence threshold
        min_confidence = get_config()
        
        # Check if we should show warning
        should_warn, confidence_level = should_show_warning(content, tool_calls, min_confidence)
        
        if should_warn:
            debug_log(f"Showing confidence warning: {confidence_level}% < {min_confidence}%")
            
            # Create warning notification
            warning_msg = f"⚠️  Claude's confidence is {confidence_level}% (below your {min_confidence}% threshold). Continue anyway?"
            
            # Output JSON to show warning
            output = {
                "decision": "prompt_user",
                "message": warning_msg,
                "allow_continue": True,
                "default_action": "continue"
            }
            
            print(json.dumps(output))
            sys.exit(0)
        else:
            debug_log(f"Confidence {confidence_level}% meets threshold {min_confidence}%, allowing")
            # Allow notification to proceed normally
            sys.exit(0)
        
    except json.JSONDecodeError as e:
        debug_log(f"JSON decode error: {str(e)}")
        sys.exit(0)
    except Exception as e:
        debug_log(f"Unexpected error: {str(e)}")
        sys.exit(0)

if __name__ == "__main__":
    main()