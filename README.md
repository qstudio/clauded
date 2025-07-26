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

## 🚀 **Current Feature: Confidence Validation**

The first step in the Claude Taming System is **confidence validation**. This feature:

- **Triggers** when Claude provides suggestions, recommendations, or code changes
- **Requires** Claude to include a confidence statement in the format: `Confidence: X% - [explanation]`
- **Displays** the confidence evaluation to users, even when it meets the threshold
- **Blocks** responses only when confidence is below the minimum threshold (default: 50%)

### **Example Output:**
```
🔒 **CONFIDENCE EVALUATION**
Based on the suggestions provided, I would rate my confidence as:
**Confidence: 75% - These suggestions follow established patterns and address common issues, though some may require testing in your specific environment.**
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

### **View Debug Logs:**
```bash
clauded logs           # Show debug log contents
clauded logs --follow  # Follow logs in real-time
clauded logs --clear   # Clear all debug logs
```

### **Uninstall:**
```bash
clauded uninstall
```

## 🔧 How It Works

Clauded integrates with Claude Code through hooks that analyze conversation context:

1. **UserPromptSubmit Hook** - Runs when you submit a prompt to Claude
2. **Context Analysis** - Examines the conversation for suggestions, recommendations, or code changes
3. **Confidence Detection** - Looks for confidence statements in Claude's responses
4. **Evaluation Display** - Shows confidence evaluation to the user
5. **Threshold Enforcement** - Blocks responses below the minimum confidence level

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