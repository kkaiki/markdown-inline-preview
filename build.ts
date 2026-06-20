import fs from 'fs';

console.log('Building Markdown Inline Preview extension...');

const mainFile = './out/extension.js';
if (!fs.existsSync(mainFile)) {
    console.error(`Error: Main file ${mainFile} not found`);
    process.exit(1);
}

if (!fs.existsSync('./package.json')) {
    console.error('Error: package.json not found');
    process.exit(1);
}

const mediaDir = './media';
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    console.log('Created media directory');
}

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8')) as { name: string; version: string };
console.log(`Building ${packageJson.name} v${packageJson.version}`);

if (!fs.existsSync('./node_modules')) {
    console.warn('Warning: node_modules not found. Run "npm install" first.');
}

console.log('Build completed successfully!');
console.log('Ready for packaging.');
