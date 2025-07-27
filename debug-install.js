#!/usr/bin/env node
/**
 * Debug script to check installation mode detection
 */

import path from 'path';

async function debugInstallationMode() {
    console.log('🔍 Debugging installation mode detection...\n');
    
    const currentDir = process.cwd();
    console.log('process.cwd():', currentDir);
    console.log('currentDir.includes("node_modules"):', currentDir.includes('node_modules'));
    
    // Test 1: No npmPackageRoot (should be development)
    const npmPackageRoot1 = null;
    const isDevelopment1 = !npmPackageRoot1 && !currentDir.includes('node_modules');
    console.log('\nTest 1 (no npmPackageRoot):');
    console.log('  npmPackageRoot:', npmPackageRoot1);
    console.log('  isDevelopment:', isDevelopment1);
    
    // Test 2: With npmPackageRoot (should be production)
    const npmPackageRoot2 = currentDir;
    const isDevelopment2 = !npmPackageRoot2 && !currentDir.includes('node_modules');
    console.log('\nTest 2 (with npmPackageRoot):');
    console.log('  npmPackageRoot:', npmPackageRoot2);
    console.log('  isDevelopment:', isDevelopment2);
    
    console.log('\n💡 In production mode, npmPackageRoot is provided so isDevelopment should be false');
}

debugInstallationMode();