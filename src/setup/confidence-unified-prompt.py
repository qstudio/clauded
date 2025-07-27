#!/usr/bin/env python3
"""
Unified UserPromptSubmit hook for Claude Code - combines validation and score display.
This consolidates confidence-validator.py and confidence-score-display.py for better performance.
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
            f.write(f"[UNIFIED-PROMPT {timestamp}] {message}\n")
    except Exception:
        pass  # Silently fail if we can't write to debug log

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

def validate_confidence(response, config):
    """Validate confidence levels against user requirements"""
    if not response:
        return True, None  # No validation needed
    
    # Check for confidence statement in the required format
    confidence_pattern = r'confidence:\s*(\d{1,3})%'
    confidence_match = re.search(confidence_pattern, response.lower())
    
    if not confidence_match:
        return True, None  # No confidence statement, allow prompt
    
    # Extract confidence percentage
    confidence_pct = int(confidence_match.group(1))
    min_confidence = config.get('minConfidence', 50)
    
    debug_log(f"Found confidence {confidence_pct}%, threshold {min_confidence}%")
    
    if confidence_pct < min_confidence:
        message = f"⚠️ 🎯 Claude's confidence is {confidence_pct}% (below your {min_confidence}% threshold). Continue anyway?"
        return False, {
            "decision": "prompt_user",
            "message": message,
            "allow_continue": True,
            "default_action": "block"
        }
    
    return True, None

def calculate_confidence_score(response, config):
    """Calculate confidence score based on response characteristics"""
    debug_log("Calculating confidence score")
    
    min_confidence = config.get('minConfidence', 50)
    verbose_mode = config.get('verbose', True)
    
    if not response:
        return 50, ["No response content provided"]  # Default neutral confidence
    
    score = 50  # Base score
    reasoning = []
    
    # Check for explicit confidence statements
    confidence_pattern = r'confidence:\s*(\d{1,3})%'
    confidence_match = re.search(confidence_pattern, response.lower())
    if confidence_match:
        explicit_confidence = int(confidence_match.group(1))
        debug_log(f"Found explicit confidence: {explicit_confidence}%")
        reasoning.append("Explicit confidence statement found")
        return explicit_confidence, reasoning
    
    # Analyze response characteristics
    response_lower = response.lower()
    
    # Positive indicators
    success_words = [w for w in ['successfully', 'completed', 'fixed', 'working'] if w in response_lower]
    if success_words:
        score += 15
        reasoning.append(f"Success indicators: {', '.join(success_words)}")
        debug_log("Added 15 points for success indicators")
    
    error_handling = [w for w in ['error', 'failed', 'issue', 'problem'] if w in response_lower]
    if error_handling:
        score += 10  # Finding/handling errors shows competence
        reasoning.append(f"Error handling mentioned: {', '.join(error_handling)}")
        debug_log("Added 10 points for error handling")
    
    # Tool usage indicates concrete action
    tool_patterns = ['<function_calls>', '<invoke>', 'Read', 'Write', 'Edit', 'Bash']
    tools_used = [p for p in tool_patterns if p in response]
    if tools_used:
        score += 20
        reasoning.append(f"Used tools: {', '.join(tools_used)}")
        debug_log("Added 20 points for tool usage")
    
    # Code examples or specific solutions
    code_indicators = []
    if '```' in response:
        code_indicators.append("code blocks")
    if 'function' in response_lower:
        code_indicators.append("functions")
    if 'class' in response_lower:
        code_indicators.append("classes")
    
    if code_indicators:
        score += 15
        reasoning.append(f"Technical content: {', '.join(code_indicators)}")
        debug_log("Added 15 points for code examples")
    
    # Uncertainty indicators
    uncertainty_words = [w for w in ['might', 'maybe', 'possibly', 'unclear', 'not sure', 'uncertain'] if w in response_lower]
    if uncertainty_words:
        score -= 20
        reasoning.append(f"Uncertainty words: {', '.join(uncertainty_words)}")
        debug_log("Reduced 20 points for uncertainty indicators")
    
    # Response length analysis
    if len(response) < 100:
        score -= 10
        reasoning.append(f"Short response ({len(response)} chars)")
        debug_log("Reduced 10 points for short response")
    elif len(response) > 1000:
        score += 10
        reasoning.append(f"Detailed response ({len(response)} chars)")
        debug_log("Added 10 points for detailed response")
    
    # Clamp to valid range
    score = max(10, min(95, score))
    debug_log(f"Final calculated confidence score: {score}% (user threshold: {min_confidence}%)")
    
    return score, reasoning

def main():
    start_time = datetime.now()
    debug_log("=== Unified UserPromptSubmit hook started ===")
    
    # Always show something - even before any processing
    print("\n\n🎯 CLAUDED WAS HERE 🎯\n")
    sys.stdout.flush()
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        debug_log(f"Received input data: {list(input_data.keys())}")
        
        # Get configuration
        config = get_config()
        
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
        
        # First, validate confidence if present
        is_valid, validation_output = validate_confidence(response, config)
        if not is_valid:
            debug_log("Confidence validation failed, prompting user")
            print(json.dumps(validation_output))
            sys.exit(1)
        
        # Check if this is a meaningful response that warrants a confidence score
        response_lower = response.lower()
        
        # Only skip completely empty responses
        if len(response.strip()) < 3:
            debug_log("Response too short for confidence scoring")
            sys.exit(0)
        
        # Calculate and display confidence score
        confidence_score, reasoning = calculate_confidence_score(response, config)
        
        debug_log(f"Calculated confidence score: {confidence_score}%")
        
        # Format confidence display based on verbose mode
        verbose_mode = config.get('verbose', True)
        
        if verbose_mode:
            # Full verbose output with reasoning and performance
            if reasoning:
                reasoning_text = " • " + "\n • ".join(reasoning)
                confidence_display = f"\n\n🎯 Confidence: {confidence_score}% 🎯\nBased on: {reasoning_text}\n"
            else:
                confidence_display = f"\n\n🎯 Confidence: {confidence_score}% 🎯\n"
            
            # Calculate performance metrics
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds() * 1000
            
            # Add performance info and estimated token impact
            perf_info = f"⏱️ Hook processing: {processing_time:.1f}ms"
            token_estimate = len(response.split()) * 1.3  # Rough token estimate
            cost_info = f"📊 Est. tokens analyzed: ~{int(token_estimate)}"
            
            confidence_display_with_perf = confidence_display.rstrip() + f"\n{perf_info} | {cost_info}\n"
        else:
            # Minimal output - just confidence score
            confidence_display_with_perf = f"\n\n🎯 Confidence: {confidence_score}% 🎯\n"
        
        # Use simple print to append to response output
        print(confidence_display_with_perf)
        debug_log(f"Displayed confidence score (verbose: {verbose_mode}) with performance")
        
        sys.exit(0)
    
    except Exception as e:
        # Always show something - even if analysis fails
        debug_log(f"Error in analysis, showing fallback: {str(e)}")
        print("\n\n🎯 Claude was here 🎯\n")
        sys.exit(0)

    except json.JSONDecodeError as e:
        debug_log(f"JSON decode error: {str(e)}")
        print("\n\n🎯 Claude was here 🎯\n")
        sys.exit(0)

if __name__ == "__main__":
    main()