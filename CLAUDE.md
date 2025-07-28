# Memory: Project Understanding

## Repository Purpose
This repo creates a "Claude Taming System" called **Clauded** that integrates with Claude Code to add confidence scoring and self-evaluation to Claude's responses.

### Core Functionality:
1. **Confidence Analysis**: Makes Claude analyze its own confidence level before providing suggestions/recommendations
2. **Visual Feedback**: Displays confidence scores to users with a "🎯 CLAUDED WAS HERE 🎯" marker  
3. **Session Management**: Provides note-taking and context preservation to maintain continuity across Claude Code sessions
4. **Risk Reduction**: Prevents time-wasting by ensuring Claude has high confidence in recommendations

### Key Files to Reference:
- `README.md` - Complete project overview and usage instructions
- `package.json` - Project metadata and dependencies
- `.claude/settings.json` - Claude Code configuration with hooks
- `src/setup/` - Installation and configuration scripts

### Remember: 
This is a defensive security tool designed to make Claude more thoughtful and transparent, not to block responses but to enhance them with self-evaluation and confidence scoring.

### Session Restart Reminder
- Always read CLAUDE.MD when you restart in this project