// Simple build script for VSCode extension
// Since we're using plain JavaScript, no actual compilation is needed

const fs = require('fs');
const path = require('path');

console.log('Building Markdown Inline Preview extension...');

// Verify that main source files exist
const mainFile = './src/extension-obsidian.js';
if (!fs.existsSync(mainFile)) {
    console.error(`Error: Main file ${mainFile} not found`);
    process.exit(1);
}

// Verify package.json exists
if (!fs.existsSync('./package.json')) {
    console.error('Error: package.json not found');
    process.exit(1);
}

// Create media directory if it doesn't exist
const mediaDir = './media';
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    console.log('Created media directory');
}

// Verify dependencies in package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
console.log(`Building ${packageJson.name} v${packageJson.version}`);

// Check if node_modules exists
if (!fs.existsSync('./node_modules')) {
    console.warn('Warning: node_modules not found. Run "npm install" first.');
}

console.log('Build completed successfully!');
console.log('Ready for packaging.');