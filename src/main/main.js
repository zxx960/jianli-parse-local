const {app, BrowserWindow, ipcMain, session, dialog} = require('electron');
const {join, extname} = require('path');
const fs = require('fs');
const os = require('os');
const pdf = require('pdf-parse-fixed');
const mammoth = require('mammoth');

function parseModelReplyToJson(reply) {
  if (reply && typeof reply === 'object') {
    return reply;
  }

  if (!reply || typeof reply !== 'string') {
    return { raw: reply };
  }

  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(reply);
  if (parsed) {
    return parsed;
  }

  let text = reply;

  const codeBlockMatch = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1];
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonSlice = text.slice(firstBrace, lastBrace + 1);
    parsed = tryParse(jsonSlice);
    if (parsed) {
      return parsed;
    }
  }

  return { raw: reply };
}

async function extractTextFromResumeFile(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const extension = extname(filePath).toLowerCase();

  if (extension === '.pdf') {
    const data = await pdf(buffer);
    return data.text || '';
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  return '';
}

let llamaModel = null;
let llamaContext = null;
let chatSession = null;

function ensureUserModelDir() {
  const baseDir = os.homedir();
  const modelDir = join(baseDir, 'jianli-jiexi-models');

  try {
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create user model directory:', err);
  }

  return modelDir;
}

function resolveModelPath() {
  const userModelDir = ensureUserModelDir();
  const userModelPath = join(userModelDir, 'Qwen3-4B-IQ4_NL.gguf');

  if (!fs.existsSync(userModelPath)) {
    throw new Error(`模型文件不存在，请将 Qwen3-4B-IQ4_NL.gguf 放到: ${userModelPath}`);
  }

  return userModelPath;
}

async function initModel() {
  if (llamaModel && llamaContext && chatSession) return;

  // 动态导入 ESM 模块 node-llama-cpp，避免 CommonJS require 导致的 ERR_REQUIRE_ESM
  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

  // 根据环境选择模型路径
  // 开发环境：直接从项目根目录（process.cwd()）下的 src/models 读取
  // 生产环境：建议将模型放在打包后的 app 根目录下的 models 目录
  const modelPath = resolveModelPath();

  const llama = await getLlama();
  llamaModel = await llama.loadModel({
    modelPath,
  });

  llamaContext = await llamaModel.createContext();
  chatSession = new LlamaChatSession({
    contextSequence: llamaContext.getSequence(),
  });
}

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '简历解析助手',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  if (process.env.NODE_ENV === 'development') {
    const rendererPort = process.argv[2];
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
  }
  else {
    mainWindow.loadFile(join(app.getAppPath(), 'build', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // 预初始化模型，避免首次调用时阻塞过久
  initModel().catch((err) => {
    console.error('Failed to initialize LLM model:', err);
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['script-src \'self\'']
      }
    })
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});

ipcMain.handle('export-resume-excel', async (event, items) => {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, message: '没有可导出的数据' };
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出为 Excel',
      defaultPath: '简历解析结果.xlsx',
      filters: [
        { name: 'Excel 文件', extensions: ['xlsx'] },
      ],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('简历解析结果');

    worksheet.columns = [
      { header: '文件名', key: 'fileName', width: 40 },
      { header: '姓名', key: 'name', width: 15 },
      { header: '性别', key: 'gender', width: 10 },
      { header: '年龄', key: 'age', width: 10 },
      { header: '学历', key: 'education', width: 15 },
      { header: '手机', key: 'phone', width: 20 },
      { header: '邮箱', key: 'email', width: 30 },
    ];

    items.forEach((item, index) => {
      const result = item.result || {};
      const fileName = `${index + 1}. ${item.filePath ? String(item.filePath).split('\\').pop() : ''}`;
      worksheet.addRow({
        fileName,
        name: result.name ?? '',
        gender: result.gender ?? '',
        age: result.age ?? '',
        education: result.education ?? '',
        phone: result.phone ?? '',
        email: result.email ?? '',
      });
    });

    await workbook.xlsx.writeFile(filePath);

    return { canceled: false, success: true, filePath };
  } catch (err) {
    console.error('Error while exporting Excel:', err);
    throw err;
  }
});

ipcMain.handle('select-resume-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '简历文件 (PDF/DOCX)', extensions: ['pdf', 'docx'] },
    ],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePaths,
  };
});

ipcMain.handle('parse-resume-pdf', async (event, filePathsFromRenderer) => {
  try {
    let filePaths = Array.isArray(filePathsFromRenderer) ? filePathsFromRenderer : null;

    if (!filePaths || filePaths.length === 0) {
      const { canceled, filePaths: dialogPaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '简历文件 (PDF/DOCX)', extensions: ['pdf', 'docx'] },
        ],
      });

      if (canceled || !dialogPaths || dialogPaths.length === 0) {
        return { canceled: true };
      }

      filePaths = dialogPaths;
    }

    if (!llamaModel || !llamaContext || !chatSession) {
      await initModel();
    }

    for (const filePath of filePaths) {
      const text = await extractTextFromResumeFile(filePath);

      const prompt = `你是一个中文简历解析助手。请从下面的简历文本中提取候选人的姓名、性别、年龄、最高学历、手机号码和邮箱地址，并严格按照以下 JSON 格式返回：\n\n{
  "name": "姓名或null",
  "gender": "性别字符串（"男"、"女" 或 null）",
  "age": 年龄数字或null,
  "education": "最高学历字符串（如"大专"、"本科"、"硕士"，或 null）",
  "phone": "手机号字符串或null",
  "email": "邮箱字符串或null"
}\n\n不要返回任何解释性文字，只返回 JSON,重要声明，如果找不到对应的内容就填入null,年龄必须有明确的xx岁或者年龄：xxx岁，才能填入，不要考虑出生日期，性别必须有明确文字才能写入，不能靠推断。\n\n--- 简历文本开始 ---\n${text}\n--- 简历文本结束 ---`;

      chatSession.resetChatHistory();

      const reply = await chatSession.prompt(prompt);

      const parsed = parseModelReplyToJson(reply);

      console.log('Resume parsed result:', {
        filePath,
        result: parsed,
      });

      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('resume-item-parsed', {
          filePath,
          result: parsed,
        });
      }
    }

    return {
      canceled: false,
    };
  } catch (err) {
    console.error('Error while parsing resume PDF:', err);
    throw err;
  }
});
