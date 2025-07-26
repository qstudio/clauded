#!/usr/bin/env python3
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
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass  # Silently fail if we can't write to debug log

def estimate_confidence(response):
    """Sophisticated confidence estimation based on multiple factors"""
    if not response:
        return 35  # Default low-neutral
    
    # Start with conservative base score
    score = 35
    response_lower = response.lower()
    debug_log(f"Starting with base score: {score}%")
    
    # === POSITIVE INDICATORS ===
    
    # Strong success indicators (contextual)
    strong_success = ['successfully completed', 'working correctly', 'fixed the issue', 'problem solved']
    if any(phrase in response_lower for phrase in strong_success):
        score += 20
        debug_log("Added 20 points for strong success indicators")
    
    # Moderate success indicators
    success_words = ['successfully', 'completed', 'fixed', 'working', 'done', 'resolved']
    success_count = sum(1 for word in success_words if word in response_lower)
    if success_count > 0:
        # Diminishing returns for multiple success words
        score += min(success_count * 8, 15)
        debug_log(f"Added {min(success_count * 8, 15)} points for {success_count} success indicators")
    
    # Precision indicators
    precision_words = ['exactly', 'precisely', 'specifically', 'correct', 'accurate']
    if any(word in response_lower for word in precision_words):
        score += 8
        debug_log("Added 8 points for precision indicators")
    
    # === TOOL USAGE (Risk-weighted) ===
    
    # Low-risk tools
    safe_tools = ['Read', 'LS', 'Grep', 'Glob']
    safe_tool_count = sum(1 for tool in safe_tools if tool in response)
    if safe_tool_count > 0:
        score += min(safe_tool_count * 5, 10)
        debug_log(f"Added {min(safe_tool_count * 5, 10)} points for {safe_tool_count} safe tools")
    
    # Medium-risk tools
    medium_tools = ['Bash', 'WebFetch']
    medium_tool_count = sum(1 for tool in medium_tools if tool in response)
    if medium_tool_count > 0:
        score += min(medium_tool_count * 8, 15)
        debug_log(f"Added {min(medium_tool_count * 8, 15)} points for {medium_tool_count} medium-risk tools")
    
    # High-risk tools
    risky_tools = ['Edit', 'Write', 'MultiEdit']
    risky_tool_count = sum(1 for tool in risky_tools if tool in response)
    if risky_tool_count > 0:
        # High-risk tools are confident actions but also dangerous
        score += min(risky_tool_count * 6, 12)
        debug_log(f"Added {min(risky_tool_count * 6, 12)} points for {risky_tool_count} high-risk tools")
    
    # === NEGATIVE INDICATORS ===
    
    # Strong uncertainty indicators
    strong_uncertainty = ['not sure', 'unclear', 'uncertain', 'i think', 'i believe', 'i assume']
    strong_uncertainty_count = sum(1 for phrase in strong_uncertainty if phrase in response_lower)
    if strong_uncertainty_count > 0:
        score -= strong_uncertainty_count * 12
        debug_log(f"Reduced {strong_uncertainty_count * 12} points for strong uncertainty")
    
    # Hedging language (more comprehensive)
    hedging_phrases = [
        'might', 'maybe', 'possibly', 'probably', 'likely', 'should work',
        'seems', 'appears', 'could be', 'might be', 'try this', 'attempt to'
    ]
    hedging_count = sum(1 for phrase in hedging_phrases if phrase in response_lower)
    if hedging_count > 0:
        score -= hedging_count * 6
        debug_log(f"Reduced {hedging_count * 6} points for {hedging_count} hedging phrases")
    
    # Question marks indicate uncertainty
    question_count = response.count('?')
    if question_count > 0:
        score -= min(question_count * 4, 12)
        debug_log(f"Reduced {min(question_count * 4, 12)} points for {question_count} questions")
    
    # Error/problem indicators without solutions
    error_words = ['error', 'issue', 'problem', 'failed', 'broken']
    solution_words = ['fix', 'solve', 'resolve', 'correct']
    error_count = sum(1 for word in error_words if word in response_lower)
    solution_count = sum(1 for word in solution_words if word in response_lower)
    
    if error_count > solution_count:
        score -= (error_count - solution_count) * 8
        debug_log(f"Reduced {(error_count - solution_count) * 8} points for unresolved errors")
    
    # === CONTEXTUAL FACTORS ===
    
    # Response length analysis
    if len(response) < 30:
        score -= 15
        debug_log("Reduced 15 points for very short response")
    elif len(response) < 100:
        score -= 8
        debug_log("Reduced 8 points for short response")
    elif len(response) > 1000:
        score += 8
        debug_log("Added 8 points for detailed response")
    
    # Code examples indicate concrete solutions
    code_blocks = response.count('```')
    if code_blocks > 0:
        score += min(code_blocks * 6, 15)
        debug_log(f"Added {min(code_blocks * 6, 15)} points for {code_blocks} code blocks")
    
    # Numbered lists or structured responses show organization
    if re.search(r'^[0-9]+\.', response, re.MULTILINE):
        score += 5
        debug_log("Added 5 points for structured numbered response")
    
    # === FINAL ADJUSTMENTS ===
    
    # Clamp to realistic range (confidence estimation should be conservative)
    score = max(15, min(85, score))
    debug_log(f"Final estimated confidence score: {score}%")
    
    return score

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
        confidence_pattern = r'confidence:\s*(\d{1,3})%'
        confidence_match = re.search(confidence_pattern, response.lower())
        
        if confidence_match:
            # Extract explicit confidence percentage
            confidence_pct = int(confidence_match.group(1))
            debug_log(f"Found explicit confidence statement: {confidence_pct}%")
        else:
            # Estimate confidence when not explicitly stated
            debug_log("No explicit confidence found, estimating from response characteristics")
            confidence_pct = estimate_confidence(response)
            debug_log(f"Estimated confidence: {confidence_pct}%")
        
        # Check minimum confidence threshold (from config)
        config_path = os.path.expanduser('~/.claude/clauded-config.json')
        min_confidence = 85  # Default fallback
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
                min_confidence = config.get('minConfidence', 50)
        except Exception as e:
            debug_log(f"Could not read config, using default: {str(e)}")
        
        debug_log(f"Minimum confidence threshold: {min_confidence}%")
        
        if confidence_pct < min_confidence:
            debug_log(f"Confidence {confidence_pct}% below threshold {min_confidence}%, prompting user")
            
            # Use JSON output to prompt user interactively
            prompt_output = {
                "decision": "prompt_user",
                "message": f"⚠️ 🎯 Claude's confidence is {confidence_pct}% (below your {min_confidence}% threshold). Continue anyway?",
                "allow_continue": True,
                "default_action": "block"
            }
            print(json.dumps(prompt_output))
            sys.exit(0)
        
        debug_log(f"Confidence {confidence_pct}% meets threshold, allowing prompt")
        
        # Show user the confidence validation passed
        print(f"✅ 🎯 Confidence: {confidence_pct}% (meets {min_confidence}% threshold)")
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
