#!/usr/bin/env python3
"""
Shared configuration cache for Claude Code hooks.
Prevents multiple file reads of the same config across hook executions.
"""

import os
import json
import time
from datetime import datetime

# Global cache with expiration
_config_cache = {
    'data': None,
    'timestamp': 0,
    'ttl': 30  # Cache for 30 seconds
}

# Always use local debug log if we're in a project directory
local_debug_log = os.path.join(os.getcwd(), '.claude', 'clauded-debug.log')
global_debug_log = os.path.expanduser("~/.claude/clauded-debug.log")

# Check if we're in a project directory (has package.json or .claude directory)
is_project_dir = os.path.exists('package.json') or os.path.exists('.claude')
if is_project_dir:
    DEBUG_LOG = local_debug_log
    # Ensure local .claude directory exists
    os.makedirs(os.path.dirname(local_debug_log), exist_ok=True)
else:
    DEBUG_LOG = global_debug_log

def debug_log(message):
    try:
        timestamp = datetime.now().isoformat()
        with open(DEBUG_LOG, 'a') as f:
            f.write(f"[CONFIG-CACHE {timestamp}] {message}\n")
    except Exception:
        pass

def get_cached_config():
    """Get configuration with caching to avoid repeated file reads"""
    # Try local config first, then fall back to global
    local_config_path = os.path.join(os.getcwd(), '.claude', 'clauded-config.json')
    global_config_path = os.path.expanduser('~/.claude/clauded-config.json')
    
    # Prefer local config if it exists
    if os.path.exists(local_config_path):
        config_path = local_config_path
        debug_log(f"Using local config: {config_path}")
    else:
        config_path = global_config_path
        debug_log(f"Using global config: {config_path}")
    current_time = time.time()
    
    # Check if cache is valid
    if (_config_cache['data'] is not None and 
        current_time - _config_cache['timestamp'] < _config_cache['ttl']):
        debug_log("Using cached config")
        return _config_cache['data']
    
    # Cache miss or expired, read from file
    default_config = {
        'minConfidence': 50, 
        'verbose': True,
        'lastUpdated': datetime.now().isoformat()
    }
    
    try:
        debug_log(f"Reading config from {config_path}")
        with open(config_path, 'r') as f:
            config = json.load(f)
            
        # Ensure all required keys exist
        for key, default_value in default_config.items():
            if key not in config:
                config[key] = default_value
        
        # Update cache
        _config_cache['data'] = config
        _config_cache['timestamp'] = current_time
        
        debug_log(f"Config loaded and cached: minConfidence={config.get('minConfidence')}, verbose={config.get('verbose')}")
        return config
        
    except FileNotFoundError:
        debug_log("Config file not found, using defaults")
        _config_cache['data'] = default_config
        _config_cache['timestamp'] = current_time
        return default_config
        
    except json.JSONDecodeError as e:
        debug_log(f"Config file corrupted, using defaults: {str(e)}")
        _config_cache['data'] = default_config
        _config_cache['timestamp'] = current_time
        return default_config
        
    except Exception as e:
        debug_log(f"Error reading config, using defaults: {str(e)}")
        _config_cache['data'] = default_config
        _config_cache['timestamp'] = current_time
        return default_config

def invalidate_cache():
    """Invalidate the config cache (useful after config updates)"""
    debug_log("Cache invalidated")
    _config_cache['data'] = None
    _config_cache['timestamp'] = 0

def get_cache_stats():
    """Get cache statistics for debugging"""
    current_time = time.time()
    age = current_time - _config_cache['timestamp']
    is_valid = _config_cache['data'] is not None and age < _config_cache['ttl']
    
    return {
        'cached': _config_cache['data'] is not None,
        'valid': is_valid,
        'age_seconds': age,
        'ttl_seconds': _config_cache['ttl']
    }

# Convenience functions for common config values
def get_min_confidence():
    """Get minimum confidence threshold"""
    config = get_cached_config()
    return config.get('minConfidence', 50)

def get_verbose_mode():
    """Get verbose mode setting"""
    config = get_cached_config()
    return config.get('verbose', True)

def is_high_confidence_required():
    """Check if high confidence is required (threshold > 80)"""
    return get_min_confidence() > 80