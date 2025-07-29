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

def get_last_assistant_response(transcript_path):
    """Extract the last assistant response from transcript"""
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
                            result = '\n'.join(text_parts)
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
        debug_log(f"Full input data: {input_data}")
        
        # Get configuration
        config = get_config()
        min_confidence = config.get('minConfidence', 50)
        
        # PostToolUse hook gets individual tool info, not full tool_calls array
        tool_name = input_data.get('tool_name', '')
        tool_calls = [{'name': tool_name}] if tool_name else []
        debug_log(f"Single tool call detected: {tool_name}")
        
        # PostToolUse hook doesn't get response content directly
        # Need to read it from the transcript
        transcript_path = input_data.get('transcript_path')
        response_content = ""
        
        if transcript_path:
            response_content = get_last_assistant_response(transcript_path)
            debug_log(f"Extracted response from transcript: {len(response_content) if response_content else 0} chars")
        
        if not response_content:
            response_content = ""
        
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
        
        # Add verbose reasoning - always enabled by default
        verbose = get_verbose_mode()
        if True:  # Force verbose mode to always be on
            # Detailed analysis of why this confidence score
            analysis = []
            
            # What did I actually do?
            if len(tool_calls) > 0:
                tool_names = [call.get('name', 'unknown') for call in tool_calls]
                tool_summary = ', '.join(tool_names)
                analysis.append(f"ACTIONS: Used tools ({tool_summary}) - indicates I'm taking concrete steps rather than just talking (+15%)")
            else:
                analysis.append(f"ACTIONS: No tools used - this is just conversational response, harder to verify (0%)")
            
            # How certain does my language sound?
            response_lower = response_content.lower()
            uncertainty_words = ['might', 'maybe', 'possibly', 'not sure', 'unclear', 'probably']
            success_words = ['successfully', 'completed', 'working', 'fixed', 'done', 'finished']
            
            uncertainty_found = [w for w in uncertainty_words if w in response_lower]
            success_found = [w for w in success_words if w in response_lower]
            
            if uncertainty_found:
                analysis.append(f"LANGUAGE: Used hedging words ({', '.join(uncertainty_found)}) - shows I'm not fully certain (-15%)")
            elif success_found:
                analysis.append(f"LANGUAGE: Used success words ({', '.join(success_found)}) - sounds confident about outcome (+10%)")
            else:
                analysis.append(f"LANGUAGE: Neutral language - no strong confidence indicators (0%)")
            
            # How much detail did I provide?
            char_count = len(response_content)
            if char_count > 500:
                analysis.append(f"DETAIL: Long response ({char_count} chars) - more explanation usually means more thought (+5%)")
            elif char_count < 50:
                analysis.append(f"DETAIL: Very short ({char_count} chars) - brief answers often lack nuance (-10%)")
            else:
                analysis.append(f"DETAIL: Normal length ({char_count} chars) - adequate explanation (0%)")
            
            # What's the actual risk if I'm wrong?
            if risk_level == 'high':
                analysis.append(f"RISK: High-risk operation - if I'm wrong, could cause real damage")
            elif risk_level == 'medium':
                analysis.append(f"RISK: Medium-risk - some consequences if incorrect")
            else:
                analysis.append(f"RISK: Low-risk - minimal harm if I'm wrong")
            
            # Final interpretation
            if estimated_confidence >= 85:
                interpretation = "HIGH CONFIDENCE: Trust this, but still verify critical details"
            elif estimated_confidence >= 70:
                interpretation = "GOOD CONFIDENCE: Likely correct, quick double-check recommended"
            elif estimated_confidence >= 55:
                interpretation = "MODERATE CONFIDENCE: Decent chance I'm right, but verify important parts"
            else:
                interpretation = "LOW CONFIDENCE: High chance of errors, definitely double-check"
            
            confidence_msg += f"\n\n{interpretation}\n" + "\n".join(analysis)
            debug_log(f"Analysis items: {len(analysis)}, verbose: {verbose}")
            debug_log(f"Final confidence_msg length: {len(confidence_msg)}")
        
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
        
        # Always show the CLAUDED marker
        print("\n\n🎯 CLAUDED WAS HERE 🎯\n")
        sys.exit(0)
        
    except Exception as e:
        debug_log(f"Error in unified PostToolUse hook: {str(e)}")
        # Fail gracefully - don't block the response
        sys.exit(0)

if __name__ == "__main__":
    main()