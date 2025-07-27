#!/usr/bin/env node
/**
 * Test script for clauded installation in development mode
 */

import { installClauded } from './src/setup/installer.js';

async function testInstallation() {
    console.log('🧪 Testing clauded installation in development mode...\n');
    
    try {
        // Test development mode (no npmPackageRoot)
        await installClauded({
            forceUpdate: true
        });
        
        console.log('\n✅ Development mode installation test completed!');
        console.log('💡 Check ~/.claude/clauded/hooks/ for symlinked files');
        
    } catch (error) {
        console.error('❌ Installation test failed:', error.message);
        process.exit(1);
    }
}

testInstallation();