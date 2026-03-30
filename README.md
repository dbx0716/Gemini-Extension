# Ge-extension

一个 Chrome Manifest V3 浏览器扩展，用于页面内容采集和 Gemini 多机器人协作自动化。

## 功能概览

### 基础功能
- **页面内容采集**：一键采集当前页面的文本内容并保存到本地
- **数据管理**：查看、删除已保存的内容列表
- **悬浮按钮**：在任意网页右下角显示快捷操作按钮

### Gemini 机器人接力（核心功能）
自动协调多个 Gemini 机器人完成游戏素材生成工作流：

- **第一步**：机器人1 → 机器人2，生成场景/素材/角色设计方案
- **第二步**：机器人3 → 机器人4（→ 机器人5），自动生成概念图
  - 场景概念图生成
  - 素材概念图生成
  - 角色参考图生成（可选）

---

## 项目结构

```
Ge-extension/
├── manifest.json           # 扩展配置文件
├── content.js              # 内容脚本（注入到网页）
├── popup.html              # 弹窗页面 HTML
├── popup.js                # 弹窗页面脚本
├── styles.css              # 样式文件
├── gemini-automation.js    # Gemini 页面自动化脚本
├── icons/                  # 图标文件夹
└── README.md               # 说明文档
```

---

## 安装与加载

### 方法一：开发者模式

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 打开右上角的「开发者模式」开关
4. 点击「加载已解压的扩展程序」
5. 选择项目文件夹

### 方法二：创建 PNG 图标

如需 PNG 图标，可使用 ImageMagick 生成：
```bash
cd icons
convert -background none -density 300 icon.svg -resize 16x16 icon16.png
convert -background none -density 300 icon.svg -resize 48x48 icon48.png
convert -background none -density 300 icon.svg -resize 128x128 icon128.png
```

---

## 使用指南

### 一、页面内容采集

1. 打开任意网页
2. 点击浏览器工具栏的扩展图标
3. 点击「采集当前页面」按钮
4. 内容将自动保存到本地存储

### 二、Gemini 机器人接力

#### 准备工作

1. **配置机器人 URL**
   - 点击「机器人配置」展开配置面板
   - 填写机器人 2-5 的 Gemini Gem URL
   - 机器人 1 默认为当前页面
   - 点击「保存配置」

2. **在 Gemini 页面使用**
   - 打开任意 Gemini Gem 页面
   - 扩展会自动检测并启用接力功能

#### 第一步：生成设计方案

1. 在机器人 1 页面输入需求描述
2. 点击「开始第一步」
3. 扩展会自动：
   - 将需求发送给机器人 1
   - 等待机器人 1 回复
   - 自动切换到机器人 2
   - 将机器人 1 的回复转发给机器人 2
   - 等待机器人 2 生成设计方案
4. 完成后，分类区域会显示：
   - 🎬 **场景**：场景构图描述
   - 📦 **素材**：素材清单（可编辑）
   - 🐼 **角色**：角色设计描述

5. **编辑和保存**
   - 可以直接编辑场景、素材、角色内容
   - 点击「保存修改」保存更改
   - 设置场景/素材生成参数

#### 第二步：生成概念图

1. 第一步完成后，点击「开始第二步」
2. 扩展会自动：
   - 跳转到机器人 3 页面
   - 逐个发送场景描述，生成场景概念图
   - 跳转到机器人 4 页面
   - 逐个发送素材描述，生成素材概念图
   - （可选）跳转到机器人 5 页面
   - 生成角色参考图
3. 支持暂停/继续操作

#### 暂停与恢复

- 点击 ⏸ 按钮暂停当前任务
- 再次点击继续执行
- 页面跳转后自动恢复状态

---

## Gemini 回答格式要求

为确保扩展能正确解析 Gemini 的回答，请按以下格式输出：

### 场景格式

```
一、场景构图简述
[场景设置描述，可选]

场景 1：[场景名称]
[场景详细描述内容]

场景 2：[场景名称]
[场景详细描述内容]
...
```

### 素材清单格式

素材清单支持两种格式，请确保输出时使用**制表符（Tab）**分隔各列：

#### 格式一：3列格式（推荐）

```
二、素材清单
素材名称	状态清单	图集需求
玫瑰花瓣	散落的粉红色花瓣	透明感花瓣，带露珠
面粉	白色粉末，有飘散感	袋装开口状态
...
```

| 列 | 内容 |
|---|---|
| 第1列 | 素材名称 |
| 第2列 | 状态清单/描述 |
| 第3列 | 图集需求/步骤 |

#### 格式二：5列格式（带状态变化）

```
二、素材清单
素材名称	初始状态	过程状态	最终状态	图集需求
面团	白色团状	揉捏中的面团	扁平饼状	有弹性质感
玫瑰花	花苞状态	--	盛开的粉玫瑰	半透明花瓣
...
```

| 列 | 内容 |
|---|---|
| 第1列 | 素材名称 |
| 第2列 | 初始状态 |
| 第3列 | 过程状态 |
| 第4列 | 最终状态 |
| 第5列 | 图集需求/步骤 |

### 角色格式

```
三、素材图集需求描述（AI 生成用）
[整体风格描述]

四、角色设计
角色：[角色名称]
外貌：[角色外貌描述]
状态 1（[状态名]）：[状态描述]
状态 2（[状态名]）：[状态描述]
状态 3（[状态名]）：[状态描述]
```

### 重要提示

1. **分隔符**：素材清单必须使用**制表符（Tab）**分隔，不要使用空格或逗号
2. **表头**：素材清单必须包含表头行，关键词为 `素材名称` 或 `素材类别`
3. **章节标题**：场景部分以 `一、场景构图简述` 开头，素材部分以 `二、素材清单` 开头
4. **空行**：章节之间保持至少一个空行分隔

---

## 工作流程图

```
用户输入需求
     │
     ▼
┌─────────────┐
│   第一步    │
├─────────────┤
│  机器人 1   │ ← 分析需求
│     ↓       │
│  机器人 2   │ ← 生成设计方案（场景/素材/角色）
└─────────────┘
     │
     ▼
  用户编辑/确认
     │
     ▼
┌─────────────┐
│   第二步    │
├─────────────┤
│  机器人 3   │ ← 生成场景概念图
│     ↓       │
│  机器人 4   │ ← 生成素材概念图
│     ↓       │
│  机器人 5   │ ← 生成角色参考图（可选）
└─────────────┘
     │
     ▼
   完成！
```

---

## 权限说明

| 权限 | 用途 |
|---|---|
| `storage` | 保存采集内容和配置 |
| `activeTab` | 访问当前标签页 |
| `scripting` | 注入内容脚本 |
| `clipboardRead` | 读取剪贴板（粘贴图片） |
| `tabs` | 标签页操作（跳转机器人页面） |

---

## 技术说明

- **Manifest Version**: 3
- **兼容浏览器**: Chrome 88+, Edge 88+
- **注入时机**: `document_end`
- **存储限制**: chrome.storage.local（无硬性限制）

---

## 故障排查

### 悬浮按钮不显示
1. 确认不在 Chrome 内置页面（如 chrome://extensions）
2. 刷新页面 (Cmd+R / F5)
3. 打开开发者工具 Console 查看错误

### 机器人接力不工作
1. 确认在 Gemini 页面（gemini.google.com）
2. 检查机器人 URL 配置是否正确
3. 查看 Console 日志了解详细错误

### 场景/素材数据为空
1. 确认 Gemini 回答符合格式要求
2. 检查是否使用了制表符分隔
3. 查看 Console 中的解析日志

### 页面跳转后状态丢失
1. 不要关闭 popup 弹窗
2. 扩展会自动恢复暂停状态
3. 检查 storage 中是否有残留配置

---

## 问题解决与插件优化

### 1. 流程控制模式

#### 串行任务链
多个机器人按顺序执行，每个完成后再跳下一个：

```javascript
// 机器人完成后跳转到下一个
async function jumpToNextBot(currentBot, nextBotUrl, nextState) {
  const delay = 3000 + Math.random() * 3000;
  await sleep(delay);
  window.open(nextBotUrl, '_blank');

  // 更新状态
  const config = await getStorage('geStep2Config');
  config.state = nextState;
  await setStorage({ geStep2Config: config });
}
```

#### 可配置跳过
允许用户跳过某些环节，手动填入内容：

```javascript
// 根据勾选状态决定是否执行
if (bot1Enabled) {
  // 运行机器人1
  await runBot1();
} else {
  // 跳过，使用用户手动填入的内容
  config.bot1Content = manualInput1.value;
}
```

#### 条件分支
根据勾选状态决定执行路径：

```javascript
// 检查各机器人启用状态
const bot3Enabled = config.bot3Enabled !== false;
const bot4Enabled = config.bot4Enabled !== false;
const bot5Enabled = config.bot5Enabled !== false;

if (bot3Enabled && scenes.length > 0) {
  await executeStep2Part1(config);
} else if (bot4Enabled && materials.length > 0) {
  await executeStep2Part2(config);
}
// ...
```

#### 状态传递
通过 `chrome.storage` 在页面间传递数据和状态：

```javascript
// 保存状态到 storage，让下一个页面的 content script 继续执行
config.state = 'step2_part1_scenes';
config.currentSceneIndex = 0;
await chrome.storage.local.set({ geStep2Config: config });

// 下一个页面读取状态
const result = await chrome.storage.local.get(['geStep2Config']);
if (result.geStep2Config?.state === 'step2_part1_scenes') {
  await executeStep2Part1(result.geStep2Config);
}
```

---

### 2. 异步等待策略

#### 固定指令延长发送
给AI更多处理时间：

```javascript
// 等待AI回复完成
async function waitForComplete(timeout = 120000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const isComplete = await checkCompleteStatus();
    if (isComplete) return true;
    await sleep(1000);
  }
  return false; // 超时
}
```

#### 图片内容额外延迟
图片需要更长处理时间：

```javascript
// 发送带图片的消息时增加延迟
if (images && images.length > 0) {
  await sendAndWaitForComplete(message, images);
  // 图片生成需要更长时间
  await sleep(5000);
} else {
  await sendAndWaitForComplete(message);
}
```

#### 超时不重复编辑
避免重复操作污染结果：

```javascript
// 超时后不再重复编辑，直接继续下一步
const success = await waitForComplete(40000);
if (!success) {
  console.log('[Ge-extension] 等待超时，跳过当前步骤');
  // 不重复编辑，直接进入下一个
}
```

#### 可跳过等待
给用户加速完成的选择：

```javascript
// 提供跳过按钮
skipWaitBtn.addEventListener('click', () => {
  skipWaiting = true;
  console.log('[Ge-extension] 用户跳过等待');
});
```

---

### 3. 图片处理

#### 多入口上传
粘贴 + 文件选择：

```javascript
// 粘贴图片
document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const base64 = await fileToBase64(file);
      addImage(base64);
    }
  }
});

// 文件选择上传
fileInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const base64 = await fileToBase64(file);
    addImage(base64);
  }
});
```

#### 内存限制解除
防止大量图片卡死：

```javascript
// 不限制图片数量，但使用懒加载
function renderImageThumbnails(images) {
  // 只渲染可见区域的缩略图
  const visibleStart = Math.floor(scrollTop / THUMB_HEIGHT);
  const visibleEnd = visibleStart + VISIBLE_COUNT;

  return images.slice(visibleStart, visibleEnd).map((img, i) =>
    `<img src="${img}" loading="lazy">`
  ).join('');
}
```

#### 加载逻辑调整
等待图片完全加载后再操作：

```javascript
// 确保图片加载完成
async function waitForImagesLoaded(selector) {
  const images = document.querySelectorAll(selector);
  await Promise.all(Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve; // 即使失败也继续
    });
  }));
}
```

---

### 4. 模式适配

#### 快速/思考模式切换

```javascript
async function switchToThinkingMode() {
  // 检查当前模式
  const currentMode = document.querySelector('.mode-label')?.textContent;
  if (currentMode === 'Thinking' || currentMode === '思考') {
    return; // 已经是思考模式
  }

  // 点击切换按钮
  const toggleBtn = document.querySelector('[data-mode-toggle]');
  toggleBtn?.click();
}
```

#### 中英文界面适配

```javascript
// 适配中英文模式名称
function isThinkingMode() {
  const modeText = document.querySelector('.mode-label')?.textContent?.trim();
  return modeText === 'Thinking' || modeText === '思考';
}
```

#### 固定提示词注入
保证输出一致性：

```javascript
// 发送前注入固定提示词
const FIXED_PROMPTS = {
  style: '画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。',
  quality: '高品质游戏资产，高分辨率。'
};

function buildMessage(content, type) {
  const prefix = FIXED_PROMPTS[type] || '';
  return prefix + content;
}
```

---

### 5. 数据管理

#### 制表符分隔
素材清单必须用 Tab 分隔，不是空格或逗号：

```javascript
// 解析素材表格 - 必须用制表符
function parseMaterials(text) {
  const lines = text.split('\n');
  const materials = [];

  for (const line of lines) {
    // 关键：用 \t 分隔，不是空格或逗号
    const cols = line.split('\t');
    if (cols.length >= 2) {
      materials.push({
        name: cols[0],
        description: cols[1],
        steps: cols[2] || ''
      });
    }
  }
  return materials;
}
```

#### 表格行列限制
防止解析错误：

```javascript
// 限制表格列数
const MAX_COLUMNS = 5;
const rows = tableData.split('\n').map(row => {
  const cols = row.split('\t');
  return cols.slice(0, MAX_COLUMNS); // 只取前5列
});
```

#### 编辑后同步
修改后同时更新 `geStep2Config` 和 `geTaskHistory`：

```javascript
// 保存编辑后的数据 - 同步到两个存储
async function saveTableEdit(updatedMaterials) {
  // 1. 更新 geStep2Config（运行时使用）
  const config = await chrome.storage.local.get(['geStep2Config']);
  config.geStep2Config.materials = updatedMaterials;
  await chrome.storage.local.set({ geStep2Config: config.geStep2Config });

  // 2. 更新 geTaskHistory（重做时使用）
  const history = await chrome.storage.local.get(['geCurrentTaskId', 'geTaskHistory']);
  const taskIndex = history.geTaskHistory.findIndex(t => t.taskId === history.geCurrentTaskId);
  if (taskIndex !== -1) {
    history.geTaskHistory[taskIndex].bots.bot4.materials = updatedMaterials;
    await chrome.storage.local.set({ geTaskHistory: history.geTaskHistory });
  }
}
```

#### 历史记录同步
保证重做时读取最新数据：

```javascript
// 重做时从 geTaskHistory 读取最新数据
async function handleRedo(taskId, botKey) {
  const result = await chrome.storage.local.get(['geTaskHistory']);
  const task = result.geTaskHistory.find(t => t.taskId === taskId);

  // 读取最新的素材数据（包含用户之前的编辑）
  const botData = task.bots[botKey];
  const redoConfig = {
    taskId: taskId,
    materials: botData.materials || [],  // 最新数据
    materialSetting: botData.materialSetting || ''
  };

  // 设置当前任务ID，确保后续更新到正确的任务
  await chrome.storage.local.set({
    geRedoConfig: redoConfig,
    geCurrentTaskId: taskId
  });
}
```

#### 可编辑可删除
用户能修正数据：

```javascript
// 删除行
function handleDeleteItem(category, index) {
  classifiedData[category].splice(index, 1);
  displayCategoryContent(category);
  // 同步到 storage
  saveToStorage();
}

// 编辑后保存
editableCell.addEventListener('blur', () => {
  classifiedData[category][index][field] = editableCell.textContent;
  saveToStorage();
});
```

#### 自动识别场景
从文本中提取结构化数据：

```javascript
// 解析场景内容
function parseScenes(text) {
  const scenes = [];
  const regex = /场景\s*(\d+)[：:]\s*(.+?)(?=场景\s*\d+[：:]|$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    scenes.push({
      index: parseInt(match[1]),
      title: match[2].trim().split('\n')[0],
      content: match[2].trim()
    });
  }
  return scenes;
}
```

#### 历史记录
保存完整状态，支持重做：

```javascript
// 创建任务记录
function createTask(config) {
  const task = {
    taskId: generateId(),
    timestamp: Date.now(),
    bots: {
      bot1: { ran: false, content: '' },
      bot3: { ran: false, scenes: [], sceneSetting: '' },
      bot4: { ran: false, materials: [], materialSetting: '' },
      bot5: { ran: false, character: '' }
    }
  };
  // 保存到历史
  chrome.storage.local.get(['geTaskHistory'], (result) => {
    const tasks = result.geTaskHistory || [];
    tasks.unshift(task);
    chrome.storage.local.set({ geTaskHistory: tasks.slice(0, 10) });
  });
}
```

---

### 6. UI状态反馈

#### 按钮状态变化
暂停/继续/完成：

```javascript
function updateButtonState(state) {
  const btn = document.getElementById('pauseBtn');

  switch(state) {
    case 'running':
      btn.textContent = '⏸';
      btn.classList.remove('paused');
      break;
    case 'paused':
      btn.textContent = '▶';
      btn.classList.add('paused');
      break;
    case 'completed':
      btn.textContent = '✓';
      btn.disabled = true;
      break;
  }
}
```

#### 进度提示

```javascript
function updateProgress(current, total, itemName) {
  const progressText = `正在处理 ${itemName} ${current}/${total}`;
  statusDiv.textContent = progressText;

  // 进度条
  progressBar.style.width = `${(current / total) * 100}%`;
}
```

#### 减少冗余按钮

```javascript
// 根据状态隐藏不需要的按钮
function updateUI(state) {
  if (state === 'step2') {
    pauseBtn.style.display = 'none'; // 第二步不需要暂停按钮
  }
  if (state === 'completed') {
    skipBtn.style.display = 'none';
    saveBtn.textContent = '完成';
  }
}
```

---

### 7. 容错机制

#### 网络异常重试

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch (error) {
      console.log(`[Ge-extension] 第 ${i + 1} 次重试...`);
      await sleep(2000 * (i + 1)); // 指数退避
    }
  }
  throw new Error('网络请求失败');
}
```

#### 检查对浏览器影响

```javascript
// 监控内存使用
function checkMemoryUsage() {
  if (performance.memory) {
    const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
    if (usedMB > 500) {
      console.warn('[Ge-extension] 内存使用过高:', usedMB.toFixed(2), 'MB');
      // 清理缓存
      cleanupCache();
    }
  }
}

// 避免内存泄漏
function cleanupOnUnload() {
  chrome.runtime.onSuspend.addListener(() => {
    clearInterval(memoryCheckInterval);
    // 释放大对象
    imageCache = null;
  });
}
```

---

## 许可证

MIT
