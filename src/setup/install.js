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
            console.log('\n🆕 New in v1.1.2:');
            console.log('   • Confidence evaluation now shows on ALL assistant responses');
            console.log('   • Clear explanations: "Good confidence - likely correct"');
            console.log('   • Calculation breakdown: "Base: 60% +15% (took action)"');
            console.log('   • Fixed import issues that caused hook failures');
            console.log('\n💡 Tip: Confidence helps you know when to double-check responses!');
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