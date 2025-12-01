const Path = require('path');
const FileSystem = require('fs');

function copyJsFiles(srcDir, destDir) {
  // Copy all .js files from src/main to build/main
  const files = FileSystem.readdirSync(srcDir);

  // Create destination directory if it doesn't exist
  if (!FileSystem.existsSync(destDir)) {
    FileSystem.mkdirSync(destDir, { recursive: true });
  }

  files.forEach(file => {
    const srcPath = Path.join(srcDir, file);
    const destPath = Path.join(destDir, file);
    const stat = FileSystem.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copyJsFiles(srcPath, destPath);
    } else if (file.endsWith('.js')) {
      // Copy JavaScript files
      FileSystem.copyFileSync(srcPath, destPath);
    }
  });
}

function buildMain(mainPath) {
  return new Promise((resolve) => {
    const destPath = Path.join(__dirname, '..', '..', 'build', 'main');
    copyJsFiles(mainPath, destPath);
    resolve();
  });
}

module.exports = buildMain;
