const electron = require('electron');
const fontList = require('font-list');
const karaoke = require('./karaoke');
const { getProjectStructure } = require('./hear-this');

const { app, ipcMain, shell, Menu } = electron;
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let hearThisProjects;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 960,
    webPreferences: { nodeIntegration: true },
  });
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`,
  );
  if (isDev) {
    // Open the DevTools.
    //BrowserWindow.addDevToolsExtension('<location to your react chrome extension>');
    mainWindow.webContents.openDevTools();
  } else {
    Menu.setApplicationMenu(null);
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

function handleGetFonts() {
  ipcMain.on('did-start-getfonts', async event => {
    console.log('Getting system fonts');
    fontList
      .getFonts()
      .then(fonts => {
        event.sender.send(
          'did-finish-getfonts',
          // Font names with spaces are wrapped in quotation marks
          fonts.map(font => font.replace(/^"|"$/g, '')).sort(),
        );
      })
      .catch(err => {
        event.sender.send('did-finish-getfonts', err);
      });
  });
}

function handleGetProjects() {
  ipcMain.on('did-start-getprojectstructure', async event => {
    console.log('Getting project structure');
    hearThisProjects = getProjectStructure();
    event.sender.send('did-finish-getprojectstructure', hearThisProjects);
  });
}

function handleOpenOutputFolder() {
  ipcMain.on('open-output-folder', async (event, outputFile) => {
    shell.showItemInFolder(outputFile);
  });
}

function handleSubmission() {
  ipcMain.on('did-start-conversion', async (event, args) => {
    const onProgress = args => {
      event.sender.send('on-progress', args);
    };
    console.log('Starting command line', args);
    const { hearThisFolder, backgroundFile, font, outputFile } = args;
    let result;
    try {
      result = await karaoke.execute(
        hearThisFolder,
        backgroundFile,
        font,
        outputFile,
        onProgress,
      );
    } catch (err) {
      result = err;
    }

    const retArgs =
      typeof result === 'string'
        ? { outputFile: result }
        : { error: { message: result.message, stack: result.stack } };
    console.log('Command line process finished', retArgs);
    event.sender.send('did-finish-conversion', retArgs);
  });
}

app.on('ready', () => {
  createWindow();
  handleSubmission();
  handleGetProjects();
  handleGetFonts();
  handleOpenOutputFolder();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
