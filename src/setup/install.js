#!/usr/bin/env node
/**
 * Post-install script for clauded package
 * Ensures all hooks are updated from the npm package installation
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    try {
        console.log('📦 Setting up clauded hooks...');
        
        // Get the package root directory
        const packageRoot = resolve(__dirname, '../..');
        
        // Make setup scripts executable
        const setupDir = resolve(packageRoot, 'src/setup');
        if (fs.existsSync(setupDir)) {
            try {
                execSync(`chmod +x ${setupDir}/*.py`, { stdio: 'pipe' });
            } catch (e) {
                // Ignore chmod errors on systems where it's not needed
            }
        }
        
        // Run the main installer
        const installerScript = resolve(setupDir, 'installer.js');
        if (fs.existsSync(installerScript)) {
            console.log('🔧 Installing hooks from npm package...');
            const { installClauded } = await import(installerScript);
            await installClauded({
                forceUpdate: true,
                npmPackageRoot: packageRoot
            });
            console.log('✅ clauded hooks installed successfully!');
            
            // Show new features for this version
            console.log('\n🆕 New in v1.2.0:');
            console.log('   • Deep confidence analysis reveals AI reasoning process');
            console.log('   • Shows exactly which words/actions influenced confidence');
            console.log('   • Risk assessment: "if I\'m wrong, could cause real damage"');
            console.log('   • Language analysis: hedging vs success words');
            console.log('   • Response length and detail evaluation');
            console.log('\n💡 Enable verbose mode to see the full AI decision breakdown!');
        } else {
            console.log('⚠️  Installer script not found, skipping hook installation');
        }
        
    } catch (error) {
        console.warn('⚠️  Hook installation failed (non-critical):', error.message);
        // Don't fail the npm install for this
        process.exit(0);
    }
}

main();