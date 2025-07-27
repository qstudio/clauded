#!/usr/bin/env node
/**
 * Test script for clauded installation in production mode (simulating npm install)
 */

import { installClauded } from './src/setup/installer.js';
import path from 'path';

async function testProductionInstallation() {
    console.log('🧪 Testing clauded installation in production mode (simulating npm install)...\n');
    
    try {
        // Test production mode with npmPackageRoot
        const currentDir = process.cwd();
        
        await installClauded({
            forceUpdate: true,
            npmPackageRoot: currentDir  // Simulate being called from postinstall with package root
        });
        
        console.log('\n✅ Production mode installation test completed!');
        console.log('💡 Check ~/.claude/clauded/hooks/ for copied files (not symlinks)');
        
    } catch (error) {
        console.error('❌ Production installation test failed:', error.message);
        process.exit(1);
    }
}

testProductionInstallation();