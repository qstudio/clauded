#!/usr/bin/env node

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

console.log('🧪 Testing confidence notification hook...\n');

// Test data - simulate a low confidence response
const testNotificationLowConfidence = {
  notification: {
    content: "I think this might work, but I'm not entirely sure. Confidence: 30% - This is quite uncertain."
  },
  tool_calls: []
};

const testNotificationHighConfidence = {
  notification: {
    content: "This solution is well-tested and follows best practices. Confidence: 85% - Very confident in this approach."
  },
  tool_calls: []
};

const testNotificationNoConfidence = {
  notification: {
    content: "Here's a possible solution that might work for your use case."
  },
  tool_calls: [
    { name: 'Edit', args: { file: 'test.js' } }
  ]
};

function testHook(testData, testName) {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Running test: ${testName}`);
    
    const hookPath = './src/setup/confidence-notification-hook.py';
    const process = spawn('python3', [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      console.log(`   Exit code: ${code}`);
      if (stdout) {
        console.log(`   Output: ${stdout.trim()}`);
        try {
          const result = JSON.parse(stdout.trim());
          console.log(`   Decision: ${result.decision}`);
          if (result.message) {
            console.log(`   Message: ${result.message}`);
          }
        } catch (e) {
          console.log(`   Raw output: ${stdout.trim()}`);
        }
      }
      if (stderr) {
        console.log(`   Stderr: ${stderr.trim()}`);
      }
      resolve({ code, stdout, stderr });
    });

    process.on('error', (err) => {
      reject(err);
    });

    // Send test data to stdin
    process.stdin.write(JSON.stringify(testData));
    process.stdin.end();
  });
}

async function runTests() {
  try {
    // Set up config file for testing
    const configPath = join(tmpdir(), 'test-config.json');
    const testConfig = { minConfidence: 50 };
    writeFileSync(configPath, JSON.stringify(testConfig));
    console.log(`📝 Created test config with 50% threshold at ${configPath}`);

    // Test 1: Low confidence (should warn)
    await testHook(testNotificationLowConfidence, "Low confidence explicit (30%)");

    // Test 2: High confidence (should allow)
    await testHook(testNotificationHighConfidence, "High confidence explicit (85%)");

    // Test 3: No explicit confidence (should estimate)
    await testHook(testNotificationNoConfidence, "No explicit confidence");

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();