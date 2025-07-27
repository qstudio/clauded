# Clauded - Claude Taming System

> **A comprehensive framework to control and guide Claude's behavior for safety and productivity**

## 🎯 **Core Goals**

Clauded is a **Claude Taming System** designed to make Claude more thoughtful, transparent, and reliable. It's not about blocking responses, but about enhancing them with self-evaluation and confidence scoring.

### **Primary Objectives:**

1. **🤔 Self-Evaluation** - Make Claude think about and evaluate its own confidence in suggestions/recommendations before making them
2. **📊 Transparency** - Always show users how confident Claude is about its suggestions, even when confidence meets the threshold
3. **⚠️ Risk Reduction** - Prevent time-wasting and reduce risk by ensuring Claude has high confidence in its recommendations
4. **🔄 Non-Blocking Enhancement** - Not to block responses, but to enhance them with confidence scoring and self-reflection
5. **🏗️ Extensible Framework** - Designed to add more "taming" features beyond just confidence validation

### **Key Principles:**
- Claude should evaluate its own confidence **BEFORE** making suggestions
- Users should **ALWAYS** see the confidence level, regardless of whether it meets the threshold
- The system should work for **suggestions/recommendations**, not just code changes
- It's about making Claude more **thoughtful and transparent**, not restrictive

## 🚀 **Key Features**

### **1. Confidence Validation**
- **Triggers** when Claude provides suggestions, recommendations, or code changes
- **Automatically estimates** confidence based on response analysis
- **Displays** detailed confidence reasoning in verbose mode
- **Blocks** only high-risk operations below confidence threshold

### **2. Session Notes & Context Preservation**
- **Save context** between Claude Code sessions with `clauded note`
- **Auto-restart** with context preservation using `clauded restart`
- **View recent notes** when starting clauded to remember what you were working on
- **Timestamps and directories** help track your work history

### **3. Smart Analysis**
The system analyzes responses based on:
- **Actions taken** (tools used, concrete steps)
- **Language confidence** (uncertainty vs. certainty indicators)
- **Response detail** (thoroughness and explanation depth)
- **Risk assessment** (potential consequences of being wrong)

### **Example Confidence Output:**
```
🎯 Confidence: 78% 🎯

GOOD CONFIDENCE: Likely correct, quick double-check recommended

ACTIONS: Used tools (Edit, Read) - indicates I'm taking concrete steps rather than just talking (+15%)
LANGUAGE: Used success words (successfully, completed) - sounds confident about outcome (+10%)
DETAIL: Normal length (342 chars) - adequate explanation (0%)
RISK: Medium-risk - some consequences if incorrect
```

## 📦 Installation

```bash
npm install -g clauded
clauded setup
```

## 🛠️ Usage

### **Set Confidence Threshold:**
```bash
clauded confidence 75  # Set minimum confidence to 75%
```

### **Session Notes:**
```bash
clauded note -m "Working on API endpoints"  # Add a context note
clauded notes                               # View all notes
clauded note -l                             # List all notes
clauded note -c                             # Clear all notes
```

### **Smart Restart:**
```bash
clauded restart                             # Restart Claude with context preservation
clauded restart -m "Fixed the bug"         # Restart with custom context note
```

### **System Management:**
```bash
clauded status --detailed   # Check system health
clauded logs               # Show debug log contents
clauded logs --follow      # Follow logs in real-time
clauded logs --clear       # Clear all debug logs
clauded uninstall          # Remove clauded system
```

## 🔧 How It Works

Clauded integrates with Claude Code through unified hooks that provide comprehensive response analysis:

1. **UserPromptSubmit Hook** - Analyzes conversation context and displays recent notes
2. **PostToolUse Hook** - Evaluates responses after tool usage for confidence scoring
3. **Automatic Analysis** - Estimates confidence based on multiple factors:
   - Tool usage patterns (concrete actions vs. just talking)
   - Language indicators (certainty vs. uncertainty words)
   - Response thoroughness and detail level
   - Risk assessment of proposed operations
4. **Verbose Feedback** - Provides detailed reasoning for confidence scores
5. **Context Preservation** - Saves session notes for continuity across restarts

## 🎯 **Future Features**

As a comprehensive Claude Taming System, Clauded is designed to expand with additional features:

- **Response Quality Validation**
- **Safety Checks**
- **Performance Monitoring**
- **Custom Validation Rules**
- **Team Collaboration Controls**

## 🤝 Contributing

This is a local fork of the `claude-code-checkpoint` library, modified to focus on comprehensive Claude behavior management rather than simple checkpointing.

## 📄 License

MIT License - see LICENSE file for details.

---

**Clauded** - Making Claude more thoughtful, one confidence evaluation at a time. 🧠✨