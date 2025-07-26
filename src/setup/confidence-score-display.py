#!/usr/bin/env python3
"""
Stop hook for Claude Code - adds confidence scores to completed responses.
This hook analyzes the assistant's response and displays a confidence score.
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
            f.write(f"[{timestamp}] {message}\n")
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

def calculate_confidence_score(response):
    """Calculate confidence score based on response characteristics"""
    debug_log("Calculating confidence score")
    
    # Load user's confidence threshold for comparison
    config_path = os.path.expanduser('~/.claude/clauded-config.json')
    min_confidence = 50  # Default fallback
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            min_confidence = config.get('minConfidence', 50)
        debug_log(f"User confidence threshold: {min_confidence}%")
    except Exception as e:
        debug_log(f"Could not read user config, using default threshold: {str(e)}")
    
    if not response:
        return 50  # Default neutral confidence
    
    score = 50  # Base score
    
    # Check for explicit confidence statements
    confidence_pattern = r'confidence:\s*(\d{1,3})%'
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
    if '```' in response or 'function' in response_lower or 'class' in response_lower:
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
    debug_log(f"Final calculated confidence score: {score}% (user threshold: {min_confidence}%)")
    
    return score

def main():
    debug_log("=== Confidence score display started (Stop hook) ===")
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
        
        # Check if this response already has a confidence score
        if 'confidence:' in response.lower() and '%' in response:
            debug_log("Response already contains confidence score, skipping")
            sys.exit(0)
        
        # Check if this is a meaningful response that warrants a confidence score
        response_lower = response.lower()
        
        # Skip trivial responses
        trivial_patterns = [
            r'^(yes|no)\.?$',
            r'^(ok|okay)\.?$',
            r'^(thanks?|thank you)\.?$',
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
        
        # Just log for now - not outputting JSON due to schema validation issues
        debug_log(f"Calculated confidence score: {confidence_score}%")
        debug_log(f"Response length: {len(response)} characters")
        debug_log("Hook completed successfully - no JSON output for now")
        
        # Exit without output to avoid JSON validation errors
        sys.exit(0)

    except json.JSONDecodeError as e:
        debug_log(f"JSON decode error: {str(e)}")
        sys.exit(0)
    except Exception as e:
        debug_log(f"Unexpected error: {str(e)}")
        sys.exit(0)

if __name__ == "__main__":
    main()
