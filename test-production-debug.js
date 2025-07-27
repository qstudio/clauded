#!/usr/bin/env node
/**
 * Debug production installation
 */

import { installClauded } from './src/setup/installer.js';

async function testWithDebug() {
    console.log('🔍 Testing production installation with debug info...\n');
    
    try {
        const currentDir = process.cwd();
        console.log('Current directory:', currentDir);
        
        const options = {
            forceUpdate: true,
            npmPackageRoot: currentDir
        };
        
        console.log('Options:', JSON.stringify(options, null, 2));
        
        await installClauded(options);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

testWithDebug();