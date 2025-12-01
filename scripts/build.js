const Path = require('path');
const Chalk = require('chalk');
const FileSystem = require('fs');
const Vite = require('vite');
const buildMain = require('./private/buildMain');

function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        base: './',
        mode: 'production'
    });
}

function buildMainProcess() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    return buildMain(mainPath);
}

FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
})

console.log(Chalk.blueBright('Transpiling renderer & main...'));

Promise.allSettled([
    buildRenderer(),
    buildMainProcess(),
]).then(() => {
    console.log(Chalk.greenBright('Renderer & main successfully transpiled!'));
});
