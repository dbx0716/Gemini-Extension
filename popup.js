/**
 * Popup Script - 处理弹窗页面的交互逻辑
 *
 * 功能说明：
 * 1. 从 chrome.storage.local 读取已保存的数据
 * 2. 渲染数据到 popup 页面
 * 3. 提供清空数据的功能
 * 4. 显示当前页面信息
 * 5. Gemini 机器人接力（半自动流程）
 */

(function() {
  'use strict';

  // ========== DOM 元素引用 ==========
  const collectBtn = document.getElementById('collectBtn');
  const thinkingModeBtn = document.getElementById('thinkingModeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const savedList = document.getElementById('savedList');
  const currentPageInfo = document.getElementById('currentPageInfo');
  const recordCount = document.getElementById('recordCount');

  // 机器人配置相关元素
  const toggleConfigBtn = document.getElementById('toggleConfigBtn');
  const botsConfigPanel = document.getElementById('botsConfigPanel');
  const botUrl1 = document.getElementById('botUrl1');
  const botUrl2 = document.getElementById('botUrl2');
  const botUrl3 = document.getElementById('botUrl3');
  const botUrl4 = document.getElementById('botUrl4');
  const botUrl5 = document.getElementById('botUrl5');
  const canvasMasterUrl = document.getElementById('canvasMasterUrl');
  const saveBotUrlsBtn = document.getElementById('saveBotUrlsBtn');
  // 机器人启用勾选框
  const bot1Enabled = document.getElementById('bot1Enabled');
  const bot2Enabled = document.getElementById('bot2Enabled');
  const bot3Enabled = document.getElementById('bot3Enabled');
  const bot4Enabled = document.getElementById('bot4Enabled');
  const bot5Enabled = document.getElementById('bot5Enabled');
  const canvasMasterEnabled = document.getElementById('canvasMasterEnabled');

  // Gemini 机器人接力相关元素
  const geminiPageInfo = document.getElementById('geminiPageInfo');
  const relayPanel = document.getElementById('relayPanel');
  const relayStatus = document.getElementById('relayStatus');
  const progressFill = document.getElementById('progressFill');
  const prevReplySection = document.getElementById('prevReplySection');
  const prevReplyContent = document.getElementById('prevReplyContent');
  const prevReplyText = document.getElementById('prevReplyText');
  const togglePrevReply = document.getElementById('togglePrevReply');
  const savePrevReplyBtn = document.getElementById('savePrevReplyBtn');
  const newReplySection = document.getElementById('newReplySection');
  const newReplyContent = document.getElementById('newReplyContent');
  const newReplyText = document.getElementById('newReplyText');
  const toggleNewReply = document.getElementById('toggleNewReply');
  const relayControls = document.getElementById('relayControls');
  const retryBotControls = document.getElementById('retryBotControls');
  const startStep1Btn = document.getElementById('startStep1Btn');
  const startStep2Btn = document.getElementById('startStep2Btn');
  const stopBtn = document.getElementById('stopBtn');
  const retryBtn = document.getElementById('retryBtn');
  const exportReplyBtn = document.getElementById('exportReplyBtn');
  const retryBot3Btn = document.getElementById('retryBot3Btn');
  const retryBot4Btn = document.getElementById('retryBot4Btn');
  const retryBot5Btn = document.getElementById('retryBot5Btn');
  const relayHint = document.getElementById('relayHint');
  const pauseBtn = document.getElementById('pauseBtn');

  // 等待计时器相关元素
  const waitTimer = document.getElementById('waitTimer');
  const timerSeconds = document.getElementById('timerSeconds');
  const skipTimerBtn = document.getElementById('skipTimerBtn');

  // 任务历史记录相关元素
  const taskHistoryList = document.getElementById('taskHistoryList');
  const taskHistoryCount = document.getElementById('taskHistoryCount');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // 分类相关元素
  const classifiedSection = document.getElementById('classifiedSection');
  const toggleClassified = document.getElementById('toggleClassified');
  const classifiedContent = document.getElementById('classifiedContent');
  const categoryTabs = document.querySelectorAll('.category-tab');
  const categoryDisplay = document.getElementById('categoryDisplay');
  const saveClassifiedBtn = document.getElementById('saveClassifiedBtn');

  // 长宽比设置相关元素
  const aspectRatioSection = document.getElementById('aspectRatioSection');
  const aspectRatioInput = document.getElementById('aspectRatioInput');
  const saveAspectRatioBtn = document.getElementById('saveAspectRatioBtn');

  // 素材角色设置相关元素
  const materialSettingSection = document.getElementById('materialSettingSection');
  const materialSettingInput = document.getElementById('materialSettingInput');
  const saveMaterialSettingBtn = document.getElementById('saveMaterialSettingBtn');

  // Gemini URL 检测
  const GEMINI_URL_PATTERN = /^https:\/\/gemini\.google\.com/;
  const GEM_URL_PATTERN = /^https:\/\/gemini\.google\.com\/gem\//;

  // 当前标签页 ID
  let currentTabId = null;
  let statusCheckInterval = null;

  // 当前激活的分类标签页（场景/素材/角色）
  let currentCategoryTab = 'scenes';

  // 机器人接力状态
  const RELAY_STATE = {
    IDLE: 'idle',
    WAITING_FOR_GEM_SELECT: 'waiting_for_gem_select',
    SENDING_TO_GEM: 'sending_to_gem',
    WAITING_GEM_REPLY: 'waiting_gem_reply',
    // 画板大师相关状态
    WAITING_FOR_CANVAS_MASTER: 'waiting_for_canvas_master',
    SENDING_TO_CANVAS_MASTER: 'sending_to_canvas_master',
    WAITING_CANVAS_MASTER_REPLY: 'waiting_canvas_master_reply',
    CANVAS_MASTER_COMPLETED: 'canvas_master_completed',
    WAITING_FOR_BOT2: 'waiting_for_bot2',
    COMPLETED: 'completed',
    FAILED: 'failed',
    // 第二步状态
    STEP2_PART1_RUNNING: 'step2_part1_running',      // 场景生成中
    STEP2_PART1_COMPLETED: 'step2_part1_completed',  // 场景生成完成
    STEP2_PART2_RUNNING: 'step2_part2_running',      // 素材生成中
    STEP2_COMPLETED: 'step2_completed'               // 第二步全部完成
  };

  let currentRelayState = RELAY_STATE.IDLE;
  let savedPrevReply = null;  // 保存的上一个回复
  let savedGemReply = null;   // 新机器人的回复
  let lastParsedReplyHash = null;  // 上次解析的回复哈希，用于检测新回复
  let isPaused = false;  // 暂停状态
  let lastSyncedIsPaused = null;  // 上次同步的暂停状态，用于检测变化
  let lastClassifiedDataHash = null;  // 上次分类数据的哈希，用于检测数据变化

  // 计时器相关变量
  let waitTimerInterval = null;  // 计时器 interval ID
  let waitTimerRemaining = 0;    // 剩余秒数
  let waitTimerType = null;      // 计时器类型：'image_load' 或 'ai_generate'

  // ========== 0.9 计时器控制函数 ==========
  /**
   * 显示等待计时器
   * @param {number} seconds - 倒计时秒数
   * @param {string} type - 计时器类型：'image_load' 或 'ai_generate'
   */
  function showWaitTimer(seconds, type) {
    console.log('[Ge-extension Popup] 显示计时器:', seconds, '秒, 类型:', type);

    // 清除之前的计时器
    if (waitTimerInterval) {
      clearInterval(waitTimerInterval);
    }

    waitTimerRemaining = seconds;
    waitTimerType = type;
    timerSeconds.textContent = seconds;
    waitTimer.classList.remove('hidden');

    // 每秒更新
    waitTimerInterval = setInterval(() => {
      waitTimerRemaining--;
      timerSeconds.textContent = waitTimerRemaining;

      if (waitTimerRemaining <= 0) {
        hideWaitTimer();
        // 通知 content.js 计时器结束
        notifyTimerEnd();
      }
    }, 1000);
  }

  /**
   * 隐藏等待计时器
   */
  function hideWaitTimer() {
    console.log('[Ge-extension Popup] 隐藏计时器');
    if (waitTimerInterval) {
      clearInterval(waitTimerInterval);
      waitTimerInterval = null;
    }
    waitTimer.classList.add('hidden');
    waitTimerRemaining = 0;
    waitTimerType = null;
  }

  /**
   * 通知 content.js 计时器结束或被跳过
   */
  function notifyTimerEnd() {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, {
      action: 'timerEnded',
      type: waitTimerType
    }).catch(err => {
      console.log('[Ge-extension Popup] 通知计时器结束失败:', err);
    });
  }

  /**
   * 处理跳过按钮点击
   */
  function handleSkipTimer() {
    console.log('[Ge-extension Popup] 用户跳过计时器');
    hideWaitTimer();
    notifyTimerEnd();
  }

  // ========== 任务历史记录 ==========

  // 加载任务历史记录
  function loadTaskHistory() {
    chrome.storage.local.get(['geTaskHistory'], function(result) {
      const tasks = result.geTaskHistory || [];
      renderTaskHistory(tasks);
    });
  }

  // 创建新任务
  async function createNewTask() {
    const now = new Date();
    const taskId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const timestamp = now.getTime();

    const newTask = {
      taskId: taskId,
      timestamp: timestamp,
      bots: {
        bot1: { name: '机器人1', ran: false, content: '' },
        canvasMaster: { name: '画板大师', ran: false, content: '', images: [] },
        bot2: { name: '机器人2', ran: false, content: '' },
        bot3: { name: '机器人3', ran: false, sceneSetting: '', scenes: [] },
        bot4: { name: '机器人4', ran: false, materialSetting: '', materials: [] },
        bot5: { name: '机器人5', ran: false, character: '' }
      }
    };

    // 读取现有任务历史
    return new Promise((resolve) => {
      chrome.storage.local.get(['geTaskHistory'], function(result) {
        let tasks = result.geTaskHistory || [];
        // 添加新任务到开头
        tasks.unshift(newTask);
        // 最多保留10条
        if (tasks.length > 10) {
          tasks = tasks.slice(0, 10);
        }
        // 保存
        chrome.storage.local.set({ geTaskHistory: tasks, geCurrentTaskId: taskId }, function() {
          console.log('[Ge-extension Popup] 新任务已创建:', taskId);
          // 刷新显示
          renderTaskHistory(tasks);
          resolve(taskId);
        });
      });
    });
  }

  // 更新任务的机器人记录
  function updateTaskBotRecord(botKey, data) {
    chrome.storage.local.get(['geCurrentTaskId', 'geTaskHistory'], function(result) {
      const currentTaskId = result.geCurrentTaskId;
      let tasks = result.geTaskHistory || [];

      const taskIndex = tasks.findIndex(t => t.taskId === currentTaskId);
      if (taskIndex === -1) {
        console.warn('[Ge-extension Popup] 找不到当前任务:', currentTaskId);
        return;
      }

      // 更新机器人记录
      tasks[taskIndex].bots[botKey] = { ...tasks[taskIndex].bots[botKey], ...data, ran: true };

      // 保存
      chrome.storage.local.set({ geTaskHistory: tasks }, function() {
        console.log('[Ge-extension Popup] 任务记录已更新:', botKey);
        // 刷新显示
        renderTaskHistory(tasks);
      });
    });
  }

  // 删除任务
  function deleteTask(taskId) {
    chrome.storage.local.get(['geTaskHistory'], function(result) {
      let tasks = result.geTaskHistory || [];
      tasks = tasks.filter(t => t.taskId !== taskId);
      chrome.storage.local.set({ geTaskHistory: tasks }, function() {
        console.log('[Ge-extension Popup] 任务已删除:', taskId);
        renderTaskHistory(tasks);
      });
    });
  }

  // 清空所有任务
  function clearAllTasks() {
    if (confirm('确定要清空所有历史任务吗？')) {
      chrome.storage.local.set({ geTaskHistory: [] }, function() {
        console.log('[Ge-extension Popup] 所有任务已清空');
        renderTaskHistory([]);
      });
    }
  }

  // 重做任务
  async function handleRedo(taskId, botKey) {
    console.log('[Ge-extension Popup] handleRedo 被调用:', taskId, botKey);

    // 从 storage 读取任务数据
    const result = await chrome.storage.local.get(['geTaskHistory', 'geBotUrls']);
    const tasks = result.geTaskHistory || [];
    const botUrls = result.geBotUrls || {};
    const task = tasks.find(t => t.taskId === taskId);

    if (!task) {
      alert('找不到该任务');
      return;
    }

    const botData = task.bots[botKey];
    if (!botData || !botData.ran) {
      alert('该机器人未运行过，无法重做');
      return;
    }

    // 根据机器人类型执行不同的重做逻辑
    if (botKey === 'canvasMaster' || botKey === 'bot2') {
      // 画板大师和机器人2：跳转到机器人1页面，暂停等待用户确认
      const bot1Url = botUrls.bot1;
      if (!bot1Url) {
        alert('请先在"机器人配置"中设置机器人1的 URL');
        return;
      }

      // 获取机器人1的回复内容（如果有的话）
      const bot1Reply = task.bots.bot1?.content || '';

      // 设置重做配置
      const redoConfig = {
        action: 'redo',
        botKey: botKey,
        taskId: taskId,
        bot1Reply: bot1Reply,
        isPaused: true  // 暂停等待用户确认
      };

      // 同时初始化 geRelayConfig（重做 bot2 需要这个配置才能走通后续流程）
      const relayConfig = {
        state: RELAY_STATE.WAITING_FOR_GEM_SELECT,
        savedPrevReply: bot1Reply,
        savedGemReply: null,
        startUrl: bot1Url,
        startGemId: null,
        isPaused: true
      };

      await chrome.storage.local.set({
        geRedoConfig: redoConfig,
        geCurrentTaskId: taskId,
        geRelayConfig: relayConfig
      });
      console.log('[Ge-extension Popup] 已设置重做配置和当前任务ID:', redoConfig, taskId);

      // 跳转到机器人1页面
      chrome.tabs.create({ url: bot1Url }, (tab) => {
        console.log('[Ge-extension Popup] 已跳转到机器人1页面:', tab.id);
      });

    } else if (botKey === 'bot3') {
      // 机器人3：跳转到机器人3页面，自动运行
      const bot3Url = botUrls.bot3;
      if (!bot3Url) {
        alert('请先在"机器人配置"中设置机器人3的 URL');
        return;
      }

      // 设置重做配置
      const redoConfig = {
        action: 'redo',
        botKey: botKey,
        taskId: taskId,
        bot3Url: bot3Url,
        sceneSetting: botData.sceneSetting || '',
        scenes: botData.scenes || [],
        autoStart: true  // 自动开始运行
      };

      await chrome.storage.local.set({ geRedoConfig: redoConfig, geCurrentTaskId: taskId });
      console.log('[Ge-extension Popup] 已设置重做配置和当前任务ID:', redoConfig, taskId);

      // 跳转到机器人3页面
      chrome.tabs.create({ url: bot3Url }, (tab) => {
        console.log('[Ge-extension Popup] 已跳转到机器人3页面:', tab.id);
      });

    } else if (botKey === 'bot4') {
      // 机器人4：跳转到机器人4页面，自动运行
      const bot4Url = botUrls.bot4;
      if (!bot4Url) {
        alert('请先在"机器人配置"中设置机器人4的 URL');
        return;
      }

      const redoConfig = {
        action: 'redo',
        botKey: botKey,
        taskId: taskId,
        bot4Url: bot4Url,
        materialSetting: botData.materialSetting || '',
        materials: botData.materials || [],
        autoStart: true
      };

      await chrome.storage.local.set({ geRedoConfig: redoConfig, geCurrentTaskId: taskId });
      console.log('[Ge-extension Popup] 已设置重做配置和当前任务ID:', redoConfig, taskId);
      chrome.tabs.create({ url: bot4Url });

    } else if (botKey === 'bot5') {
      // 机器人5：跳转到机器人5页面，自动运行
      const bot5Url = botUrls.bot5;
      if (!bot5Url) {
        alert('请先在"机器人配置"中设置机器人5的 URL');
        return;
      }

      const redoConfig = {
        action: 'redo',
        botKey: botKey,
        taskId: taskId,
        bot5Url: bot5Url,
        character: botData.character || '',
        autoStart: true
      };

      await chrome.storage.local.set({ geRedoConfig: redoConfig, geCurrentTaskId: taskId });
      console.log('[Ge-extension Popup] 已设置重做配置和当前任务ID:', redoConfig, taskId);
      chrome.tabs.create({ url: bot5Url });
    }
  }

  // 渲染任务历史记录
  function renderTaskHistory(tasks) {
    taskHistoryCount.textContent = `(${tasks.length})`;

    if (!tasks || tasks.length === 0) {
      taskHistoryList.innerHTML = '<p class="empty-message">暂无历史任务</p>';
      return;
    }

    let html = '';
    tasks.forEach(task => {
      const date = new Date(task.timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      html += `
        <div class="task-item" data-task-id="${task.taskId}">
          <div class="task-header">
            <span class="task-time">${timeStr}</span>
            <button class="task-delete-btn" title="删除此任务">🗑️</button>
            <span class="task-toggle">▶</span>
          </div>
          <div class="task-content" style="display: none;">
            ${renderBotRecords(task.bots)}
          </div>
        </div>
      `;
    });

    taskHistoryList.innerHTML = html;

    // 绑定展开/折叠事件
    document.querySelectorAll('.task-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('task-delete-btn')) return;
        const item = header.closest('.task-item');
        const content = item.querySelector('.task-content');
        const toggle = item.querySelector('.task-toggle');

        if (content.style.display === 'none') {
          content.style.display = 'block';
          toggle.textContent = '▼';
          item.classList.add('expanded');
        } else {
          content.style.display = 'none';
          toggle.textContent = '▶';
          item.classList.remove('expanded');
        }
      });
    });

    // 绑定删除事件
    document.querySelectorAll('.task-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.task-item');
        const taskId = item.dataset.taskId;
        console.log('[Ge-extension Popup] 删除任务:', taskId);
        deleteTask(taskId);
      });
    });

    // 绑定重做事件
    document.querySelectorAll('.bot-redo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const botKey = btn.dataset.botKey;
        const taskId = btn.closest('.task-item').dataset.taskId;
        console.log('[Ge-extension Popup] 重做:', taskId, botKey);
        handleRedo(taskId, botKey);
      });
    });
  }

  // 渲染机器人记录
  function renderBotRecords(bots) {
    let html = '';
    const botOrder = ['canvasMaster', 'bot2', 'bot3', 'bot4', 'bot5'];
    const botIcons = {
      canvasMaster: '🎨',
      bot2: '📝',
      bot3: '🎬',
      bot4: '🎨',
      bot5: '👤'
    };

    botOrder.forEach(key => {
      const bot = bots[key];
      if (!bot) return;

      const statusClass = bot.ran ? 'completed' : 'not-run';
      const statusText = bot.ran ? '✓ 已完成' : '○ 未运行';
      const subInfo = bot.sceneCount ? ` (${bot.sceneCount}个场景)` :
                      bot.materialCount ? ` (${bot.materialCount}个素材)` : '';

      html += `
        <div class="bot-record">
          <div class="bot-info">
            <span class="bot-icon">${botIcons[key]}</span>
            <span class="bot-name">${bot.name}${subInfo}</span>
          </div>
          <span class="bot-status ${statusClass}">${statusText}</span>
          <button class="bot-redo-btn" data-bot-key="${key}" ${!bot.ran ? 'disabled' : ''}>重做</button>
        </div>
      `;
    });

    return html;
  }

  // 更新任务数量
  function updateTaskCount() {
    const count = document.querySelectorAll('.task-item').length;
    taskHistoryCount.textContent = `(${count})`;
    if (count === 0) {
      taskHistoryList.innerHTML = '<p class="empty-message">暂无历史任务</p>';
    }
  }

  // ========== 1. 初始化 ==========
  function init() {
    console.log('[Ge-extension Popup] ===== init函数被调用 =====');

    // 清除无效的残留数据（geStep2Config 没有 state 字段的情况）
    chrome.storage.local.get(['geStep2Config'], function(result) {
      const step2Config = result.geStep2Config;
      // 如果存在 geStep2Config 但没有 state 字段，说明是无效数据，清除它
      if (step2Config && !step2Config.state) {
        console.log('[Ge-extension Popup] 检测到无效的 geStep2Config（缺少 state 字段），清除中...');
        chrome.storage.local.remove(['geStep2Config'], function() {
          console.log('[Ge-extension Popup] 已清除无效的 geStep2Config');
        });
      }
    });

    // 绑定按钮事件
    collectBtn.addEventListener('click', handleCollectClick);
    thinkingModeBtn.addEventListener('click', handleThinkingModeClick);
    clearBtn.addEventListener('click', handleClearClick);

    // 绑定机器人配置相关事件
    toggleConfigBtn.addEventListener('click', () => toggleSection(botsConfigPanel, toggleConfigBtn));
    saveBotUrlsBtn.addEventListener('click', handleSaveBotUrls);

    // 绑定机器人接力按钮事件
    console.log('[Ge-extension Popup] startStep1Btn:', startStep1Btn);
    console.log('[Ge-extension Popup] handleStartStep1:', typeof handleStartStep1);
    startStep1Btn.addEventListener('click', handleStartStep1);
    startStep2Btn.addEventListener('click', handleStartStep2);
    stopBtn.addEventListener('click', handleStop);
    retryBtn.addEventListener('click', handleRetry);
    exportReplyBtn.addEventListener('click', handleExportReply);
    retryBot3Btn.addEventListener('click', () => handleRetryBot(3));
    retryBot4Btn.addEventListener('click', () => handleRetryBot(4));
    retryBot5Btn.addEventListener('click', () => handleRetryBot(5));
    pauseBtn.addEventListener('click', handlePauseToggle);
    skipTimerBtn.addEventListener('click', handleSkipTimer);
    togglePrevReply.addEventListener('click', () => toggleSection(prevReplyContent, togglePrevReply));
    savePrevReplyBtn.addEventListener('click', handleSavePrevReply);
    toggleNewReply.addEventListener('click', () => toggleSection(newReplyContent, toggleNewReply));

    // 绑定分类相关事件
    toggleClassified.addEventListener('click', () => toggleSection(classifiedContent, toggleClassified));
    categoryTabs.forEach(tab => {
      tab.addEventListener('click', () => handleCategoryTabClick(tab));
    });
    saveClassifiedBtn.addEventListener('click', handleSaveClassified);

    // 绑定长宽比设置保存按钮
    saveAspectRatioBtn.addEventListener('click', handleSaveAspectRatio);

    // 绑定素材角色设置保存按钮
    saveMaterialSettingBtn.addEventListener('click', handleSaveMaterialSetting);

    // 加载已保存的数据
    loadSavedData();

    // 加载暂停状态
    chrome.storage.local.get(['geRelayPaused'], function(result) {
      if (result.geRelayPaused !== undefined) {
        isPaused = result.geRelayPaused;
        if (isPaused) {
          pauseBtn.classList.add('paused');
          pauseBtn.querySelector('.pause-icon').textContent = '▶';
        }
      }
    });

    // 加载已保存的机器人 URL
    loadBotUrls();

    // 加载 Thinking 模式状态（默认开启）
    chrome.storage.local.get(['geThinkingModeEnabled'], function(result) {
      const isEnabled = result.geThinkingModeEnabled !== false; // 默认为 true
      if (isEnabled) {
        thinkingModeBtn.classList.add('active');
      }
      // 同步到 storage（确保默认值被保存）
      chrome.storage.local.set({ geThinkingModeEnabled: isEnabled });
    });

    // 获取当前页面信息
    getCurrentPageInfo();

    // 开始检查机器人状态
    startRelayStatusCheck();

    // 加载任务历史记录
    loadTaskHistory();

    // 绑定清空历史按钮
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', clearAllTasks);
    }

    // 监听来自 content.js 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'showWaitTimer') {
        showWaitTimer(message.seconds, message.type);
        sendResponse({ success: true });
      } else if (message.action === 'hideWaitTimer') {
        hideWaitTimer();
        sendResponse({ success: true });
      }
      return true; // 保持消息通道开放
    });
  }

  // ========== 2. 从 chrome.storage.local 读取数据 ==========
  function loadSavedData() {
    chrome.storage.local.get(['geExtensionData'], function(result) {
      const data = result.geExtensionData || [];

      // 更新记录数量显示
      recordCount.textContent = `(${data.length})`;

      // 渲染数据列表
      renderSavedList(data);
    });
  }

  // 加载已保存的机器人 URL
  function loadBotUrls() {
    chrome.storage.local.get(['geBotUrls'], function(result) {
      const urls = result.geBotUrls || {};

      botUrl1.value = urls.bot1 || '';
      botUrl2.value = urls.bot2 || '';
      botUrl3.value = urls.bot3 || '';
      botUrl4.value = urls.bot4 || '';
      botUrl5.value = urls.bot5 || '';
      canvasMasterUrl.value = urls.canvasMaster || '';

      // 加载勾选状态（默认全部勾选）
      bot1Enabled.checked = urls.bot1Enabled !== false;
      bot2Enabled.checked = urls.bot2Enabled !== false;
      bot3Enabled.checked = urls.bot3Enabled !== false;
      bot4Enabled.checked = urls.bot4Enabled !== false;
      bot5Enabled.checked = urls.bot5Enabled !== false;
      canvasMasterEnabled.checked = urls.canvasMasterEnabled !== false;

      console.log('[Ge-extension Popup] 已加载机器人 URL 配置');
    });
  }

  // 保存机器人 URL
  function handleSaveBotUrls() {
    const urls = {
      bot1: botUrl1.value.trim(),
      bot2: botUrl2.value.trim(),
      bot3: botUrl3.value.trim(),
      bot4: botUrl4.value.trim(),
      bot5: botUrl5.value.trim(),
      canvasMaster: canvasMasterUrl.value.trim(),
      // 保存勾选状态
      bot1Enabled: bot1Enabled.checked,
      bot2Enabled: bot2Enabled.checked,
      bot3Enabled: bot3Enabled.checked,
      bot4Enabled: bot4Enabled.checked,
      bot5Enabled: bot5Enabled.checked,
      canvasMasterEnabled: canvasMasterEnabled.checked
    };

    chrome.storage.local.set({ geBotUrls: urls }, function() {
      console.log('[Ge-extension Popup] 机器人 URL 已保存:', urls);

      // 显示保存成功提示
      saveBotUrlsBtn.textContent = '✓ 已保存';
      saveBotUrlsBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

      setTimeout(() => {
        saveBotUrlsBtn.innerHTML = '<span class="btn-icon">💾</span> 保存配置';
        saveBotUrlsBtn.style.background = '';
      }, 1500);
    });
  }

  // ========== 3. 渲染已保存内容列表 ==========
  function renderSavedList(data) {
    // 清空列表
    savedList.innerHTML = '';

    // 如果没有数据，显示提示信息
    if (data.length === 0) {
      savedList.innerHTML = `
        <p class="empty-message">暂无保存的内容</p>
        <p class="hint">点击「采集当前页面」按钮来保存页面内容</p>
      `;
      return;
    }

    // 遍历数据并渲染
    data.forEach((item, index) => {
      const itemElement = createSavedItem(item, index);
      savedList.appendChild(itemElement);
    });
  }

  // ========== 4. 创建单条保存项的 DOM 元素 ==========
  function createSavedItem(item, index) {
    const div = document.createElement('div');
    div.className = 'saved-item';

    // 格式化时间
    const time = formatTime(item.timestamp);

    // 处理点击目标按钮的结果
    const targetStatus = item.targetButtonClicked?.clicked
      ? `<span class="success">✓ 已点击: ${item.targetButtonClicked.selector}</span>`
      : '<span class="neutral">○ 未找到目标按钮</span>';

    div.innerHTML = `
      <div class="item-header">
        <span class="item-number">#${index + 1}</span>
        <span class="item-time">${time}</span>
      </div>
      <div class="item-title">${escapeHtml(item.title || '无标题')}</div>
      <div class="item-url">${escapeHtml(shortenUrl(item.url))}</div>
      <div class="item-status">${targetStatus}</div>
      <details class="item-details">
        <summary>查看内容</summary>
        <div class="item-text">${escapeHtml(item.text || '无内容')}</div>
      </details>
    `;

    return div;
  }

  // ========== 5. 处理"采集当前页面"按钮点击 ==========
  async function handleCollectClick() {
    if (!currentTabId) {
      alert('无法获取当前页面信息，请刷新页面后重试');
      return;
    }

    try {
      // 发送消息到 content script 采集页面内容
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'collectPageContent' });

      if (response && response.success) {
        console.log('[Ge-extension Popup] 采集成功:', response.data);

        // 刷新列表显示
        loadSavedData();

        // 按钮反馈动画
        collectBtn.classList.add('btn-clicked');
        collectBtn.innerHTML = '<span class="btn-icon">✓</span> 采集成功';
        setTimeout(() => {
          collectBtn.classList.remove('btn-clicked');
          collectBtn.innerHTML = '<span class="btn-icon">📋</span> 采集当前页面';
        }, 2000);
      } else {
        throw new Error('采集失败');
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 采集失败:', error);

      // 按钮错误反馈
      collectBtn.classList.add('btn-error');
      collectBtn.innerHTML = '<span class="btn-icon">✗</span> 采集失败';
      setTimeout(() => {
        collectBtn.classList.remove('btn-error');
        collectBtn.innerHTML = '<span class="btn-icon">📋</span> 采集当前页面';
      }, 2000);

      alert('采集失败，请确保已刷新页面');
    }
  }

  // ========== 6. 处理"Thinking模式"按钮点击 ==========
  async function handleThinkingModeClick() {
    // 切换按钮状态
    thinkingModeBtn.classList.toggle('active');
    const isEnabled = thinkingModeBtn.classList.contains('active');

    // 保存状态到 storage
    await chrome.storage.local.set({ geThinkingModeEnabled: isEnabled });

    console.log('[Ge-extension Popup] Thinking模式:', isEnabled ? '已开启' : '已关闭');
  }

  // ========== 7. 处理"清空所有数据"按钮点击 ==========
  function handleClearClick() {
    // 确认对话框
    const confirmed = confirm('确定要清空所有已保存的数据吗？此操作不可恢复。');

    if (!confirmed) {
      return;
    }

    // 清空 storage 中的数据
    chrome.storage.local.remove(['geExtensionData'], function() {
      if (chrome.runtime.lastError) {
        console.error('[Ge-extension Popup] 清空失败:', chrome.runtime.lastError);
        alert('清空失败，请重试');
      } else {
        console.log('[Ge-extension Popup] 数据已清空');

        // 更新 UI
        recordCount.textContent = '(0)';
        savedList.innerHTML = `
          <p class="empty-message">暂无保存的内容</p>
          <p class="hint">点击「采集当前页面」按钮来保存页面内容</p>
        `;

        // 按钮反馈
        clearBtn.classList.add('btn-clicked');
        setTimeout(() => {
          clearBtn.classList.remove('btn-clicked');
        }, 200);
      }
    });
  }

  // ========== 8. 获取当前活动页面的信息 ==========
  function getCurrentPageInfo() {
    // 查询当前活动的标签页
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length > 0) {
        const currentTab = tabs[0];
        currentTabId = currentTab.id;

        // 检查是否是 Chrome 内置页面
        if (currentTab.url.startsWith('chrome://') ||
            currentTab.url.startsWith('chrome-extension://') ||
            currentTab.url.startsWith('edge://') ||
            currentTab.url.startsWith('about:')) {

          currentPageInfo.innerHTML = `
            <p class="info-placeholder">当前页面不支持扩展功能</p>
            <p class="info-url">${escapeHtml(currentTab.url)}</p>
          `;
          updateGeminiSection(null, false);
          return;
        }

        // 显示页面信息
        currentPageInfo.innerHTML = `
          <p class="info-title">${escapeHtml(currentTab.title || '未知页面')}</p>
          <p class="info-url">${escapeHtml(shortenUrl(currentTab.url))}</p>
        `;

        // 检查是否是 Gemini 页面
        const isGeminiPage = GEMINI_URL_PATTERN.test(currentTab.url);
        const isGemPage = GEM_URL_PATTERN.test(currentTab.url);
        updateGeminiSection(currentTab, isGeminiPage, isGemPage);

        // 尝试向 content script 发送消息获取更多信息
        try {
          chrome.tabs.sendMessage(currentTab.id, { action: 'getPageInfo' }, function() {
            // 忽略响应，只是检查连接
          });
        } catch (error) {
          console.log('[Ge-extension Popup] 无法与页面通信');
        }
      }
    });
  }

  // ========== 9. 更新 Gemini 区域 ==========
  function updateGeminiSection(tab, isGeminiPage, isGemPage) {
    if (isGeminiPage && tab) {
      // 是 Gemini 页面
      const urlInfo = isGemPage ? '（Gem 机器人页面）' : '';
      geminiPageInfo.innerHTML = `
        <p class="info-success">✓ 已连接到 Gemini ${urlInfo}</p>
        <p class="info-url">${escapeHtml(shortenUrl(tab.url))}</p>
      `;
      startStep1Btn.disabled = false;
    } else {
      // 不是 Gemini 页面
      geminiPageInfo.innerHTML = `
        <p class="info-placeholder">请在 Gemini 页面使用此功能</p>
        <p class="info-url">访问: <a href="https://gemini.google.com" target="_blank">gemini.google.com</a></p>
      `;
      startStep1Btn.disabled = true;
    }
  }

  // ========== 10. 开始第一步 ==========
  async function handleStartStep1() {
    console.log('[Ge-extension Popup] ===== 开始第一步被调用 =====');
    console.log('[Ge-extension Popup] currentTabId:', currentTabId);

    if (!currentTabId) {
      console.error('[Ge-extension Popup] currentTabId为空，无法发送消息');
      return;
    }

    try {
      // 清除旧配置（避免与新任务冲突）
      await chrome.storage.local.remove(['geRedoConfig', 'geStep2Config']);
      console.log('[Ge-extension Popup] 已清除旧的重做配置');

      // 创建新任务
      const taskId = await createNewTask();
      console.log('[Ge-extension Popup] 新任务ID:', taskId);

      // 读取机器人配置（包括勾选状态）
      const botUrlsResult = await chrome.storage.local.get(['geBotUrls']);
      const botUrls = botUrlsResult.geBotUrls || {};
      const isBot1Enabled = botUrls.bot1Enabled !== false; // 默认启用
      const isCanvasMasterEnabled = botUrls.canvasMasterEnabled !== false;
      const isBot2Enabled = botUrls.bot2Enabled !== false;

      // 如果Bot1、画板大师、Bot2都不勾选，直接跳过第一步，进入分类编辑状态
      if (!isBot1Enabled && !isCanvasMasterEnabled && !isBot2Enabled) {
        console.log('[Ge-extension Popup] Bot1、画板大师、Bot2都未勾选，直接跳过第一步');

        // 清除旧的修改记录
        await chrome.storage.local.remove(['gePrevReplyModified']);

        // 设置 relayConfig 为完成状态
        const relayConfig = {
          state: RELAY_STATE.COMPLETED,
          savedPrevReply: '',
          savedGemReply: null,
          startUrl: null,
          startGemId: null,
          isPaused: false
        };
        await chrome.storage.local.set({ geRelayConfig: relayConfig });

        // 创建空的 geStep2Config，让用户可以手动添加内容
        const emptyStep2Config = {
          state: 'waiting_start',
          scenes: [],
          materials: [],
          character: [],
          sceneSetting: '',
          materialSetting: '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。'
        };
        await chrome.storage.local.set({ geStep2Config: emptyStep2Config });

        // 初始化本地 classifiedData
        classifiedData = {
          scenes: [],
          materials: [],
          character: [],
          sceneSetting: '',
          materialSetting: '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。'
        };

        // 更新本地状态
        currentRelayState = RELAY_STATE.COMPLETED;
        isPaused = false;
        await chrome.storage.local.set({ geRelayPaused: false });

        // 更新 UI
        updateRelayUI();

        // 隐藏机器人回复区域，直接显示分类编辑区域
        prevReplySection.classList.add('hidden');
        newReplySection.classList.add('hidden');
        classifiedSection.classList.remove('hidden');
        classifiedContent.classList.remove('hidden');
        toggleClassified.textContent = '收起';

        // 渲染空的分类内容，让用户可以添加场景/素材/角色
        displayCategoryContent(currentCategoryTab);

        // 显示提示
        relayHint.textContent = '请直接编辑场景/素材/角色内容，然后点击"开始第二步"';
        console.log('[Ge-extension Popup] 已跳过第一步，直接进入分类编辑状态');
        return;
      }

      if (!isBot1Enabled) {
        // 只有机器人1未勾选，但画板大师或机器人2有勾选，需要手动输入后发送
        console.log('[Ge-extension Popup] 机器人1未勾选，跳过获取，等待手动输入');

        // 清除旧的修改记录
        await chrome.storage.local.remove(['gePrevReplyModified']);

        // 初始化 relayConfig（空回复）
        const relayConfig = {
          state: RELAY_STATE.WAITING_FOR_GEM_SELECT,
          savedPrevReply: '',
          savedGemReply: null,
          startUrl: null,
          startGemId: null,
          isPaused: true
        };
        await chrome.storage.local.set({ geRelayConfig: relayConfig });

        // 更新本地状态
        currentRelayState = RELAY_STATE.WAITING_FOR_GEM_SELECT;
        savedPrevReply = '';
        isPaused = true;
        await chrome.storage.local.set({ geRelayPaused: true });

        // 更新 UI - 显示空的输入框等待用户填写
        updateRelayUI();
        prevReplyText.value = '';
        prevReplySection.classList.remove('hidden');
        prevReplyContent.classList.remove('hidden');
        togglePrevReply.textContent = '收起';

        // 根据画板大师和机器人2的状态显示不同的提示
        if (!isCanvasMasterEnabled) {
          relayHint.textContent = '请手动输入要发送给机器人2的内容，保存后点击继续';
        } else {
          relayHint.textContent = '请手动输入要发送给画板大师的内容，保存后点击继续';
        }

        console.log('[Ge-extension Popup] 等待用户手动输入机器人1回复');
        return;
      }

      // 机器人1已勾选，正常获取回复
      console.log('[Ge-extension Popup] 准备发送startRelayStep1消息到tab:', currentTabId);
      // 发送消息到 content.js 开始接力（获取机器人1回复）
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'startRelayStep1' });
      console.log('[Ge-extension Popup] 收到响应:', response);

      if (response && response.success) {
        savedPrevReply = response.data;
        // 设置状态为等待用户继续
        currentRelayState = RELAY_STATE.WAITING_FOR_GEM_SELECT;

        // 自动暂停，等待用户手动启动
        isPaused = true;
        await chrome.storage.local.set({ geRelayPaused: true });

        // 更新 UI
        updateRelayUI();
        showPrevReply(savedPrevReply);
        relayHint.textContent = '已获取机器人1回复，点击继续按钮开始发送给机器人2';

        console.log('[Ge-extension Popup] 已获取机器人1回复，等待用户点击继续');
      } else {
        console.error('[Ge-extension Popup] 响应失败，response:', response);
        const errorMsg = response?.error || '无法获取当前页面的回复，请确保页面有对话内容';
        console.error('[Ge-extension Popup]', errorMsg);
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 启动失败:', error);
    }
  }

  // ========== 10.1 开始第二步 ==========
  async function handleStartStep2() {
    console.log('[Ge-extension Popup] ===== 开始第二步被调用 =====');

    if (!currentTabId) {
      alert('无法获取当前页面信息');
      return;
    }

    // 读取机器人启用状态
    const botUrlsResult = await chrome.storage.local.get(['geBotUrls']);
    const botUrls = botUrlsResult.geBotUrls || {};
    // 默认启用：如果值不是显式的 false，则认为是启用
    const bot3Enabled = botUrls.bot3Enabled !== false;
    const bot4Enabled = botUrls.bot4Enabled !== false;
    const bot5Enabled = botUrls.bot5Enabled !== false;

    console.log('[Ge-extension Popup] 机器人启用状态 - Bot3:', bot3Enabled, ', Bot4:', bot4Enabled, ', Bot5:', bot5Enabled);
    console.log('[Ge-extension Popup] 原始值 - bot3Enabled:', botUrls.bot3Enabled, ', bot4Enabled:', botUrls.bot4Enabled, ', bot5Enabled:', botUrls.bot5Enabled);

    // 检查是否有可处理的数据（根据启用的机器人）
    const hasScenes = classifiedData.scenes.length > 0;
    const hasMaterials = classifiedData.materials.length > 0;
    const hasCharacter = classifiedData.character && classifiedData.character.length > 0;

    const hasAnyData = (bot3Enabled && hasScenes) ||
                       (bot4Enabled && hasMaterials) ||
                       (bot5Enabled && hasCharacter);

    if (!hasAnyData) {
      alert('没有可处理的数据。\n\n请确保已启用对应的机器人，并且有场景/素材/角色数据。');
      return;
    }

    console.log('[Ge-extension Popup] 场景数量:', classifiedData.scenes.length);
    console.log('[Ge-extension Popup] 素材数量:', classifiedData.materials.length);
    console.log('[Ge-extension Popup] 角色:', classifiedData.character ? '有' : '无');

    // 定义默认的一致性后缀
    const DEFAULT_CONSISTENCY_SUFFIX = '\n画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。';

    // 从 classifiedData 读取场景设置，添加一致性后缀（如果尚未包含）
    const extractedSceneSetting = classifiedData.sceneSetting || aspectRatioInput.value.trim();
    const sceneSetting = extractedSceneSetting.endsWith(DEFAULT_CONSISTENCY_SUFFIX.trim())
      ? extractedSceneSetting
      : extractedSceneSetting + DEFAULT_CONSISTENCY_SUFFIX;

    // 素材角色设置使用默认值（已包含一致性要求）
    const DEFAULT_MATERIAL_SETTING = '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。';
    const materialSetting = classifiedData.materialSetting || materialSettingInput.value.trim() || DEFAULT_MATERIAL_SETTING;

    console.log('[Ge-extension Popup] 场景设置:', sceneSetting);
    console.log('[Ge-extension Popup] 素材角色设置:', materialSetting);

    try {
      // 从 botUrls（已在前面读取）获取 URL
      const bot3Url = botUrls.bot3;
      const bot4Url = botUrls.bot4;
      const bot5Url = botUrls.bot5;

      // 检查必填的 URL（根据启用状态）
      if (bot3Enabled && !bot3Url) {
        alert('机器人 3 已启用但未设置 URL，请在"机器人配置"中设置');
        return;
      }
      if (bot4Enabled && !bot4Url) {
        alert('机器人 4 已启用但未设置 URL，请在"机器人配置"中设置');
        return;
      }
      if (bot5Enabled && !bot5Url) {
        alert('机器人 5 已启用但未设置 URL，请在"机器人配置"中设置');
        return;
      }

      console.log('[Ge-extension Popup] 机器人 3 URL:', bot3Url);
      console.log('[Ge-extension Popup] 机器人 4 URL:', bot4Url);
      console.log('[Ge-extension Popup] 机器人 5 URL:', bot5Url);

      // 立刻更新 UI 显示"正在跳转到机器人 3"
      progressFill.style.width = '0%';
      relayStatus.innerHTML = `
        <span class="status-icon">●</span>
        <span class="status-text">正在跳转到机器人 3</span>
      `;
      relayStatus.className = 'relay-status running';
      relayHint.textContent = '正在跳转到机器人 3';

      // 更新按钮显示
      pauseBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      startStep1Btn.classList.add('hidden');
      startStep2Btn.classList.add('hidden');
      retryBtn.classList.add('hidden');
      exportReplyBtn.classList.add('hidden');

      // 隐藏回复相关区域
      prevReplySection.classList.add('hidden');
      newReplySection.classList.add('hidden');
      classifiedSection.classList.add('hidden');

      // 重置暂停状态（第二步开始时默认不暂停）
      isPaused = false;
      await chrome.storage.local.set({ geRelayPaused: false });

      // 保存第二步配置到 storage（包含场景设置、素材角色设置和机器人启用状态）
      await chrome.storage.local.set({
        geStep2Config: {
          state: 'waiting_start',
          bot3Url: bot3Url,
          bot4Url: bot4Url,
          bot5Url: bot5Url,
          bot3Enabled: bot3Enabled,
          bot4Enabled: bot4Enabled,
          bot5Enabled: bot5Enabled,
          scenes: classifiedData.scenes,
          materials: classifiedData.materials,
          character: classifiedData.character,
          currentSceneIndex: 0,
          currentMaterialIndex: 0,
          isPaused: false,
          sceneSetting: sceneSetting,
          materialSetting: materialSetting
        }
      });

      console.log('[Ge-extension Popup] 第二步配置已保存');
      console.log('[Ge-extension Popup] Bot3 启用:', bot3Enabled, ', Bot4 启用:', bot4Enabled, ', Bot5 启用:', bot5Enabled);

      // 发送消息到 content.js 开始第二步
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'startRelayStep2' });

      if (response && response.success) {
        console.log('[Ge-extension Popup] 第二步已启动');
        // 根据启用状态生成提示信息
        let taskList = [];
        if (bot3Enabled) taskList.push('场景数量: ' + classifiedData.scenes.length);
        if (bot4Enabled) taskList.push('素材数量: ' + classifiedData.materials.length);
        if (bot5Enabled && classifiedData.character && classifiedData.character.length > 0) {
          taskList.push('角色数量: ' + classifiedData.character.length);
        }
        alert('第二步已启动，将自动执行以下任务：\n\n' + taskList.join('\n'));
      } else {
        alert('启动第二步失败: ' + (response?.error || '未知错误'));
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 启动第二步失败:', error);
      alert('启动第二步失败: ' + error.message);
    }
  }

  // ========== 11. 停止接力 ==========
  async function handleStop() {
    try {
      // 清除 storage 中的配置（包括重做配置）
      await chrome.storage.local.remove(['geRelayConfig', 'geStep2Config', 'geRedoConfig']);

      console.log('[Ge-extension Popup] 已停止，进程配置已清除');

      // 重置本地状态
      currentRelayState = RELAY_STATE.IDLE;
      isPaused = false;
      savedPrevReply = null;
      savedGemReply = null;
      lastParsedReplyHash = null;
      lastClassifiedDataHash = null;
      classifiedData = { scenes: [], materials: [], character: [], sceneSetting: '', materialSetting: '' };

      // 更新 UI
      updateRelayUI();

      // 隐藏回复区域
      hidePrevReply();
      hideNewReply();

      // 隐藏分类区域
      classifiedSection.classList.add('hidden');
      aspectRatioSection.classList.add('hidden');
      materialSettingSection.classList.add('hidden');

      // 隐藏倒计时和跳过按钮
      hideWaitTimer();

      // 恢复初始提示
      relayHint.textContent = '点击"开始第一步"后，将自动跳转到机器人 2';

    } catch (error) {
      console.error('[Ge-extension Popup] 停止失败:', error);
    }
  }

  // ========== 11.01 暂停/继续接力 ==========
  async function handlePauseToggle() {
    isPaused = !isPaused;

    // 更新按钮样式
    if (isPaused) {
      pauseBtn.classList.add('paused');
      pauseBtn.querySelector('.pause-icon').textContent = '▶';
      relayHint.textContent = '已暂停，点击继续恢复执行';
    } else {
      pauseBtn.classList.remove('paused');
      pauseBtn.querySelector('.pause-icon').textContent = '⏸';
      relayHint.textContent = '继续执行...';

      // 检查是否是第二步状态
      const isStep2Running = currentRelayState === RELAY_STATE.STEP2_PART1_RUNNING ||
                             currentRelayState === RELAY_STATE.STEP2_PART2_RUNNING;

      if (isStep2Running) {
        // 第二步继续逻辑
        console.log('[Ge-extension Popup] 第二步继续执行');

        // 发送 resumeRelay 消息给 content.js，让它处理智能恢复
        if (currentTabId) {
          try {
            console.log('[Ge-extension Popup] 发送 resumeRelay 消息到 content.js');
            await chrome.tabs.sendMessage(currentTabId, { action: 'resumeRelay' });
          } catch (error) {
            console.error('[Ge-extension Popup] 发送 resumeRelay 消息失败:', error);
          }
        }
      } else if (currentRelayState === RELAY_STATE.WAITING_FOR_GEM_SELECT) {
        // 如果是等待跳转到机器人的状态，检查画板大师是否启用
        // 清除重做配置，避免 checkRelayStatus 反复被 redo 检测拦截
        await chrome.storage.local.remove(['geRedoConfig']);
        console.log('[Ge-extension Popup] 已清除重做配置，开始正常流程');

        const result = await chrome.storage.local.get(['geBotUrls', 'geRelayConfig']);
        const botUrls = result.geBotUrls || {};
        const isCanvasMasterEnabled = botUrls.canvasMasterEnabled !== false; // 默认启用

        // 检查用户是否已输入/保存内容
        const relayConfig = result.geRelayConfig || {};
        const savedReply = relayConfig.savedPrevReply || prevReplyText.value;
        if (!savedReply || savedReply.trim() === '') {
          alert('请先输入要发送的内容并点击保存');
          isPaused = true;
          pauseBtn.classList.add('paused');
          pauseBtn.querySelector('.pause-icon').textContent = '▶';
          await chrome.storage.local.set({ geRelayPaused: true });
          return;
        }

        // 更新 relayConfig
        relayConfig.savedPrevReply = savedReply;
        relayConfig.isPaused = false;

        if (isCanvasMasterEnabled) {
          // 画板大师启用，跳转到画板大师
          const canvasMasterUrl = botUrls.canvasMaster;
          if (!canvasMasterUrl) {
            alert('请先在"机器人配置"中设置画板大师的 URL');
            isPaused = true;
            pauseBtn.classList.add('paused');
            pauseBtn.querySelector('.pause-icon').textContent = '▶';
            await chrome.storage.local.set({ geRelayPaused: true });
            return;
          }

          // 设置状态为发送到画板大师（这样新页面加载后会自动发送）
          relayConfig.state = RELAY_STATE.SENDING_TO_CANVAS_MASTER;
          await chrome.storage.local.set({ geRelayConfig: relayConfig });
          console.log('[Ge-extension Popup] 准备跳转到画板大师');

          try {
            const newTab = await chrome.tabs.create({ url: canvasMasterUrl });
            console.log('[Ge-extension Popup] 画板大师标签页已创建:', newTab);
          } catch (tabError) {
            console.error('[Ge-extension Popup] 创建标签页失败:', tabError);
            alert('创建标签页失败: ' + tabError.message);
            isPaused = true;
            pauseBtn.classList.add('paused');
            pauseBtn.querySelector('.pause-icon').textContent = '▶';
            await chrome.storage.local.set({ geRelayPaused: true });
            return;
          }
        } else {
          // 画板大师未启用，检查机器人2是否启用
          const isBot2Enabled = botUrls.bot2Enabled !== false; // 默认启用

          if (!isBot2Enabled) {
            // 机器人2也未启用，直接进入"第一步完成"状态
            console.log('[Ge-extension Popup] 画板大师和机器人2都未启用，直接进入第一步完成状态');

            // 设置状态为完成
            relayConfig.state = RELAY_STATE.COMPLETED;
            relayConfig.isPaused = false;
            await chrome.storage.local.set({ geRelayConfig: relayConfig });

            // 创建空的 geStep2Config，让用户可以手动添加内容
            const emptyStep2Config = {
              state: 'waiting_start',
              scenes: [],
              materials: [],
              character: [],
              sceneSetting: '',
              materialSetting: '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。'
            };
            await chrome.storage.local.set({ geStep2Config: emptyStep2Config });

            // 初始化本地 classifiedData
            classifiedData = {
              scenes: [],
              materials: [],
              character: [],
              sceneSetting: '',
              materialSetting: '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。'
            };

            // 更新本地状态
            currentRelayState = RELAY_STATE.COMPLETED;
            isPaused = false;
            pauseBtn.classList.remove('paused');
            pauseBtn.querySelector('.pause-icon').textContent = '⏸';
            await chrome.storage.local.set({ geRelayPaused: false });

            // 更新 UI 显示分类区域
            updateRelayUI();

            // 显示分类区域和开始第二步按钮
            classifiedSection.classList.remove('hidden');
            classifiedContent.classList.remove('hidden');
            toggleClassified.textContent = '收起';

            // 渲染空的分类内容，让用户可以添加场景/素材/角色
            displayCategoryContent(currentCategoryTab);

            // 显示成功提示
            relayHint.textContent = '第一步已完成（手动模式），请编辑分类内容后点击"开始第二步"';
            console.log('[Ge-extension Popup] 已进入第一步完成状态');
          } else {
            // 机器人2已启用，跳转到机器人2
            const bot2Url = botUrls.bot2;
            if (!bot2Url) {
              alert('请先在"机器人配置"中设置机器人 2 的 URL');
              isPaused = true;
              pauseBtn.classList.add('paused');
              pauseBtn.querySelector('.pause-icon').textContent = '▶';
              await chrome.storage.local.set({ geRelayPaused: true });
              return;
            }

            // 设置状态为发送到机器人2
            relayConfig.state = RELAY_STATE.SENDING_TO_GEM;
            await chrome.storage.local.set({ geRelayConfig: relayConfig });
            console.log('[Ge-extension Popup] 准备跳转到机器人2');

            try {
              const newTab = await chrome.tabs.create({ url: bot2Url });
              console.log('[Ge-extension Popup] 机器人2标签页已创建:', newTab);
            } catch (tabError) {
              console.error('[Ge-extension Popup] 创建标签页失败:', tabError);
              alert('创建标签页失败: ' + tabError.message);
              isPaused = true;
              pauseBtn.classList.add('paused');
              pauseBtn.querySelector('.pause-icon').textContent = '▶';
              await chrome.storage.local.set({ geRelayPaused: true });
              return;
            }
          }
        }
      } else {
        // 其他状态发送继续消息到 content.js
        if (currentTabId) {
          try {
            await chrome.tabs.sendMessage(currentTabId, { action: 'resumeRelay' });
          } catch (error) {
            console.error('[Ge-extension Popup] 发送继续消息失败:', error);
          }
        }
      }
    }

    // 检查是否是第二步状态，保存到对应的 storage
    const isStep2Running = currentRelayState === RELAY_STATE.STEP2_PART1_RUNNING ||
                           currentRelayState === RELAY_STATE.STEP2_PART2_RUNNING;

    if (isStep2Running) {
      const result = await chrome.storage.local.get(['geStep2Config']);
      const step2Config = result.geStep2Config;
      if (step2Config) {
        step2Config.isPaused = isPaused;
        await chrome.storage.local.set({ geStep2Config: step2Config });
      }
    } else {
      await chrome.storage.local.set({ geRelayPaused: isPaused });
    }

    console.log('[Ge-extension Popup] 暂停状态:', isPaused);
  }

  // ========== 11.1 导出原始回复 ==========
  async function handleExportReply() {
    try {
      // 从 storage 获取最后一次回复
      const result = await chrome.storage.local.get(['geLastReply']);
      const lastReply = result.geLastReply;

      if (!lastReply || !lastReply.content) {
        alert('没有找到回复内容');
        return;
      }

      // 创建 Blob
      const blob = new Blob([lastReply.content], { type: 'text/plain;charset=utf-8' });

      // 创建下载 URL
      const url = URL.createObjectURL(blob);

      // 下载文件
      const a = document.createElement('a');
      a.href = url;
      a.download = lastReply.filename || `gemini-reply-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 释放 URL
      URL.revokeObjectURL(url);

      // 按钮反馈
      exportReplyBtn.innerHTML = '<span class="btn-icon">✓</span> 已导出';
      setTimeout(() => {
        exportReplyBtn.innerHTML = '<span class="btn-icon">💾</span> 导出原始回复';
      }, 2000);

      console.log('[Ge-extension Popup] 回复已导出到文件');
    } catch (error) {
      console.error('[Ge-extension Popup] 导出失败:', error);
      alert('导出失败：' + error.message);
    }
  }

  // ========== 11.2 复制回复 ==========
  async function handleCopyReply() {
    try {
      // 从 storage 获取最后一次回复
      const result = await chrome.storage.local.get(['geLastReply']);
      const lastReply = result.geLastReply;

      if (!lastReply || !lastReply.content) {
        alert('没有找到回复内容');
        return;
      }

      // 复制到剪贴板
      await navigator.clipboard.writeText(lastReply.content);

      // 按钮反馈
      copyReplyBtn.innerHTML = '<span class="btn-icon">✓</span> 已复制';
      setTimeout(() => {
        copyReplyBtn.innerHTML = '<span class="btn-icon">📋</span> 复制回复';
      }, 2000);

      console.log('[Ge-extension Popup] 回复已复制到剪贴板');
    } catch (error) {
      console.error('[Ge-extension Popup] 复制失败:', error);
      alert('复制失败：' + error.message);
    }
  }

  // ========== 11.3 复制全部 ==========
  async function handleCopyAll() {
    try {
      // 从 storage 获取数据
      const result = await chrome.storage.local.get(['gePrevReply', 'geLastReply']);
      const prevReply = result.gePrevReply;
      const lastReply = result.geLastReply;

      if (!lastReply || !lastReply.content) {
        alert('没有找到回复内容');
        return;
      }

      // 组合内容
      let allContent = '';
      if (prevReply && prevReply.content) {
        allContent += '===== 上一个回复 =====\n' + prevReply.content + '\n\n';
      }
      allContent += '===== 新机器人回复 =====\n' + lastReply.content;

      // 复制到剪贴板
      await navigator.clipboard.writeText(allContent);

      // 按钮反馈
      copyAllBtn.innerHTML = '<span class="btn-icon">✓</span> 已复制';
      setTimeout(() => {
        copyAllBtn.innerHTML = '<span class="btn-icon">📋</span> 复制全部';
      }, 2000);

      console.log('[Ge-extension Popup] 全部内容已复制到剪贴板');
    } catch (error) {
      console.error('[Ge-extension Popup] 复制失败:', error);
      alert('复制失败：' + error.message);
    }
  }

  // ========== 11.4 重新执行第一步 ==========
  async function handleRetry() {
    if (!currentTabId) return;

    try {
      // 先发送消息到 content.js 停止接力（清除 URL 监听）
      await chrome.tabs.sendMessage(currentTabId, { action: 'stopRelay' });

      // 清空 storage 中的接力配置（包括第一步和第二步）
      await chrome.storage.local.remove(['geRelayConfig', 'geStep2Config']);

      // 重置本地状态
      currentRelayState = RELAY_STATE.IDLE;
      savedPrevReply = null;
      savedGemReply = null;
      lastParsedReplyHash = null;
      classifiedData = { scenes: [], materials: [], character: [], sceneSetting: '', materialSetting: '' };

      // 更新 UI
      updateRelayUI();
      hidePrevReply();
      hideNewReply();
      classifiedSection.classList.add('hidden');
      aspectRatioSection.classList.add('hidden');
      materialSettingSection.classList.add('hidden');

      // 读取机器人1的URL配置
      const botUrlsResult = await chrome.storage.local.get(['geBotUrls']);
      const bot1Url = botUrlsResult.geBotUrls?.bot1;

      console.log('[Ge-extension Popup] 已重置，准备跳转...');

      if (bot1Url) {
        // 如果配置了机器人1 URL，跳转到该页面
        console.log('[Ge-extension Popup] 跳转到机器人1 URL:', bot1Url);
        await chrome.tabs.update(currentTabId, { url: bot1Url });
      } else {
        // 没有配置则刷新当前页面
        console.log('[Ge-extension Popup] 刷新当前页面');
        await chrome.tabs.reload(currentTabId);
      }

      // 跳转/刷新后重新获取页面信息
      setTimeout(() => {
        getCurrentPageInfo();
      }, 2000);
    } catch (error) {
      console.error('[Ge-extension Popup] 重置失败:', error);
    }
  }

  // ========== 11.5 重新运行指定机器人 ==========
  async function handleRetryBot(botNumber) {
    if (!currentTabId) {
      console.error('[Ge-extension Popup] 没有 currentTabId');
      return;
    }

    console.log('[Ge-extension Popup] 重新运行机器人', botNumber);

    // 定义默认的一致性后缀
    const DEFAULT_CONSISTENCY_SUFFIX = '\n画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。';

    try {
      // 读取当前界面上的设置内容和已保存的数据
      const storageResult = await chrome.storage.local.get(['geStep2Config', 'geBotUrls']);
      const step2Config = storageResult.geStep2Config || {};
      const botUrls = storageResult.geBotUrls || {};

      // 获取当前界面上的设置
      // 场景设置：添加一致性后缀（如果尚未包含）
      const rawSceneSetting = aspectRatioInput.value.trim();
      const sceneSetting = rawSceneSetting.endsWith(DEFAULT_CONSISTENCY_SUFFIX.trim())
        ? rawSceneSetting
        : rawSceneSetting + DEFAULT_CONSISTENCY_SUFFIX;
      const materialSetting = materialSettingInput.value.trim();

      // 根据机器人编号设置状态
      let newState = '';
      let targetUrl = '';

      if (botNumber === 3) {
        newState = 'step2_part1_scenes';
        targetUrl = botUrls.bot3;
      } else if (botNumber === 4) {
        newState = 'step2_part2_materials';
        targetUrl = botUrls.bot4;
      } else if (botNumber === 5) {
        newState = 'step2_part3_character';
        targetUrl = botUrls.bot5;
      }

      if (!targetUrl) {
        alert(`机器人${botNumber} 的 URL 未配置`);
        return;
      }

      // 更新配置
      const updatedConfig = {
        ...step2Config,
        state: newState,
        sceneSetting: sceneSetting || step2Config.sceneSetting,
        materialSetting: materialSetting || step2Config.materialSetting,
        currentSceneIndex: botNumber === 3 ? 0 : step2Config.currentSceneIndex,
        currentMaterialIndex: botNumber === 4 ? 0 : step2Config.currentMaterialIndex,
        currentCharacterIndex: botNumber === 5 ? 0 : step2Config.currentCharacterIndex
      };

      // 如果是机器人3，重置场景的图片
      if (botNumber === 3 && updatedConfig.scenes) {
        updatedConfig.scenes = updatedConfig.scenes.map(s => ({
          ...s,
          imagePrompt: null,
          generatedImageUrl: null
        }));
      }
      // 如果是机器人4，重置素材的图片
      if (botNumber === 4 && updatedConfig.materials) {
        updatedConfig.materials = updatedConfig.materials.map(m => ({
          ...m,
          imagePrompt: null,
          generatedImageUrl: null
        }));
      }
      // 如果是机器人5，重置角色的图片
      if (botNumber === 5 && updatedConfig.character) {
        updatedConfig.character = updatedConfig.character.map(c => ({
          ...c,
          imagePrompt: null,
          generatedImageUrl: null
        }));
      }

      await chrome.storage.local.set({ geStep2Config: updatedConfig });
      console.log('[Ge-extension Popup] 已更新配置，准备跳转到机器人', botNumber, targetUrl);

      // 跳转到目标机器人页面
      await chrome.tabs.update(currentTabId, { url: targetUrl });

    } catch (error) {
      console.error('[Ge-extension Popup] 重新运行机器人失败:', error);
      alert('重新运行失败: ' + error.message);
    }
  }

  // ========== 14. 更新接力 UI ==========
  function updateRelayUI() {
    const statusConfig = {
      [RELAY_STATE.IDLE]: {
        icon: '○',
        text: '等待开始',
        progress: 0,
        showStart: true,
        showStep2: false,
        showStop: false,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '点击"开始第一步"后，将自动跳转到机器人 2'
      },
      [RELAY_STATE.WAITING_FOR_GEM_SELECT]: {
        icon: '●',
        text: '正在跳转到机器人 2...',
        progress: 30,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: true,
        hint: '正在跳转页面，请稍候...'
      },
      [RELAY_STATE.SENDING_TO_GEM]: {
        icon: '●',
        text: '正在发送消息到机器人...',
        progress: 60,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '正在发送消息...'
      },
      [RELAY_STATE.WAITING_GEM_REPLY]: {
        icon: '●',
        text: '等待机器人回复...',
        progress: 80,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '请耐心等待机器人回复...'
      },
      // 画板大师状态
      [RELAY_STATE.WAITING_FOR_CANVAS_MASTER]: {
        icon: '●',
        text: '正在跳转到画板大师...',
        progress: 25,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: true,
        hint: '机器人1完成，正在跳转到画板大师...'
      },
      [RELAY_STATE.SENDING_TO_CANVAS_MASTER]: {
        icon: '●',
        text: '正在发送消息到画板大师...',
        progress: 30,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '正在发送消息给画板大师...'
      },
      [RELAY_STATE.WAITING_CANVAS_MASTER_REPLY]: {
        icon: '●',
        text: '等待画板大师回复...',
        progress: 35,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '请耐心等待画板大师回复...'
      },
      [RELAY_STATE.CANVAS_MASTER_COMPLETED]: {
        icon: '●',
        text: '画板大师完成，跳转机器人2...',
        progress: 40,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '画板大师完成，正在跳转到机器人2...'
      },
      [RELAY_STATE.WAITING_FOR_BOT2]: {
        icon: '●',
        text: '正在跳转到机器人2...',
        progress: 45,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '正在跳转到机器人2...'
      },
      [RELAY_STATE.COMPLETED]: {
        icon: '✓',
        text: '第一步完成！',
        progress: 100,
        showStart: false,
        showStep2: true,
        showStop: false,
        showRetry: true,
        showExport: true,
        showPause: false,
        hint: '第一步完成！可以开始第二步，或导出/复制回复'
      },
      [RELAY_STATE.FAILED]: {
        icon: '✗',
        text: '操作失败',
        progress: 0,
        showStart: true,
        showStep2: false,
        showStop: false,
        showRetry: false,
        showExport: false,
        showPause: false,
        hint: '操作失败，请重试'
      },
      // 第二步：场景生成中
      [RELAY_STATE.STEP2_PART1_RUNNING]: {
        icon: '●',
        text: '正在生成场景概念图',
        progress: 0,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: true,
        hint: '正在生成场景概念图...'
      },
      // 第二步：场景生成完成
      [RELAY_STATE.STEP2_PART1_COMPLETED]: {
        text: '场景生成完成，准备生成素材',
        progress: 50,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: true,
        hint: '场景生成完成，正在跳转到机器人4...'
      },
      // 第二步：素材生成中
      [RELAY_STATE.STEP2_PART2_RUNNING]: {
        icon: '●',
        progress: 0,
        showStart: false,
        showStep2: false,
        showStop: true,
        showRetry: false,
        showExport: false,
        showPause: true,
        hint: '正在生成素材概念图...'
      },
      // 第二步：全部完成
      [RELAY_STATE.STEP2_COMPLETED]: {
        icon: '✓',
        text: '第二步完成！',
        showStart: false,
        showStep2: false,
        showStop: false,
        showRetry: true,
        showExport: true,
        showPause: false,
        hint: '第二步全部完成！'
      }
    };

    const config = statusConfig[currentRelayState];

    // 更新状态显示
    relayStatus.innerHTML = `
      <span class="status-icon">${config.icon}</span>
      <span class="status-text">${config.text}</span>
    `;

    // 更新进度条
    progressFill.style.width = config.progress + '%';

    // 更新按钮显示
    startStep1Btn.classList.toggle('hidden', !config.showStart);
    startStep2Btn.classList.toggle('hidden', !config.showStep2);
    stopBtn.classList.toggle('hidden', !config.showStop);
    retryBtn.classList.toggle('hidden', !config.showRetry);
    exportReplyBtn.classList.toggle('hidden', !config.showExport);

    // 第二步完成后，根据勾选状态显示重新运行机器人按钮
    if (currentRelayState === RELAY_STATE.STEP2_COMPLETED) {
      // 从 storage 读取勾选状态
      chrome.storage.local.get(['geStep2Config'], function(result) {
        const step2Config = result.geStep2Config || {};
        const bot3Enabled = step2Config.bot3Enabled !== false;
        const bot4Enabled = step2Config.bot4Enabled !== false;
        const bot5Enabled = step2Config.bot5Enabled !== false;

        retryBot3Btn.classList.toggle('hidden', !bot3Enabled);
        retryBot4Btn.classList.toggle('hidden', !bot4Enabled);
        retryBot5Btn.classList.toggle('hidden', !bot5Enabled);

        // 如果有任何一个按钮显示，则显示容器
        const hasAnyButton = bot3Enabled || bot4Enabled || bot5Enabled;
        retryBotControls.classList.toggle('hidden', !hasAnyButton);
      });
    } else {
      retryBot3Btn.classList.add('hidden');
      retryBot4Btn.classList.add('hidden');
      retryBot5Btn.classList.add('hidden');
      retryBotControls.classList.add('hidden');
    }

    // 更新暂停按钮显示
    if (config.showPause) {
      pauseBtn.classList.remove('hidden');
      // 根据暂停状态更新按钮样式
      if (isPaused) {
        pauseBtn.classList.add('paused');
        pauseBtn.querySelector('.pause-icon').textContent = '▶';
      } else {
        pauseBtn.classList.remove('paused');
        pauseBtn.querySelector('.pause-icon').textContent = '⏸';
      }
    } else {
      pauseBtn.classList.add('hidden');
    }

    // 分类区域的显示/隐藏由 checkRelayStatus 控制，这里不处理

    // 更新提示
    relayHint.textContent = config.hint;

    // 更新状态颜色
    relayStatus.className = 'relay-status';
    if (currentRelayState === RELAY_STATE.COMPLETED) {
      relayStatus.classList.add('success');
    } else if (currentRelayState === RELAY_STATE.FAILED) {
      relayStatus.classList.add('error');
    } else if (currentRelayState !== RELAY_STATE.IDLE) {
      relayStatus.classList.add('running');
    }
  }

  // ========== 15.1 更新第二步进度 ==========
  function updateStep2Progress(actionText, current, total, currentTask, progress) {
    // 更新进度条
    progressFill.style.width = progress + '%';

    // 更新状态文本
    const taskText = total > 0 ? ` (${current}/${total})` : '';
    relayStatus.innerHTML = `
      <span class="status-icon">●</span>
      <span class="status-text">${actionText}${taskText}</span>
    `;

    // 更新提示信息
    if (currentTask) {
      relayHint.textContent = `当前任务: ${currentTask}`;
    } else {
      relayHint.textContent = '正在处理...';
    }

    // 更新状态颜色
    relayStatus.className = 'relay-status running';
  }

  // ========== 15.2 更新第二步按钮显示 ==========
  function updateStep2Buttons(isRunning) {
    // 第二步运行时显示停止按钮和暂停按钮
    stopBtn.classList.toggle('hidden', !isRunning);
    pauseBtn.classList.toggle('hidden', !isRunning);

    // 更新暂停按钮状态
    if (isRunning) {
      if (isPaused) {
        pauseBtn.classList.add('paused');
        pauseBtn.querySelector('.pause-icon').textContent = '▶';
      } else {
        pauseBtn.classList.remove('paused');
        pauseBtn.querySelector('.pause-icon').textContent = '⏸';
      }
    }

    startStep1Btn.classList.add('hidden');
    startStep2Btn.classList.add('hidden');
    retryBtn.classList.add('hidden');
    exportReplyBtn.classList.add('hidden');
  }

  // ========== 16. 显示/隐藏回复 ==========
  function showPrevReply(text) {
    // 只在 textarea 为空时才设置值，避免覆盖用户的修改
    if (!prevReplyText.value) {
      prevReplyText.value = text;
    }
    prevReplySection.classList.remove('hidden');
    prevReplyContent.classList.add('hidden'); // 默认收起内容
    togglePrevReply.textContent = '展开'; // 更新按钮文本
  }

  // ========== 16.1 保存机器人1回复修改 ==========
  async function handleSavePrevReply() {
    try {
      const modifiedText = prevReplyText.value;

      // 保存到 gePrevReplyModified（供 content.js 使用）
      await chrome.storage.local.set({
        gePrevReplyModified: {
          content: modifiedText,
          timestamp: Date.now()
        }
      });

      // 同时更新 geRelayConfig.savedPrevReply（供 popup 读取）
      const result = await chrome.storage.local.get(['geRelayConfig']);
      const relayConfig = result.geRelayConfig || {};
      relayConfig.savedPrevReply = modifiedText;
      await chrome.storage.local.set({ geRelayConfig: relayConfig });

      // 更新本地变量
      savedPrevReply = modifiedText;

      // 同时更新到任务历史记录（用于重做时自动填充）
      await updateTaskBotRecord('bot1', {
        ran: true,
        content: modifiedText
      });

      // 按钮反馈
      savePrevReplyBtn.textContent = '✓ 已保存';
      setTimeout(() => {
        savePrevReplyBtn.textContent = '💾 保存';
      }, 2000);

      console.log('[Ge-extension Popup] 机器人1回复已保存修改');
    } catch (error) {
      console.error('[Ge-extension Popup] 保存失败:', error);
      alert('保存失败：' + error.message);
    }
  }

  // ========== 16.2 保存场景设置（同时更新 classifiedData 和 geStep2Config）==========
  async function handleSaveAspectRatio() {
    try {
      const sceneSetting = aspectRatioInput.value.trim();

      // 更新 classifiedData
      classifiedData.sceneSetting = sceneSetting;

      // 更新 geStep2Config 中的场景设置（如果存在）
      const result = await chrome.storage.local.get(['geStep2Config']);
      if (result.geStep2Config) {
        result.geStep2Config.sceneSetting = sceneSetting;
        await chrome.storage.local.set({ geStep2Config: result.geStep2Config });
      }

      // 移除错误状态
      aspectRatioInput.classList.remove('error');
      aspectRatioInput.placeholder = '例如：1125*2436';

      // 按钮反馈
      saveAspectRatioBtn.textContent = '✓ 已保存';
      setTimeout(() => {
        saveAspectRatioBtn.textContent = '💾 保存';
      }, 2000);

      console.log('[Ge-extension Popup] 场景设置已保存:', sceneSetting);
    } catch (error) {
      console.error('[Ge-extension Popup] 保存场景设置失败:', error);
      alert('保存失败：' + error.message);
    }
  }

  // ========== 16.3 加载场景设置（从 classifiedData 读取）==========
  async function loadAspectRatio() {
    try {
      // 从 classifiedData 读取
      if (classifiedData.sceneSetting) {
        aspectRatioInput.value = classifiedData.sceneSetting;
        console.log('[Ge-extension Popup] 已加载场景设置:', classifiedData.sceneSetting);
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 加载场景设置失败:', error);
    }
  }

  // ========== 16.4 保存素材角色设置（同时更新 classifiedData 和 geStep2Config）==========
  async function handleSaveMaterialSetting() {
    try {
      const materialSetting = materialSettingInput.value.trim();

      // 更新 classifiedData
      classifiedData.materialSetting = materialSetting;

      // 更新 geStep2Config 中的素材角色设置（如果存在）
      const result = await chrome.storage.local.get(['geStep2Config']);
      if (result.geStep2Config) {
        result.geStep2Config.materialSetting = materialSetting;
        await chrome.storage.local.set({ geStep2Config: result.geStep2Config });
      }

      // 移除错误状态
      materialSettingInput.classList.remove('error');

      // 按钮反馈
      saveMaterialSettingBtn.textContent = '✓ 已保存';
      setTimeout(() => {
        saveMaterialSettingBtn.textContent = '💾 保存';
      }, 2000);

      console.log('[Ge-extension Popup] 素材角色设置已保存:', materialSetting);
    } catch (error) {
      console.error('[Ge-extension Popup] 保存素材角色设置失败:', error);
      alert('保存失败：' + error.message);
    }
  }

  // ========== 16.5 加载素材角色设置（从 classifiedData 读取）==========
  async function loadMaterialSetting() {
    try {
      // 从 classifiedData 读取（已有默认值）
      if (classifiedData.materialSetting) {
        materialSettingInput.value = classifiedData.materialSetting;
        console.log('[Ge-extension Popup] 已加载素材角色设置:', classifiedData.materialSetting);
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 加载素材角色设置失败:', error);
    }
  }

  // ========== 16.6 从回复中提取场景设置 ==========
  function extractSceneSetting(reply) {
    // 提取 "一、 场景构图简述" 和 "场景 1：" 之间的内容
    const match = reply.match(/一、\s*场景构图简述\s*([\s\S]*?)(?=场景\s*1[：:])/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return '';
  }

  function hidePrevReply() {
    prevReplySection.classList.add('hidden');
  }

  function showNewReply(text) {
    newReplyText.textContent = text.substring(0, 200) + (text.length > 200 ? '...' : '');
    newReplySection.classList.remove('hidden');
  }

  function hideNewReply() {
    newReplySection.classList.add('hidden');
  }

  function toggleSection(contentElement, buttonElement) {
    contentElement.classList.toggle('hidden');
    buttonElement.textContent = contentElement.classList.contains('hidden') ? '展开' : '收起';
  }

  // ========== 17. 开始检查机器人状态 ==========
  function startRelayStatusCheck() {
    // 立即检查一次状态
    checkRelayStatus();

    // 定期从 storage 读取状态（每秒）
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
    }

    statusCheckInterval = setInterval(() => {
      checkRelayStatus();
    }, 1000);
  }

  // ========== 17.1 检查接力状态 ==========
  async function checkRelayStatus() {
    try {
      // 首先检查是否有重做配置
      const redoResult = await chrome.storage.local.get(['geRedoConfig']);
      const redoConfig = redoResult.geRedoConfig;

      if (redoConfig && redoConfig.isPaused) {
        console.log('[Ge-extension Popup] 检测到重做配置:', redoConfig);

        // 设置状态为等待用户确认
        currentRelayState = RELAY_STATE.WAITING_FOR_GEM_SELECT;
        isPaused = true;

        // 更新 UI
        updateRelayUI();

        // 显示机器人 1 回复区域
        prevReplySection.classList.remove('hidden');
        prevReplyContent.classList.remove('hidden');
        togglePrevReply.textContent = '收起';

        // 填充机器人 1 回复内容（只在内容为空时设置，避免覆盖用户修改）
        if (redoConfig.bot1Reply && !prevReplyText.value) {
          prevReplyText.value = redoConfig.bot1Reply;
        }

        // 显示提示
        if (redoConfig.botKey === 'canvasMaster') {
          relayHint.textContent = '重做画板大师：点击继续按钮开始发送给画板大师';
        } else if (redoConfig.botKey === 'bot2') {
          relayHint.textContent = '重做机器人2：点击继续按钮开始发送给机器人2';
        }

        // 显示继续按钮
        startStep2Btn.classList.remove('hidden');

        return;
      }

      // 优先检查第一步状态（画板大师相关状态）
      const relayResult = await chrome.storage.local.get(['geRelayConfig']);
      const relayConfig = relayResult.geRelayConfig;

      // 如果是画板大师相关状态，直接使用这个状态，不检查 geStep2Config
      if (relayConfig && isCanvasMasterState(relayConfig.state)) {
        console.log('[Ge-extension Popup] 画板大师状态:', relayConfig.state);
        currentRelayState = relayConfig.state;
        savedPrevReply = relayConfig.savedPrevReply;
        savedGemReply = relayConfig.savedGemReply;

        // 更新 UI
        updateRelayUI();

        if (savedPrevReply) {
          if (!prevReplyText.value) {
            showPrevReply(savedPrevReply);
          } else {
            // 确保区域显示（用户可能已展开并修改过）
            prevReplySection.classList.remove('hidden');
          }
        }

        return;
      }

      // 检查第二步状态
      const step2Result = await chrome.storage.local.get(['geStep2Config']);
      const step2Config = step2Result.geStep2Config;

      if (step2Config && step2Config.state !== 'waiting_start' && step2Config.state !== 'completed') {
        // 第二步正在执行
        console.log('[Ge-extension Popup] 第二步状态:', step2Config.state);

        // 同步暂停状态：从 geStep2Config.isPaused 读取
        if (step2Config.isPaused !== undefined) {
          isPaused = step2Config.isPaused;
          // 只有暂停状态变化时才写入 storage 和打印日志
          if (lastSyncedIsPaused !== isPaused) {
            lastSyncedIsPaused = isPaused;
            await chrome.storage.local.set({ geRelayPaused: isPaused });
            console.log('[Ge-extension Popup] 暂停状态变化:', isPaused);
          }
        }

        // 隐藏机器人1和机器人2的回复区域，只显示分类区域
        prevReplySection.classList.add('hidden');
        newReplySection.classList.add('hidden');
        classifiedSection.classList.remove('hidden');
        classifiedContent.classList.remove('hidden');
        toggleClassified.textContent = '收起';

        // 从 geStep2Config 同步数据到 classifiedData（保留已存在的图片数据）
        // 注意：如果用户正在编辑（hasRecordedOriginal 为 true），则不从 storage 覆盖本地数据
        if (!hasRecordedOriginal.scenes) {
          classifiedData.scenes = step2Config.scenes || [];
        }
        // 同步素材时保留已有的图片数据
        if (!hasRecordedOriginal.materials) {
          classifiedData.materials = (step2Config.materials || []).map((m, i) => ({
            ...m,
            images: classifiedData.materials[i]?.images || m.images || []
          }));
        }
        // 加载角色数据（兼容新旧格式）
        if (!hasRecordedOriginal.character) {
          if (Array.isArray(step2Config.character)) {
            // 新格式：character 是数组
            classifiedData.character = step2Config.character;
          } else if (typeof step2Config.character === 'string') {
            // 旧格式：character 是字符串，characterImages 是独立数组
            const oldCharacter = step2Config.character;
            classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: step2Config.characterImages || [] }] : [];
          } else {
            classifiedData.character = [];
          }
        }
        classifiedData.sceneSetting = step2Config.sceneSetting || '';
        classifiedData.materialSetting = step2Config.materialSetting || '';

        // 计算当前数据的哈希，只有在数据变化时才重新渲染
        const currentHash = JSON.stringify({
          scenesCount: classifiedData.scenes.length,
          materialsCount: classifiedData.materials.length,
          character: classifiedData.character
        });

        if (lastClassifiedDataHash !== currentHash) {
          lastClassifiedDataHash = currentHash;
          // 显示分类内容（保持用户选择的标签页）
          displayCategoryContent(currentCategoryTab);
        }

        if (step2Config.state === 'step2_part1_scenes') {
          // 场景生成中
          const total = step2Config.scenes?.length || 0;
          const current = step2Config.currentSceneIndex || 0;
          const progress = total > 0 ? Math.round((current / total) * 50) : 0; // 场景占50%

          updateStep2Progress('正在生成场景概念图', current, total, step2Config.scenes[current - 1]?.title || '', progress);
          currentRelayState = RELAY_STATE.STEP2_PART1_RUNNING;

          // 只更新按钮显示，不覆盖进度条
          updateStep2Buttons(true);
          return;
        } else if (step2Config.state === 'step2_part2_materials') {
          // 素材生成中
          const total = step2Config.materials?.length || 0;
          const current = step2Config.currentMaterialIndex || 0;
          const progress = total > 0 ? 50 + Math.round((current / total) * 50) : 50; // 素材占50%，从50%开始

          updateStep2Progress('正在生成素材概念图', current, total, step2Config.materials[current - 1]?.name || '', progress);
          currentRelayState = RELAY_STATE.STEP2_PART2_RUNNING;

          // 只更新按钮显示，不覆盖进度条
          updateStep2Buttons(true);
          return;
        }

        return;
      }

      if (step2Config && step2Config.state === 'completed') {
        // 第二步完成
        currentRelayState = RELAY_STATE.STEP2_COMPLETED;

        // 隐藏机器人1和机器人2的回复区域，只显示分类区域
        prevReplySection.classList.add('hidden');
        newReplySection.classList.add('hidden');
        classifiedSection.classList.remove('hidden');
        classifiedContent.classList.remove('hidden');
        toggleClassified.textContent = '收起';

        // 从 geStep2Config 同步数据到 classifiedData（保留已存在的图片数据）
        // 注意：如果用户正在编辑（hasRecordedOriginal 为 true），则不从 storage 覆盖本地数据
        if (!hasRecordedOriginal.scenes) {
          classifiedData.scenes = step2Config.scenes || [];
        }
        // 同步素材时保留已有的图片数据
        if (!hasRecordedOriginal.materials) {
          classifiedData.materials = (step2Config.materials || []).map((m, i) => ({
            ...m,
            images: classifiedData.materials[i]?.images || m.images || []
          }));
        }
        // 加载角色数据（兼容新旧格式）
        if (!hasRecordedOriginal.character) {
          if (Array.isArray(step2Config.character)) {
            classifiedData.character = step2Config.character;
          } else if (typeof step2Config.character === 'string') {
            const oldCharacter = step2Config.character;
            classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: step2Config.characterImages || [] }] : [];
          } else {
            classifiedData.character = [];
          }
        }

        // 计算当前数据的哈希，只有在数据变化时才重新渲染
        const completedHash = JSON.stringify({
          scenesCount: classifiedData.scenes.length,
          materialsCount: classifiedData.materials.length,
          character: classifiedData.character
        });

        if (lastClassifiedDataHash !== completedHash) {
          lastClassifiedDataHash = completedHash;
          // 显示分类内容（保持用户选择的标签页）
          displayCategoryContent(currentCategoryTab);
        }

        updateRelayUI();
        return;
      }

      // 新增：处理 waiting_start 状态（第一步完成，等待开始第二步）
      if (step2Config && step2Config.state === 'waiting_start') {
        // 第二步已配置但未开始，显示分类区域和开始第二步按钮
        currentRelayState = RELAY_STATE.COMPLETED;  // 第一步已完成

        // 隐藏机器人1和机器人2的回复区域，显示分类区域
        prevReplySection.classList.add('hidden');
        newReplySection.classList.add('hidden');
        classifiedSection.classList.remove('hidden');
        classifiedContent.classList.remove('hidden');
        toggleClassified.textContent = '收起';

        // 从 geStep2Config 同步数据到 classifiedData（保留已存在的图片数据）
        // 注意：如果用户正在编辑（hasRecordedOriginal 为 true），则不从 storage 覆盖本地数据
        if (!hasRecordedOriginal.scenes) {
          classifiedData.scenes = step2Config.scenes || [];
        }
        if (!hasRecordedOriginal.materials) {
          classifiedData.materials = (step2Config.materials || []).map((m, i) => ({
            ...m,
            images: classifiedData.materials[i]?.images || m.images || []
          }));
        }
        // 加载角色数据（兼容新旧格式）
        if (!hasRecordedOriginal.character) {
          if (Array.isArray(step2Config.character)) {
            classifiedData.character = step2Config.character;
          } else if (typeof step2Config.character === 'string') {
            const oldCharacter = step2Config.character;
            classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: step2Config.characterImages || [] }] : [];
          } else {
            classifiedData.character = [];
          }
        }
        classifiedData.sceneSetting = step2Config.sceneSetting || '';
        classifiedData.materialSetting = step2Config.materialSetting || '';

        // 计算哈希并渲染
        const waitingHash = JSON.stringify({
          scenesCount: classifiedData.scenes.length,
          materialsCount: classifiedData.materials.length,
          character: classifiedData.character
        });

        if (lastClassifiedDataHash !== waitingHash) {
          lastClassifiedDataHash = waitingHash;
          displayCategoryContent(currentCategoryTab);
        }

        updateRelayUI();
        return;  // 直接返回，不执行后面的第一步状态检查
      }

      // 检查第一步状态
      const result = await chrome.storage.local.get(['geRelayConfig']);
      const config = result.geRelayConfig;

      if (config && config.state !== RELAY_STATE.IDLE) {
        // 更新本地状态
        currentRelayState = config.state;
        savedPrevReply = config.savedPrevReply;
        savedGemReply = config.savedGemReply;

        // 更新 UI
        updateRelayUI();

        if (savedPrevReply) {
          // 只在 textarea 为空时才设置，避免覆盖用户的修改
          if (!prevReplyText.value) {
            showPrevReply(savedPrevReply);
          } else {
            // 确保区域显示
            prevReplySection.classList.remove('hidden');
          }
        }

        if (savedGemReply) {
          showNewReply(savedGemReply);

          // 每次检测到完成状态且有新回复时，解析回复内容
          if (currentRelayState === RELAY_STATE.COMPLETED) {
            // 检查是否是新的回复（与上次解析的不同）
            const newReplyHash = hashReply(savedGemReply);
            if (!lastParsedReplyHash || lastParsedReplyHash !== newReplyHash) {
              console.log('[Ge-extension Popup] 检测到新回复，开始解析');
              parseGeminiReply(savedGemReply);
              lastParsedReplyHash = newReplyHash;
              // 显示分类区域
              classifiedSection.classList.remove('hidden');
              // 显示长宽比设置区域
              aspectRatioSection.classList.remove('hidden');
              // 显示素材角色设置区域
              materialSettingSection.classList.remove('hidden');
              // 加载已保存的长宽比
              loadAspectRatio();
              // 加载已保存的素材角色设置
              loadMaterialSetting();
              // 显示当前标签页
              displayCategoryContent(currentCategoryTab);
            }
          }
        } else {
          hideNewReply();
        }

        console.log('[Ge-extension Popup] 状态已同步:', currentRelayState);
      } else {
        // 没有配置或状态为 IDLE，重置为初始状态
        if (currentRelayState !== RELAY_STATE.IDLE) {
          console.log('[Ge-extension Popup] 检测到配置已清除，重置状态');
          currentRelayState = RELAY_STATE.IDLE;
          savedPrevReply = null;
          savedGemReply = null;
          lastParsedReplyHash = null;
          updateRelayUI();
          hidePrevReply();
          hideNewReply();
          classifiedSection.classList.add('hidden');
          aspectRatioSection.classList.add('hidden');
        }
      }
    } catch (error) {
      console.error('[Ge-extension Popup] 检查状态失败:', error);
    }
  }

  // 判断是否是画板大师相关状态
  function isCanvasMasterState(state) {
    const canvasMasterStates = [
      RELAY_STATE.WAITING_FOR_CANVAS_MASTER,
      RELAY_STATE.SENDING_TO_CANVAS_MASTER,
      RELAY_STATE.WAITING_CANVAS_MASTER_REPLY,
      RELAY_STATE.CANVAS_MASTER_COMPLETED,
      RELAY_STATE.WAITING_FOR_BOT2
    ];
    return canvasMasterStates.includes(state);
  }

  // 简单的哈希函数用于比较回复是否相同
  function hashReply(reply) {
    return reply.length + '_' + reply.substring(0, 50);
  }

  // ========== 工具函数 ==========

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function shortenUrl(url) {
    if (!url) return '';
    if (url.length > 50) return url.substring(0, 50) + '...';
    return url;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== 分类解析函数 ==========

  // 存储分类数据
  let classifiedData = {
    scenes: [],
    materials: [],
    character: [],         // 角色数组，每个元素包含 {content, images}
    sceneSetting: '',      // 场景设置
    materialSetting: ''    // 素材角色设置
  };

  // 存储用户开始编辑时的原始数据（用于修改检测，避免竞态条件）
  let originalContentOnEdit = {
    scenes: null,      // 用户开始编辑场景时的原始数据
    materials: null,   // 用户开始编辑素材时的原始数据
    character: null    // 用户开始编辑角色时的原始数据
  };
  let hasRecordedOriginal = {
    scenes: false,
    materials: false,
    character: false
  };

  /**
   * 解析机器人回复，提取分类内容
   */
  function parseGeminiReply(reply) {
    console.log('[Ge-extension Popup] 开始解析机器人回复');
    console.log('[Ge-extension Popup] 回复长度:', reply.length);
    console.log('[Ge-extension Popup] 回复前200字符:', reply.substring(0, 200));

    // 默认素材角色设置
    const defaultMaterialSetting = '2048*2048尺寸，白色背景，游戏素材图集，物品之间有间距，高分辨率，高品质游戏资产。画风、描线、视角和参考图高度一致，保证同一个素材在不同状态下一致性。';

    classifiedData = {
      scenes: [],
      materials: [],
      character: [],            // 角色数组
      sceneSetting: '',         // 场景设置（从回复提取）
      materialSetting: defaultMaterialSetting  // 素材角色设置（默认值）
    };

    // 提取场景构图简述
    extractScenes(reply);

    // 提取素材清单
    extractMaterials(reply);

    // 提取角色描述
    extractCharacter(reply);

    // 提取场景设置（"一、场景构图简述"和"场景 1："之间的内容）
    // 不在这里添加一致性后缀，而是在 handleStartStep2 发送时统一添加
    const sceneSettingMatch = reply.match(/一、\s*场景构图简述\s*([\s\S]*?)(?=场景\s*1[：:])/);
    if (sceneSettingMatch && sceneSettingMatch[1]) {
      classifiedData.sceneSetting = sceneSettingMatch[1].trim();
      console.log('[Ge-extension Popup] 提取场景设置:', classifiedData.sceneSetting);
    }

    // 更新输入框的值
    aspectRatioInput.value = classifiedData.sceneSetting;
    materialSettingInput.value = classifiedData.materialSetting;

    console.log('[Ge-extension Popup] 解析完成');
    console.log('[Ge-extension Popup] 场景数量:', classifiedData.scenes.length);
    console.log('[Ge-extension Popup] 场景数据:', classifiedData.scenes);
    console.log('[Ge-extension Popup] 素材数量:', classifiedData.materials.length);
    console.log('[Ge-extension Popup] 素材数据:', classifiedData.materials);
    console.log('[Ge-extension Popup] 有角色:', !!classifiedData.character);
    console.log('[Ge-extension Popup] 角色数据:', classifiedData.character);
  }

  /**
   * 提取场景构图简述（支持多种格式）
   */
  function extractScenes(reply) {
    // 查找 "一、场景构图简述" 或包含"场景"的部分
    const scenesSection = reply.match(/一、\s*场景构图简述[\s\S]*?(?=二、|素材清单|\[|$)/);

    if (scenesSection) {
      const scenesText = scenesSection[0];
      console.log('[Ge-extension Popup] 场景区域文本长度:', scenesText.length);

      // 按行分割
      const lines = scenesText.split('\n');
      console.log('[Ge-extension Popup] 场景区域行数:', lines.length);

      // 查找表头行（包含"场景编号"、"场景名称"、"构图简述"等关键词，且包含分隔符）
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if ((line.includes('场景编号') || line.includes('场景名称') || line.includes('构图简述')) &&
            (line.includes('\t') || line.includes(','))) {
          headerIndex = i;
          console.log('[Ge-extension Popup] 找到场景表头在第', i, '行:', line.substring(0, 50));
          break;
        }
      }

      if (headerIndex !== -1) {
        // 找到表头 → 表格模式
        console.log('[Ge-extension Popup] 检测到表格格式，开始逐行解析');
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          // 跳过空行和分隔线
          if (!line || line.match(/^[=-]+$/) || line.startsWith('二、') || line.includes('[图集')) {
            break;
          }
          parseSceneLine(line);
        }
      } else {
        // 没找到表头 → 文本格式解析（保持原有逻辑）
        extractScenesFromText(scenesText);
      }

      console.log('[Ge-extension Popup] 共提取场景数量:', classifiedData.scenes.length);
    }
  }

  /**
   * 解析单行场景数据（表格格式，支持2/3/4/5列）
   */
  function parseSceneLine(line) {
    console.log('[Ge-extension Popup] 解析场景行:', line.substring(0, 100));

    let parts = [];

    // 检测分隔符：优先制表符，其次逗号
    if (line.includes('\t')) {
      parts = line.split('\t').map(p => p.trim()).filter(p => p);
      console.log('[Ge-extension Popup] 场景使用制表符分隔，得到', parts.length, '列:', parts);
    } else if (line.includes(',')) {
      // 处理引号内的逗号
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      parts = parts.map(p => p.replace(/^"|"$/g, '')).filter(p => p);
      console.log('[Ge-extension Popup] 场景使用逗号分隔，得到', parts.length, '列');
    }

    if (parts.length < 2) {
      console.log('[Ge-extension Popup] 场景列数太少，跳过');
      return;
    }

    // 跳过表头行（包含"场景编号"、"场景名称"等关键词）
    if (parts.some(p => p.includes('场景编号') || p.includes('场景名称') || p.includes('构图简述'))) {
      console.log('[Ge-extension Popup] 检测到场景表头行，跳过');
      return;
    }

    // 获取场景编号
    const sceneNumber = classifiedData.scenes.length + 1;
    let content;

    if (parts.length === 2) {
      // 2列：场景名 | 构图简述
      content = `场景${sceneNumber}：${parts[0]}\n${parts[1]}`;
      console.log('[Ge-extension Popup] 2列格式 - 场景:', parts[0]);
    } else if (parts.length === 3) {
      // 3列：场景名 | 构图简述 | 初始状态
      content = `场景${sceneNumber}：${parts[0]}\n${parts[1]}\n初始状态：${parts[2]}`;
      console.log('[Ge-extension Popup] 3列格式 - 场景:', parts[0]);
    } else {
      // 4+列：场景编号 | 场景名 | 构图简述 | 初始状态 | ...
      // 检测第一列是否是编号（如"场景1"、"1"）
      if (parts[0].match(/^场景\s*\d+$/) || parts[0].match(/^\d+$/)) {
        // 第一列是编号
        content = `场景${sceneNumber}：${parts[1]}\n${parts.slice(2).join('\n')}`;
        console.log('[Ge-extension Popup] 4+列格式(有编号) - 场景:', parts[1]);
      } else {
        // 第一列是名称
        content = `场景${sceneNumber}：${parts[0]}\n${parts.slice(1).join('\n')}`;
        console.log('[Ge-extension Popup] 4+列格式(无编号) - 场景:', parts[0]);
      }
    }

    if (content) {
      classifiedData.scenes.push({ content });
    }
  }

  /**
   * 从文本格式提取场景
   */
  function extractScenesFromText(text) {
    console.log('[Ge-extension Popup] 检测到文本格式，开始解析');
    console.log('[Ge-extension Popup] 场景文本:', text.substring(0, 500));

    // 移除标题部分（如果有）
    let content = text.replace(/^一、\s*场景构图简述\s*/, '');

    // 使用正则按"场景 N："分割，保留分隔符
    const scenePattern = /场景\s*\d+[:：]/g;
    const matches = [];
    let match;

    // 找所有场景位置
    while ((match = scenePattern.exec(content)) !== null) {
      matches.push({ index: match.index, text: match[0] });
    }

    console.log('[Ge-extension Popup] 找到场景标记数量:', matches.length);

    // 提取每个场景
    for (let i = 0; i < matches.length; i++) {
      const startPos = matches[i].index;
      const endPos = i < matches.length - 1 ? matches[i + 1].index : content.length;

      // 获取完整场景文本（从"场景 N："开始）
      let sceneText = content.substring(startPos, endPos).trim();

      // 直接存储完整场景内容
      classifiedData.scenes.push({
        content: sceneText
      });

      console.log('[Ge-extension Popup] 文本提取场景:', sceneText.substring(0, 50) + '...');
    }
  }

  /**
   * 提取素材清单（支持多种格式，按行解析）
   */
  function extractMaterials(reply) {
    // 查找 "二、素材清单" 部分
    const materialsSection = reply.match(/二、\s*素材清单[\s\S]*?(?=\n\n三、|\n\n\[|\[图集-角色|三、|$)/);

    if (materialsSection) {
      const materialsText = materialsSection[0];
      console.log('[Ge-extension Popup] 素材区域文本长度:', materialsText.length);
      console.log('[Ge-extension Popup] 素材区域文本前500字符:', materialsText.substring(0, 500));

      // 按行分割
      const lines = materialsText.split('\n');
      console.log('[Ge-extension Popup] 素材区域行数:', lines.length);

      // 查找表头行
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('素材名称') || line.includes('素材类别') ||
            line.includes('状态/形变') || line.includes('图集需求')) {
          headerIndex = i;
          console.log('[Ge-extension Popup] 找到表头在第', i, '行:', line.substring(0, 50));
          break;
        }
      }

      if (headerIndex === -1) {
        console.log('[Ge-extension Popup] 未找到表头，尝试其他解析方式');
        extractMaterialsFromText(materialsText);
        return;
      }

      // 解析表头，确定哪些列需要跳过（列名包含"环节"或"场景"）
      const headerLine = lines[headerIndex];
      let skipColumnIndexes = [];
      let headerParts = [];

      if (headerLine.includes('\t')) {
        headerParts = headerLine.split('\t').map(p => p.trim());
      } else if (headerLine.includes(',')) {
        headerParts = headerLine.split(',').map(p => p.trim());
      }

      headerParts.forEach((header, index) => {
        if (header.includes('环节') || header.includes('场景')) {
          skipColumnIndexes.push(index);
          console.log('[Ge-extension Popup] 跳过列', index, ':', header);
        }
      });

      // 从表头下一行开始解析数据
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳过空行和分隔线
        if (!line || line.match(/^[=-]+$/) || line.startsWith('三、') || line.includes('[图集')) {
          break;
        }

        // 解析单行数据，传递需要跳过的列索引
        parseMaterialLine(line, skipColumnIndexes);
      }

      console.log('[Ge-extension Popup] 共提取素材数量:', classifiedData.materials.length);
    }
  }

  /**
   * 从表格格式提取素材（|分隔）
   */
  function extractMaterialsFromTable(text) {
    console.log('[Ge-extension Popup] 检测到表格格式，开始解析');

    const lines = text.split('\n');

    for (const line of lines) {
      if (line.includes('|')) {
        // 跳过标题行和分隔线
        if (line.includes('素材名称') || line.includes('---')) {
          continue;
        }

        const parts = line.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          // 将表格行转换为原始格式（用制表符分隔）
          const rawLine = [parts[1] || parts[0] || '', parts[2] || '', parts[3] || '', parts[4] || '', parts[5] || '']
            .filter(p => p)
            .join('\t');
          classifiedData.materials.push({
            name: parts[1] || parts[0] || '',
            initialState: parts[2] || '',
            processState: parts[3] || '',
            finalState: parts[4] || '',
            steps: parts[5] || '',
            rawLine: rawLine,  // 添加 rawLine 字段
            images: []  // 图片数组
          });
          console.log('[Ge-extension Popup] 表格提取素材:', parts[1] || parts[0], '原始行:', rawLine);
        }
      }
    }
  }

  /**
   * 从CSV格式提取素材（逗号分隔，支持引号）
   */
  function extractMaterialsFromCsv(text) {
    console.log('[Ge-extension Popup] 检测到CSV格式，开始解析');

    const lines = text.split('\n');
    let dataStartIndex = -1;

    // 找到数据开始行（第一行包含素材名称的是标题）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('素材名称') || line.includes('素材编号')) {
        dataStartIndex = i + 1; // 下一行开始是数据
        console.log('[Ge-extension Popup] 找到表头在第', i, '行');
        break;
      }
    }

    if (dataStartIndex === -1) {
      // 没找到标题行，尝试直接解析包含素材的行
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.includes(',') && !trimmedLine.includes('素材') && !trimmedLine.startsWith('二、')) {
          parseMaterialCsvLine(trimmedLine);
        }
      }
    } else {
      // 从数据开始行解析
      for (let i = dataStartIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && line.includes(',') && !line.startsWith('二、')) {
          parseMaterialCsvLine(line);
        }
      }
    }
  }

  /**
   * 解析单行素材数据（支持制表符分隔的表格）
   * @param {string} line - 素材数据行
   * @param {number[]} skipColumnIndexes - 需要跳过的列索引数组
   */
  function parseMaterialLine(line, skipColumnIndexes = []) {
    console.log('[Ge-extension Popup] 解析素材行:', line.substring(0, 100));

    // 先尝试按制表符分割（标准表格格式）
    let parts = [];
    if (line.includes('\t')) {
      parts = line.split('\t').map(p => p.trim());
      console.log('[Ge-extension Popup] 使用制表符分隔，得到', parts.length, '列:', parts);
    }
    // 如果没有制表符，尝试其他分隔符
    else if (line.includes(',')) {
      // 处理引号内的逗号
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      parts = parts.map(p => p.replace(/^"|"$/g, ''));
      console.log('[Ge-extension Popup] 使用逗号分隔，得到', parts.length, '列');
    }

    // 过滤掉需要跳过的列
    if (skipColumnIndexes.length > 0) {
      const originalLength = parts.length;
      parts = parts.filter((_, index) => !skipColumnIndexes.includes(index));
      console.log('[Ge-extension Popup] 过滤列后，从', originalLength, '列减少到', parts.length, '列');
    }

    // 过滤空值
    parts = parts.filter(p => p);

    if (parts.length < 2) {
      console.log('[Ge-extension Popup] 列数太少，跳过');
      return;
    }

    // 检查是否是表头行（包含"素材名称"等关键词）
    if (parts[0]?.includes('素材') || parts[1]?.includes('素材') ||
        parts.some(p => p.includes('状态清单') || p.includes('图集需求') || p.includes('角色名称'))) {
      console.log('[Ge-extension Popup] 检测到表头行，跳过');
      return;
    }

    // 检查是否是角色行（第3部分是角色）
    if (parts[0]?.includes('角色') || parts.some(p => p.includes('Q版') || p.includes('画风'))) {
      console.log('[Ge-extension Popup] 检测到角色行，跳过（由 extractCharacter 处理）');
      return;
    }

    // 根据列数使用不同的解析方式
    // 3列格式：素材名 | 状态清单 | 图集需求/步骤
    // 4+列格式：素材名 | 初始状态 | 过程状态 | 最终状态 | 步骤
    let material;
    if (parts.length === 3) {
      // 3列格式
      material = {
        name: parts[0],
        initialState: '',
        processState: '',
        finalState: '',
        description: parts[1], // 状态清单作为描述
        steps: parts[2] || '',
        // 保存原始行文本（包含制表符），用于发送时直接复制
        rawLine: line  // 直接保存原始行，保留制表符
      };
      console.log('[Ge-extension Popup] 3列格式 - 素材:', material.name, '状态:', material.description, '步骤:', material.steps, '原始行:', material.rawLine);
    } else {
      // 4+列格式（原有逻辑）
      // 分析列结构
      let category = '';
      let nameIndex = 0;
      let name = parts[nameIndex];

      // 检查第一列是否是分类（如"蔬果/食材"、"调味品"等）
      const categoryKeywords = ['蔬果', '食材', '调味品', '容器', '工具', '液体', '角色', '类别'];
      if (name && categoryKeywords.some(k => name.includes(k))) {
        category = name;
        nameIndex = 1;
        name = parts[nameIndex];
        console.log('[Ge-extension Popup] 检测到类别列:', category);
      }

      // 提取数据
      material = {
        name: name,
        category: category,
        initialState: parts[nameIndex + 1] || '',
        processState: parts[nameIndex + 2] || '',
        finalState: parts[nameIndex + 3] || '',
        description: parts[nameIndex + 4] || '',
        steps: '',
        // 保存原始行文本（包含制表符）
        rawLine: line,  // 添加 rawLine 字段
        images: []  // 图片数组
      };
      console.log('[Ge-extension Popup] 多列格式 - 素材:', material.name, '类别:', category, '原始行:', material.rawLine);
    }

    if (material.name) {
      classifiedData.materials.push(material);
    }
  }

  /**
   * 解析单行素材CSV数据（正确处理引号）
   */
  function parseMaterialCsvLine(line) {
    // 使用正则正确解析CSV（处理引号内的逗号）
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

    // 移除引号
    const cleanedParts = parts.map(p => p.replace(/^"|"$/g, ''));

    if (cleanedParts.length >= 2) {
      // 尝试识别哪一列是素材名称
      let nameIndex = 0;
      let name = cleanedParts[nameIndex];

      // 如果第一列看起来像编号，素材名称在第二列
      if (/^\d+$/.test(name) && cleanedParts.length > 1) {
        nameIndex = 1;
        name = cleanedParts[nameIndex];
      }

      classifiedData.materials.push({
        name: name,
        initialState: cleanedParts[nameIndex + 1] || '',
        processState: cleanedParts[nameIndex + 2] || '',
        finalState: cleanedParts[nameIndex + 3] || '',
        steps: cleanedParts[nameIndex + 4] || '',
        // 保存原始行文本（CSV格式，使用逗号分隔）
        rawLine: line,  // 添加 rawLine 字段
        images: []  // 图片数组
      });
      console.log('[Ge-extension Popup] CSV提取素材:', name, '步骤:', cleanedParts[nameIndex + 4], '原始行:', line);
    }
  }

  /**
   * 从纯文本格式提取素材
   */
  function extractMaterialsFromText(text) {
    console.log('[Ge-extension Popup] 检测到纯文本格式，开始解析');

    // 移除标题行和章节标题
    let content = text
      .replace(/二、\s*素材清单\s*/, '')
      .replace(/三、[\s\S]+$/, '') // 移除后续章节
      .trim();

    console.log('[Ge-extension Popup] 处理后的素材文本长度:', content.length);
    console.log('[Ge-extension Popup] 处理后的素材文本:', content.substring(0, 300));

    // 按行分割
    const lines = content.split('\n');
    console.log('[Ge-extension Popup] 素材区域行数:', lines.length);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue; // 跳过空行

      // 检测是否包含 Tab（标准表格格式）
      if (trimmedLine.includes('\t')) {
        // 使用 Tab 分割
        const parts = trimmedLine.split('\t').map(p => p.trim()).filter(p => p);

        // 跳过表头行（包含"素材"/"状态"等关键词）
        if (parts.some(p => p.includes('素材') || p.includes('状态') || p.includes('类别') || p.includes('图集'))) {
          console.log('[Ge-extension Popup] 跳过表头行:', parts[0]);
          continue;
        }

        // 检测列数，使用不同的解析方式
        let material;
        if (parts.length === 3) {
          // 3列格式：素材名 | 状态清单 | 图集需求/步骤
          material = {
            name: parts[0],
            initialState: '',
            processState: '',
            finalState: '',
            description: parts[1],
            steps: parts[2] || '',
            // 保存原始行文本（包含制表符），用于发送时直接复制
            rawLine: trimmedLine  // 直接保存原始行，保留制表符
          };
          console.log('[Ge-extension Popup] Tab提取3列素材:', material.name, '描述:', material.description, '步骤:', material.steps);
        } else {
          // 4+列格式：素材名 | 初始状态 | 过程状态 | 最终状态 | 步骤
          material = {
            name: parts[0],
            initialState: parts[1] || '',
            processState: parts[2] || '',
            finalState: parts[3] || '',
            description: parts[4] || '',
            steps: parts[5] || '',
            // 保存原始行文本（包含制表符）
            rawLine: trimmedLine,  // 添加 rawLine 字段
            images: []  // 图片数组
          };
          console.log('[Ge-extension Popup] Tab提取多列素材:', material.name, '原始行:', material.rawLine);
        }

        if (material.name) {
          classifiedData.materials.push(material);
        }
      }
    }

    console.log('[Ge-extension Popup] 共提取素材数量:', classifiedData.materials.length);
  }

  /**
   * 提取角色描述（匹配"三、"开头的内容）
   */
  function extractCharacter(reply) {
    console.log('[Ge-extension Popup] ===== extractCharacter 开始 =====');

    // 打印回复末尾500字符，看实际格式
    console.log('[Ge-extension Popup] 回复末尾500字符:', reply.slice(-500));

    // 先检查回复中是否有"三"字
    const sanIndex = reply.indexOf('三');
    console.log('[Ge-extension Popup] 回复中"三"字位置:', sanIndex);
    if (sanIndex > -1) {
      // 显示"三"字周围的上下文（前后各20个字符）
      const contextStart = Math.max(0, sanIndex - 20);
      const contextEnd = Math.min(reply.length, sanIndex + 50);
      console.log('[Ge-extension Popup] "三"字周围的上下文:', reply.substring(contextStart, contextEnd));
      // 检查"三"后面跟着什么字符
      console.log('[Ge-extension Popup] "三"后面第1个字符:', reply.charAt(sanIndex + 1), 'charCode:', reply.charCodeAt(sanIndex + 1));
      console.log('[Ge-extension Popup] "三"后面第2个字符:', reply.charAt(sanIndex + 2), 'charCode:', reply.charCodeAt(sanIndex + 2));
    }

    // 查找 "三、" 开头的部分（允许后面有空格，匹配到文本结束）
    // 类似场景的逻辑：场景遇到"二、"结束，角色从"三、"开始到结束
    const characterSection = reply.match(/三、\s*[\s\S]*$/);

    console.log('[Ge-extension Popup] 匹配结果:', characterSection ? '找到' : '未找到');

    if (characterSection) {
      // 提取"三、"后面的内容（保留标题）
      let characterText = characterSection[0];
      console.log('[Ge-extension Popup] 匹配到的完整内容长度:', characterText.length);
      console.log('[Ge-extension Popup] 匹配到的完整内容:', characterText);

      // 保留到最后一个句号，删除句号后问号的内容
      const lastPeriodMark = characterText.lastIndexOf('。');
      if (lastPeriodMark > -1) {
        // 检查句号后面是否有问号
        const afterPeriod = characterText.substring(lastPeriodMark + 1);
        const questionAfterPeriod = afterPeriod.indexOf('？');
        if (questionAfterPeriod > -1) {
          // 句号后面有问号，只保留到句号
          characterText = characterText.substring(0, lastPeriodMark + 1).trim();
          console.log('[Ge-extension Popup] 移除了句号后的问号内容');
        }
      }

      classifiedData.character = characterText.trim();
      console.log('[Ge-extension Popup] 最终保存的角色内容:', classifiedData.character);
      console.log('[Ge-extension Popup] 角色内容是否为空:', !classifiedData.character || classifiedData.character.length === 0);
    } else {
      console.log('[Ge-extension Popup] 未找到角色信息（没有"三、"标题）');
    }
  }

  /**
   * 处理分类标签点击
   */
  function handleCategoryTabClick(tab) {
    const category = tab.dataset.category;

    // 更新当前激活的标签页
    currentCategoryTab = category;
    console.log('[Ge-extension Popup] 切换到标签页:', category);

    // 注意：不再在切换标签时重置原始数据记录状态
    // 原始数据只在保存完成后才重置，这样用户可以在不同标签页之间切换并分别保存修改

    // 更新激活状态
    categoryTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // 显示对应分类内容
    displayCategoryContent(category);
  }

  /**
   * 保存分类内容的修改
   * 只保存当前激活的标签页的内容，避免覆盖其他标签页的最新数据
   */
  async function handleSaveClassified() {
    console.log('[Ge-extension Popup] ========== 开始保存分类内容修改 ==========');

    try {
      // 获取当前激活的标签页
      const activeTab = document.querySelector('.category-tab.active');
      const currentCategory = activeTab ? activeTab.dataset.category : null;
      console.log('[Ge-extension Popup] [保存] 当前激活标签页:', currentCategory);

      // 先从 storage 读取最新数据，避免覆盖其他标签页的修改
      const storageResult = await chrome.storage.local.get(['geStep2Config']);
      const latestConfig = storageResult.geStep2Config;
      console.log('[Ge-extension Popup] [保存] 从 storage 读取的 latestConfig 存在:', !!latestConfig);
      console.log('[Ge-extension Popup] [保存] storage 中场景数量:', latestConfig?.scenes?.length);
      console.log('[Ge-extension Popup] [保存] storage 中素材数量:', latestConfig?.materials?.length);

      // 用于保存本次修改的数据
      let updatedScenes = null;
      let updatedMaterials = null;
      let updatedCharacter = null;

      // 根据当前标签页只保存对应的内容
      if (currentCategory === 'scenes') {
        // 1. 保存场景修改
        const fullInputs = categoryDisplay.querySelectorAll('.scene-full-input');
        console.log('[Ge-extension Popup] [保存] 找到场景输入框数量:', fullInputs.length);
        // 始终使用 classifiedData 作为基础（包含新添加的项目）
        updatedScenes = JSON.parse(JSON.stringify(classifiedData.scenes));
        console.log('[Ge-extension Popup] [保存] 复制的场景数据数量:', updatedScenes.length);

        fullInputs.forEach((input, index) => {
          if (updatedScenes[index]) {
            const fullText = input.value.trim();
            console.log('[Ge-extension Popup] [保存] 场景', index + 1, 'DOM 值:', fullText.substring(0, 50) + '...');
            // 不再分割，直接把整个文本保存到 title，content 设为空
            // 因为发送时是 title + content 拼接，这样能保证发送的是用户修改后的完整内容
            updatedScenes[index].title = fullText;
            updatedScenes[index].content = '';
            console.log('[Ge-extension Popup] [保存] 场景', index + 1, '更新后 title:', updatedScenes[index].title?.substring(0, 50) + '...');
            console.log('[Ge-extension Popup] [保存] 场景', index + 1, '更新后 content: (空)');
          }
        });

        // 同步到本地 classifiedData
        classifiedData.scenes = updatedScenes;
        console.log('[Ge-extension Popup] [保存] 保存场景修改完成，数量:', updatedScenes.length);

      } else if (currentCategory === 'materials') {
        // 2. 保存素材修改
        const materialsTable = categoryDisplay.querySelector('.materials-table');
        console.log('[Ge-extension Popup] [保存] 找到素材表格:', !!materialsTable);
        // 始终使用 classifiedData 作为基础（包含新添加的项目）
        updatedMaterials = JSON.parse(JSON.stringify(classifiedData.materials));
        console.log('[Ge-extension Popup] [保存] 复制的素材数据数量:', updatedMaterials.length);

        if (materialsTable) {
          const format = materialsTable.dataset.format;
          const rows = materialsTable.querySelectorAll('tbody tr');
          console.log('[Ge-extension Popup] [保存] 表格格式:', format, '行数:', rows.length);

          rows.forEach((row, index) => {
            if (updatedMaterials[index]) {
              const cells = row.querySelectorAll('td[contenteditable="true"]');
              const material = updatedMaterials[index];

              if (format === '3col') {
                material.name = cells[0]?.textContent.trim() || '';
                material.description = cells[1]?.textContent.trim() || '';
                material.steps = cells[2]?.textContent.trim() || '';
                material.rawLine = [material.name, material.description, material.steps]
                  .filter(p => p)
                  .join('\t');
              } else {
                material.name = cells[0]?.textContent.trim() || '';
                material.initialState = cells[1]?.textContent.trim() || '';
                material.processState = cells[2]?.textContent.trim() || '';
                material.finalState = cells[3]?.textContent.trim() || '';
                material.steps = cells[4]?.textContent.trim() || '';
                material.rawLine = [material.name, material.initialState, material.processState,
                                   material.finalState, material.steps]
                  .filter(p => p)
                  .join('\t');
              }
              // 保留当前 classifiedData 中的图片数据
              if (classifiedData.materials[index]?.images) {
                material.images = classifiedData.materials[index].images;
              }
              console.log('[Ge-extension Popup] [保存] 素材', index + 1, '更新后 name:', material.name);
              console.log('[Ge-extension Popup] [保存] 素材', index + 1, '更新后 rawLine:', material.rawLine?.substring(0, 50) + '...');
              console.log('[Ge-extension Popup] [保存] 素材', index + 1, '图片数量:', material.images?.length || 0);
            }
          });
        }

        // 同步到本地 classifiedData
        classifiedData.materials = updatedMaterials;
        console.log('[Ge-extension Popup] [保存] 保存素材修改完成，数量:', updatedMaterials.length);

      } else if (currentCategory === 'character') {
        // 3. 保存角色修改 - 支持多个角色
        // 兼容旧数据：如果 character 是字符串，先转换为数组
        if (typeof classifiedData.character === 'string') {
          const oldCharacter = classifiedData.character;
          classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
          classifiedData.characterImages = undefined;
        }
        if (!Array.isArray(classifiedData.character)) {
          classifiedData.character = [];
        }

        const characterInputs = categoryDisplay.querySelectorAll('.character-content-input');
        console.log('[Ge-extension Popup] [保存] 找到角色输入框数量:', characterInputs.length);
        console.log('[Ge-extension Popup] [保存] classifiedData.character 数量:', classifiedData.character.length);

        // 始终使用 classifiedData 作为基础（包含新添加的角色）
        updatedCharacter = JSON.parse(JSON.stringify(classifiedData.character));
        console.log('[Ge-extension Popup] [保存] 复制的角色数据数量:', updatedCharacter.length);

        // 确保 updatedCharacter 数组长度与输入框数量一致
        while (updatedCharacter.length < characterInputs.length) {
          updatedCharacter.push({ content: '', images: [] });
        }

        characterInputs.forEach((input, index) => {
          if (updatedCharacter[index]) {
            updatedCharacter[index].content = input.value.trim();
            console.log('[Ge-extension Popup] [保存] 角色', index + 1, '内容:', updatedCharacter[index].content.substring(0, 30) + '...');
          }
        });

        // 移除多余的角色（如果输入框被删除）
        updatedCharacter = updatedCharacter.slice(0, characterInputs.length);

        // 同步到本地 classifiedData
        classifiedData.character = updatedCharacter;

        console.log('[Ge-extension Popup] [保存] 保存角色修改完成，数量:', updatedCharacter.length);
      }

      // 4. 检测哪些内容被修改了（用于智能恢复）
      // 使用编辑开始时记录的原始数据进行比较，避免和 storage 的竞态条件
      let modifiedSceneIndex = -1;  // 最早被修改的场景索引
      let modifiedMaterialIndex = -1;  // 最早被修改的素材索引
      let modifiedCharacter = false;  // 角色是否被修改

      // 检测场景修改 - 使用编辑开始时的原始数据
      if (updatedScenes !== null && originalContentOnEdit.scenes) {
        for (let i = 0; i < updatedScenes.length; i++) {
          const original = originalContentOnEdit.scenes[i];
          const modified = updatedScenes[i];
          if (original && modified) {
            // 比较 title（因为 content 现在都是空的）
            const originalText = (original.title || '') + ' ' + (original.content || '');
            const modifiedText = (modified.title || '') + ' ' + (modified.content || '');
            console.log('[Ge-extension Popup] [保存] 场景', i + 1, '原始文本:', originalText.trim().substring(0, 30) + '...');
            console.log('[Ge-extension Popup] [保存] 场景', i + 1, '修改文本:', modifiedText.trim().substring(0, 30) + '...');
            if (originalText.trim() !== modifiedText.trim()) {
              console.log('[Ge-extension Popup] [保存] 检测到场景', i + 1, '被修改');
              if (modifiedSceneIndex === -1 || i < modifiedSceneIndex) {
                modifiedSceneIndex = i;
              }
            }
          }
        }
      } else if (updatedScenes !== null) {
        console.log('[Ge-extension Popup] [保存] 没有记录原始场景数据，无法检测修改');
      }

      // 检测素材修改 - 使用编辑开始时的原始数据
      if (updatedMaterials !== null && originalContentOnEdit.materials) {
        for (let i = 0; i < updatedMaterials.length; i++) {
          const original = originalContentOnEdit.materials[i];
          const modified = updatedMaterials[i];
          if (original && modified) {
            // 检测文本变化
            const textChanged = (original.rawLine || '') !== (modified.rawLine || '');
            console.log('[Ge-extension Popup] [保存] 素材', i + 1, '文本变化:', textChanged);

            // 检测图片变化
            const originalImages = original.images || [];
            const modifiedImages = modified.images || [];
            let imagesChanged = false;

            if (originalImages.length !== modifiedImages.length) {
              imagesChanged = true;
            } else {
              // 比较每张图片的内容
              for (let j = 0; j < originalImages.length; j++) {
                if (originalImages[j] !== modifiedImages[j]) {
                  imagesChanged = true;
                  break;
                }
              }
            }
            console.log('[Ge-extension Popup] [保存] 素材', i + 1, '图片变化:', imagesChanged, '(原始:', originalImages.length, '张, 修改后:', modifiedImages.length, '张)');

            // 文本或图片有变化就标记为已修改
            if (textChanged || imagesChanged) {
              const changeTypes = [];
              if (textChanged) changeTypes.push('文本');
              if (imagesChanged) changeTypes.push('图片');
              console.log('[Ge-extension Popup] [保存] 检测到素材', i + 1, '被修改 (' + changeTypes.join('+') + ')');
              if (modifiedMaterialIndex === -1 || i < modifiedMaterialIndex) {
                modifiedMaterialIndex = i;
              }
            }
          }
        }
      } else if (updatedMaterials !== null) {
        console.log('[Ge-extension Popup] [保存] 没有记录原始素材数据，无法检测修改');
      }

      // 检测角色修改 - 使用编辑开始时的原始数据
      if (updatedCharacter !== null && originalContentOnEdit.character !== null) {
        // 比较角色数组
        const originalChars = originalContentOnEdit.character;
        const modifiedChars = updatedCharacter;

        let characterChanged = false;

        // 比较数量
        if (originalChars.length !== modifiedChars.length) {
          characterChanged = true;
          console.log('[Ge-extension Popup] [保存] 角色数量变化:', originalChars.length, '->', modifiedChars.length);
        } else {
          // 比较每个角色的内容和图片
          for (let i = 0; i < originalChars.length; i++) {
            const orig = originalChars[i];
            const mod = modifiedChars[i];
            if (!orig || !mod) {
              characterChanged = true;
              break;
            }
            if (orig.content !== mod.content) {
              characterChanged = true;
              console.log('[Ge-extension Popup] [保存] 角色', i + 1, '内容变化');
              break;
            }
            // 比较图片
            const origImages = orig.images || [];
            const modImages = mod.images || [];
            if (origImages.length !== modImages.length) {
              characterChanged = true;
              console.log('[Ge-extension Popup] [保存] 角色', i + 1, '图片数量变化:', origImages.length, '->', modImages.length);
              break;
            }
            for (let j = 0; j < origImages.length; j++) {
              if (origImages[j] !== modImages[j]) {
                characterChanged = true;
                console.log('[Ge-extension Popup] [保存] 角色', i + 1, '图片', j + 1, '变化');
                break;
              }
            }
            if (characterChanged) break;
          }
        }

        if (characterChanged) {
          modifiedCharacter = true;
          console.log('[Ge-extension Popup] [保存] 检测到角色被修改');
        }
      } else if (updatedCharacter !== null) {
        console.log('[Ge-extension Popup] [保存] 没有记录原始角色数据，无法检测修改');
      }

      console.log('[Ge-extension Popup] [保存] 修改检测结果: modifiedSceneIndex=' + modifiedSceneIndex + ', modifiedMaterialIndex=' + modifiedMaterialIndex + ', modifiedCharacter=' + modifiedCharacter);

      // 重置原始数据记录状态，以便下次编辑时重新记录
      hasRecordedOriginal = {
        scenes: false,
        materials: false,
        character: false
      };
      originalContentOnEdit = {
        scenes: null,
        materials: null,
        character: null
      };
      console.log('[Ge-extension Popup] [保存] 已重置原始数据记录状态');

      // 保存修改信息到 storage
      const modifyInfo = {
        modifiedSceneIndex,
        modifiedMaterialIndex,
        modifiedCharacter,
        timestamp: Date.now()
      };
      await chrome.storage.local.set({ geModifyInfo: modifyInfo });
      console.log('[Ge-extension Popup] [保存] 修改信息:', modifyInfo);

      // 5. 更新 storage 中的配置（只更新有修改的字段）
      // 如果 latestConfig 不存在，从 classifiedData 创建配置对象，并设置 state 为 waiting_start
      // waiting_start 表示数据已准备好，等待用户点击"开始第二步"
      let configToSave = latestConfig || {
        state: 'waiting_start',  // 等待开始第二步，不是 completed
        scenes: classifiedData.scenes,
        materials: classifiedData.materials,
        character: classifiedData.character,
        sceneSetting: classifiedData.sceneSetting || '',
        materialSetting: classifiedData.materialSetting || ''
      };

      if (updatedScenes !== null) {
        configToSave.scenes = updatedScenes;
        console.log('[Ge-extension Popup] [保存] 将更新 scenes 到 storage');
      }
      if (updatedMaterials !== null) {
        configToSave.materials = updatedMaterials;
        console.log('[Ge-extension Popup] [保存] 将更新 materials 到 storage');
      }
      if (updatedCharacter !== null) {
        configToSave.character = updatedCharacter;
        console.log('[Ge-extension Popup] [保存] 将更新 character 到 storage');
      }

      await chrome.storage.local.set({ geStep2Config: configToSave });
      console.log('[Ge-extension Popup] [保存] 已写入 geStep2Config');

      // 同时更新 geTaskHistory 中的任务记录（用于重做时读取最新数据）
      const taskHistory = await chrome.storage.local.get(['geCurrentTaskId', 'geTaskHistory']);
      const currentTaskId = taskHistory.geCurrentTaskId;
      const tasks = taskHistory.geTaskHistory || [];
      const taskIndex = tasks.findIndex(t => t.taskId === currentTaskId);

      if (taskIndex !== -1) {
        // 更新 bot3 的场景数据
        if (updatedScenes !== null) {
          tasks[taskIndex].bots.bot3 = {
            ...tasks[taskIndex].bots.bot3,
            scenes: updatedScenes,
            sceneSetting: classifiedData.sceneSetting || tasks[taskIndex].bots.bot3?.sceneSetting || ''
          };
          console.log('[Ge-extension Popup] [保存] 已更新 geTaskHistory 中 bot3.scenes');
        }

        // 更新 bot4 的素材数据
        if (updatedMaterials !== null) {
          tasks[taskIndex].bots.bot4 = {
            ...tasks[taskIndex].bots.bot4,
            materials: updatedMaterials,
            materialSetting: classifiedData.materialSetting || tasks[taskIndex].bots.bot4?.materialSetting || ''
          };
          console.log('[Ge-extension Popup] [保存] 已更新 geTaskHistory 中 bot4.materials');
        }

        // 更新 bot5 的角色数据
        if (updatedCharacter !== null) {
          tasks[taskIndex].bots.bot5 = {
            ...tasks[taskIndex].bots.bot5,
            character: updatedCharacter
          };
          console.log('[Ge-extension Popup] [保存] 已更新 geTaskHistory 中 bot5.character');
        }

        // 保存更新后的任务历史
        await chrome.storage.local.set({ geTaskHistory: tasks });
        console.log('[Ge-extension Popup] [保存] geTaskHistory 已更新');
      } else {
        console.log('[Ge-extension Popup] [保存] 未找到当前任务，无法更新 geTaskHistory');
      }

      // 验证写入结果
      const verifyResult = await chrome.storage.local.get(['geStep2Config']);
      console.log('[Ge-extension Popup] [保存] 验证 - storage 中场景数量:', verifyResult.geStep2Config?.scenes?.length);
      console.log('[Ge-extension Popup] [保存] 验证 - storage 中素材数量:', verifyResult.geStep2Config?.materials?.length);
      console.log('[Ge-extension Popup] [保存] 验证 - storage 中角色数量:', verifyResult.geStep2Config?.character?.length);
      if (currentCategory === 'scenes' && verifyResult.geStep2Config?.scenes?.length > 0) {
        console.log('[Ge-extension Popup] [保存] 验证 - 第一个场景 title:', verifyResult.geStep2Config.scenes[0].title?.substring(0, 50) + '...');
      }
      if (currentCategory === 'materials' && verifyResult.geStep2Config?.materials?.length > 0) {
        console.log('[Ge-extension Popup] [保存] 验证 - 第一个素材 rawLine:', verifyResult.geStep2Config.materials[0].rawLine?.substring(0, 50) + '...');
      }
      if (currentCategory === 'character' && verifyResult.geStep2Config?.character?.length > 0) {
        console.log('[Ge-extension Popup] [保存] 验证 - 第一个角色 content:', verifyResult.geStep2Config.character[0].content?.substring(0, 50) + '...');
      }

      // 5. 显示保存成功提示
      const originalText = saveClassifiedBtn.innerHTML;
      saveClassifiedBtn.innerHTML = '<span class="btn-icon">✓</span> 已保存';
      setTimeout(() => {
        saveClassifiedBtn.innerHTML = originalText;
      }, 2000);

      console.log('[Ge-extension Popup] 分类内容已保存');

      // 显示场景设置和素材角色设置框
      aspectRatioSection.classList.remove('hidden');
      materialSettingSection.classList.remove('hidden');
      // 加载已保存的设置
      loadAspectRatio();
      loadMaterialSetting();

      // 保存完成后更新 UI，确保按钮状态正确
      updateRelayUI();

    } catch (error) {
      console.error('[Ge-extension Popup] 保存失败:', error);
      alert('保存失败: ' + error.message);
    }
  }

  /**
   * 渲染素材图片缩略图
   */
  function renderImageThumbnails(images, materialIndex) {
    if (!images || images.length === 0) {
      return '';
    }
    return images.map((img, imgIndex) => `
      <div class="image-thumbnail" data-material-index="${materialIndex}" data-img-index="${imgIndex}">
        <img src="${img}" alt="素材图片">
        <div class="image-delete-btn" data-material-index="${materialIndex}" data-img-index="${imgIndex}" title="删除图片">×</div>
      </div>
    `).join('');
  }

  /**
   * 渲染角色图片缩略图
   */
  function renderCharacterImageThumbnails(charIndex = 0) {
    // 兼容旧数据和新数据
    let images = [];
    if (Array.isArray(classifiedData.character) && classifiedData.character[charIndex]) {
      // 新格式：character 是数组，每个元素有 images
      images = classifiedData.character[charIndex].images || [];
    } else if (classifiedData.characterImages) {
      // 旧格式：characterImages 是独立数组
      images = classifiedData.characterImages;
    }

    if (images.length === 0) {
      return '';
    }
    return images.map((img, imgIndex) => `
      <div class="image-thumbnail character-image-thumbnail" data-char-index="${charIndex}" data-img-index="${imgIndex}">
        <img src="${img}" alt="角色参考图">
        <div class="image-delete-btn character-image-delete-btn" data-char-index="${charIndex}" data-img-index="${imgIndex}" title="删除图片">×</div>
      </div>
    `).join('');
  }

  /**
   * 显示分类内容（可编辑版本）
   */
  function displayCategoryContent(category) {
    let html = '';

    if (category === 'scenes') {
      // 显示场景 - 可编辑
      html = classifiedData.scenes.map((scene, index) => {
        // 优先显示 title（用户修改后的完整内容），如果为空则显示 content
        const displayContent = scene.title || scene.content || '';
        return `
          <div class="scene-card">
            <div class="scene-card-header">
              <div class="scene-number">场景 ${index + 1}</div>
              <button class="delete-item-btn" data-category="scenes" data-index="${index}" title="删除">×</button>
            </div>
            <textarea class="scene-full-input" data-index="${index}" rows="4">${escapeHtml(displayContent)}</textarea>
          </div>
        `;
      }).join('');

      if (!html) {
        html = '<p style="color: #999; font-size: 11px;">暂无场景信息</p>';
      }

      // 添加"批量粘贴"和"添加场景"按钮
      html += `
        <div class="scene-action-buttons">
          <button class="batch-paste-btn" id="batchPasteScenesBtn">📋 批量粘贴</button>
          <button class="add-item-btn" data-category="scenes">+ 添加场景</button>
        </div>
      `;
    } else if (category === 'materials') {
      // 显示素材清单 - 智能判断数据格式
      if (classifiedData.materials.length > 0) {
        // 检测数据格式：如果第一个素材的 description 有值但 initialState/processState/finalState 都是空，说明是 3 列格式
        const firstMaterial = classifiedData.materials[0];
        const isThreeColumnFormat = firstMaterial.description &&
                                   !firstMaterial.initialState &&
                                   !firstMaterial.processState &&
                                   !firstMaterial.finalState;

        if (isThreeColumnFormat) {
          // 3列格式：素材名 | 状态清单 | 步骤 | 图片 | 删除 - 可编辑
          html = `
            <table class="materials-table" data-format="3col">
              <tbody>
                ${classifiedData.materials.map((m, index) => `
                  <tr data-index="${index}">
                    <td contenteditable="true" data-field="name">${escapeHtml(m.name)}</td>
                    <td contenteditable="true" data-field="description">${escapeHtml(m.description || '')}</td>
                    <td contenteditable="true" data-field="steps">${escapeHtml(m.steps || '')}</td>
                    <td class="image-cell" data-field="images" data-index="${index}">
                      <div class="image-container" data-index="${index}">
                        ${renderImageThumbnails(m.images, index)}
                        <div class="image-add-btn" data-index="${index}" title="点击或粘贴添加图片">+</div>
                      </div>
                    </td>
                    <td class="delete-cell">
                      <button class="delete-row-btn" data-category="materials" data-index="${index}" title="删除">×</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        } else {
          // 4+列格式：素材名 | 初始状态 | 过程状态 | 最终状态 | 步骤 | 图片 | 删除 - 可编辑
          html = `
            <table class="materials-table" data-format="multicol">
              <tbody>
                ${classifiedData.materials.map((m, index) => `
                  <tr data-index="${index}">
                    <td contenteditable="true" data-field="name">${escapeHtml(m.name)}</td>
                    <td contenteditable="true" data-field="initialState">${escapeHtml(m.initialState || '')}</td>
                    <td contenteditable="true" data-field="processState">${escapeHtml(m.processState || '')}</td>
                    <td contenteditable="true" data-field="finalState">${escapeHtml(m.finalState || '')}</td>
                    <td contenteditable="true" data-field="steps">${escapeHtml(m.steps || '')}</td>
                    <td class="image-cell" data-field="images" data-index="${index}">
                      <div class="image-container" data-index="${index}">
                        ${renderImageThumbnails(m.images, index)}
                        <div class="image-add-btn" data-index="${index}" title="点击或粘贴添加图片">+</div>
                      </div>
                    </td>
                    <td class="delete-cell">
                      <button class="delete-row-btn" data-category="materials" data-index="${index}" title="删除">×</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
      }

      if (!classifiedData.materials.length) {
        html = '<p style="color: #999; font-size: 11px;">暂无素材信息</p>';
      }

      // 添加"添加素材"按钮
      html += '<button class="add-item-btn" data-category="materials">+ 添加素材</button>';
    } else if (category === 'character') {
      // 显示角色 - 可编辑，带图片功能
      // 兼容旧数据：如果 character 是字符串，转换为数组
      if (typeof classifiedData.character === 'string') {
        const oldCharacter = classifiedData.character;
        classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
        classifiedData.characterImages = undefined; // 清除旧字段
      }
      // 确保 character 是数组
      if (!Array.isArray(classifiedData.character)) {
        classifiedData.character = [];
      }

      if (classifiedData.character.length > 0) {
        html = classifiedData.character.map((char, index) => `
          <div class="character-card" data-index="${index}">
            <div class="character-card-header">
              <div class="character-title">角色 ${index + 1}</div>
              <button class="delete-item-btn" data-category="character" data-index="${index}" title="删除">×</button>
            </div>
            <textarea class="character-content-input" data-index="${index}" rows="4">${escapeHtml(char.content || '')}</textarea>
            <div class="character-images-section">
              <div class="character-images-label">参考图片</div>
              <div class="character-image-container" data-char-index="${index}">
                ${renderCharacterImageThumbnails(index)}
                <div class="character-image-add-btn" data-char-index="${index}" title="点击或粘贴添加图片">+</div>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        html = '<p style="color: #999; font-size: 11px;">暂无角色信息</p>';
      }

      // 添加"添加角色"按钮
      html += '<button class="add-item-btn" data-category="character">+ 添加角色</button>';
    }

    categoryDisplay.innerHTML = html;

    // 为 textarea 添加 focus 事件监听器，记录编辑前的原始值
    if (category === 'scenes') {
      const textareas = categoryDisplay.querySelectorAll('.scene-full-input');
      textareas.forEach((textarea, index) => {
        textarea.addEventListener('focus', () => {
          // 只在第一次 focus 时记录原始值
          if (!hasRecordedOriginal.scenes) {
            originalContentOnEdit.scenes = classifiedData.scenes.map(s => ({
              title: s.title || '',
              content: s.content || ''
            }));
            hasRecordedOriginal.scenes = true;
            console.log('[Ge-extension Popup] [编辑开始] 已记录场景原始数据，数量:', originalContentOnEdit.scenes.length);
          }
        });
      });
    } else if (category === 'materials') {
      const table = categoryDisplay.querySelector('.materials-table');
      if (table) {
        const cells = table.querySelectorAll('td[contenteditable="true"]');
        cells.forEach(cell => {
          cell.addEventListener('focus', recordMaterialsOriginalData);
        });
      }

      // 绑定图片相关事件
      bindImageEvents();

      // 如果还没有记录原始数据，立即记录一份（这样即使直接保存也有原始数据可比较）
      if (!hasRecordedOriginal.materials) {
        recordMaterialsOriginalData();
      }

    } else if (category === 'character') {
      // 兼容旧数据：如果 character 是字符串，先转换为数组
      if (typeof classifiedData.character === 'string') {
        const oldCharacter = classifiedData.character;
        classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
        classifiedData.characterImages = undefined;
      }
      if (!Array.isArray(classifiedData.character)) {
        classifiedData.character = [];
      }

      const characterInputs = categoryDisplay.querySelectorAll('.character-content-input');
      characterInputs.forEach(input => {
        // 参考素材部分的做法，focus 时直接调用函数
        input.addEventListener('focus', recordCharacterOriginalData);
      });

      // 绑定角色图片相关事件
      bindCharacterImageEvents();

      // 如果还没有记录原始数据，立即记录一份（这样即使直接保存也有原始数据可比较）
      if (!hasRecordedOriginal.character) {
        recordCharacterOriginalData();
      }
    }

    // 绑定"添加"按钮事件
    bindAddItemEvents();
  }

  /**
   * 记录素材原始数据（用于后续检测修改）
   */
  function recordMaterialsOriginalData() {
    // 只在第一次时记录原始值
    if (!hasRecordedOriginal.materials) {
      originalContentOnEdit.materials = classifiedData.materials.map(m => ({
        rawLine: m.rawLine || '',
        name: m.name || '',
        description: m.description || '',
        steps: m.steps || '',
        initialState: m.initialState || '',
        processState: m.processState || '',
        finalState: m.finalState || '',
        images: m.images ? [...m.images] : []  // 复制图片数组
      }));
      hasRecordedOriginal.materials = true;
      console.log('[Ge-extension Popup] [编辑开始] 已记录素材原始数据，数量:', originalContentOnEdit.materials.length);
    }
  }

  /**
   * 绑定图片相关事件（粘贴、点击添加、删除）
   */
  function bindImageEvents() {
    // 1. 为图片添加按钮绑定点击事件
    const addBtns = categoryDisplay.querySelectorAll('.image-add-btn');
    addBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        recordMaterialsOriginalData();  // 记录原始数据
        const materialIndex = parseInt(btn.dataset.index);
        createFileInput(materialIndex);
      });
    });

    // 2. 为删除按钮绑定点击事件
    const deleteBtns = categoryDisplay.querySelectorAll('.image-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        recordMaterialsOriginalData();  // 记录原始数据
        const materialIndex = parseInt(btn.dataset.materialIndex);
        const imgIndex = parseInt(btn.dataset.imgIndex);
        deleteImage(materialIndex, imgIndex);
      });
    });

    // 3. 为图片单元格绑定粘贴事件
    const imageCells = categoryDisplay.querySelectorAll('.image-cell');
    imageCells.forEach(cell => {
      cell.addEventListener('paste', handleImagePaste);
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });
      cell.addEventListener('drop', handleImageDrop);
    });
  }

  /**
   * 创建隐藏的文件输入框并触发选择
   */
  function createFileInput(materialIndex) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        if (file.type.startsWith('image/')) {
          addImageToMaterial(materialIndex, file);
        }
      });
      document.body.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();
  }

  /**
   * 处理图片粘贴事件
   */
  function handleImagePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    recordMaterialsOriginalData();  // 记录原始数据

    const materialIndex = parseInt(e.currentTarget.dataset.index);

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addImageToMaterial(materialIndex, file);
        }
        break;
      }
    }
  }

  /**
   * 处理图片拖放事件
   */
  function handleImageDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    recordMaterialsOriginalData();  // 记录原始数据

    const materialIndex = parseInt(e.currentTarget.dataset.index);
    const files = Array.from(e.dataTransfer.files);

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        addImageToMaterial(materialIndex, file);
      }
    });
  }

  /**
   * 添加图片到素材
   */
  function addImageToMaterial(materialIndex, file) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;

      // 确保 images 数组存在
      if (!classifiedData.materials[materialIndex].images) {
        classifiedData.materials[materialIndex].images = [];
      }

      // 添加图片
      classifiedData.materials[materialIndex].images.push(base64);

      // 更新 UI
      updateImageCell(materialIndex);

      console.log('[Ge-extension Popup] 已添加图片到素材', materialIndex + 1, '当前图片数:', classifiedData.materials[materialIndex].images.length);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 删除图片
   */
  function deleteImage(materialIndex, imgIndex) {
    if (classifiedData.materials[materialIndex]?.images) {
      classifiedData.materials[materialIndex].images.splice(imgIndex, 1);
      updateImageCell(materialIndex);
      console.log('[Ge-extension Popup] 已删除素材', materialIndex + 1, '的第', imgIndex + 1, '张图片');
    }
  }

  /**
   * 更新图片单元格显示
   */
  function updateImageCell(materialIndex) {
    const cell = categoryDisplay.querySelector(`.image-cell[data-index="${materialIndex}"]`);
    if (cell) {
      const container = cell.querySelector('.image-container');
      if (container) {
        container.innerHTML = `
          ${renderImageThumbnails(classifiedData.materials[materialIndex].images, materialIndex)}
          <div class="image-add-btn" data-index="${materialIndex}" title="点击或粘贴添加图片">+</div>
        `;
        // 重新绑定事件
        const addBtn = container.querySelector('.image-add-btn');
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          createFileInput(materialIndex);
        });

        const deleteBtns = container.querySelectorAll('.image-delete-btn');
        deleteBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const imgIndex = parseInt(btn.dataset.imgIndex);
            deleteImage(materialIndex, imgIndex);
          });
        });
      }
    }
  }

  // ========== 角色图片相关函数 ==========

  /**
   * 绑定角色图片相关事件（粘贴、点击添加、删除）
   */
  function bindCharacterImageEvents() {
    // 1. 为图片添加按钮绑定点击事件（支持多个角色）
    const addBtns = categoryDisplay.querySelectorAll('.character-image-add-btn');
    addBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        recordCharacterOriginalData();  // 记录原始数据
        const charIndex = parseInt(btn.dataset.charIndex || '0');
        createCharacterFileInput(charIndex);
      });
    });

    // 2. 为删除按钮绑定点击事件（支持多个角色）
    const deleteBtns = categoryDisplay.querySelectorAll('.character-image-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        recordCharacterOriginalData();  // 记录原始数据
        const charIndex = parseInt(btn.dataset.charIndex || '0');
        const imgIndex = parseInt(btn.dataset.imgIndex);
        deleteCharacterImage(charIndex, imgIndex);
      });
    });

    // 3. 为图片容器绑定粘贴和拖放事件（支持多个角色）
    const imageContainers = categoryDisplay.querySelectorAll('.character-image-container');
    imageContainers.forEach(container => {
      const charIndex = parseInt(container.dataset.charIndex || '0');
      container.addEventListener('paste', (e) => handleCharacterImagePaste(e, charIndex));
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
      });
      container.addEventListener('dragleave', () => {
        container.classList.remove('drag-over');
      });
      container.addEventListener('drop', (e) => handleCharacterImageDrop(e, charIndex));
    });
  }

  /**
   * 绑定"添加场景/素材"按钮事件
   */
  function bindAddItemEvents() {
    const addBtns = categoryDisplay.querySelectorAll('.add-item-btn');
    addBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const category = btn.dataset.category;
        handleAddItem(category);
      });
    });

    // 绑定"批量粘贴场景"按钮事件
    const batchPasteBtn = document.getElementById('batchPasteScenesBtn');
    if (batchPasteBtn) {
      batchPasteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showBatchPasteScenesDialog();
      });
    }

    // 绑定删除按钮事件
    bindDeleteItemEvents();
  }

  /**
   * 绑定删除按钮事件
   */
  function bindDeleteItemEvents() {
    // 删除场景按钮
    const deleteSceneBtns = categoryDisplay.querySelectorAll('.delete-item-btn[data-category="scenes"]');
    deleteSceneBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        handleDeleteItem('scenes', index);
      });
    });

    // 删除素材按钮
    const deleteMaterialBtns = categoryDisplay.querySelectorAll('.delete-row-btn[data-category="materials"]');
    deleteMaterialBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        handleDeleteItem('materials', index);
      });
    });

    // 删除角色按钮
    const deleteCharacterBtns = categoryDisplay.querySelectorAll('.delete-item-btn[data-category="character"]');
    deleteCharacterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        handleDeleteItem('character', index);
      });
    });
  }

  /**
   * 处理删除场景/素材/角色
   */
  function handleDeleteItem(category, index) {
    if (category === 'scenes') {
      // 记录原始数据
      if (!hasRecordedOriginal.scenes) {
        originalContentOnEdit.scenes = classifiedData.scenes.map(s => ({
          title: s.title || '',
          content: s.content || ''
        }));
        hasRecordedOriginal.scenes = true;
      }

      // 删除场景
      classifiedData.scenes.splice(index, 1);

      // 重新渲染
      displayCategoryContent('scenes');
      console.log('[Ge-extension Popup] 已删除场景', index + 1, '，剩余数量:', classifiedData.scenes.length);

    } else if (category === 'materials') {
      // 记录原始数据
      if (!hasRecordedOriginal.materials) {
        originalContentOnEdit.materials = classifiedData.materials.map(m => ({
          rawLine: m.rawLine || '',
          name: m.name || '',
          description: m.description || '',
          steps: m.steps || '',
          initialState: m.initialState || '',
          processState: m.processState || '',
          finalState: m.finalState || '',
          images: m.images ? [...m.images] : []
        }));
        hasRecordedOriginal.materials = true;
      }

      // 删除素材
      classifiedData.materials.splice(index, 1);

      // 重新渲染
      displayCategoryContent('materials');
      console.log('[Ge-extension Popup] 已删除素材', index + 1, '，剩余数量:', classifiedData.materials.length);

    } else if (category === 'character') {
      // 记录原始数据
      if (!hasRecordedOriginal.character) {
        originalContentOnEdit.character = classifiedData.character.map(c => ({
          content: c.content || '',
          images: c.images ? [...c.images] : []
        }));
        hasRecordedOriginal.character = true;
      }

      // 删除角色
      classifiedData.character.splice(index, 1);

      // 重新渲染
      displayCategoryContent('character');
      console.log('[Ge-extension Popup] 已删除角色', index + 1, '，剩余数量:', classifiedData.character.length);
    }
  }

  /**
   * 处理添加场景/素材
   */
  function handleAddItem(category) {
    if (category === 'scenes') {
      // 记录原始数据
      if (!hasRecordedOriginal.scenes) {
        originalContentOnEdit.scenes = classifiedData.scenes.map(s => ({
          title: s.title || '',
          content: s.content || ''
        }));
        hasRecordedOriginal.scenes = true;
      }

      // 添加新场景
      classifiedData.scenes.push({
        title: '',
        content: ''
      });

      // 重新渲染
      displayCategoryContent('scenes');
      console.log('[Ge-extension Popup] 已添加新场景，当前数量:', classifiedData.scenes.length);

    } else if (category === 'materials') {
      // 记录原始数据
      if (!hasRecordedOriginal.materials) {
        originalContentOnEdit.materials = classifiedData.materials.map(m => ({
          rawLine: m.rawLine || '',
          name: m.name || '',
          description: m.description || '',
          steps: m.steps || '',
          initialState: m.initialState || '',
          processState: m.processState || '',
          finalState: m.finalState || '',
          images: m.images ? [...m.images] : []
        }));
        hasRecordedOriginal.materials = true;
      }

      // 显示批量添加对话框
      showBatchAddMaterialsDialog();

    } else if (category === 'character') {
      // 兼容旧数据：如果 character 是字符串，先转换为数组
      if (typeof classifiedData.character === 'string') {
        const oldCharacter = classifiedData.character;
        classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
        classifiedData.characterImages = undefined;
      }
      if (!Array.isArray(classifiedData.character)) {
        classifiedData.character = [];
      }

      // 记录原始数据
      if (!hasRecordedOriginal.character) {
        originalContentOnEdit.character = classifiedData.character.map(c => ({
          content: c.content || '',
          images: c.images ? [...c.images] : []
        }));
        hasRecordedOriginal.character = true;
      }

      // 添加新角色
      classifiedData.character.push({
        content: '',
        images: []
      });

      // 重新渲染
      displayCategoryContent('character');
      console.log('[Ge-extension Popup] 已添加新角色，当前数量:', classifiedData.character.length);
    }
  }

  /**
   * 显示批量添加素材对话框
   */
  function showBatchAddMaterialsDialog() {
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'batch-add-dialog';
    dialog.innerHTML = `
      <div class="batch-add-overlay"></div>
      <div class="batch-add-content">
        <div class="batch-add-title">批量添加素材</div>
        <div class="batch-add-hint">请粘贴表格数据（从 Excel 复制，每行一个素材，用 Tab 分隔列）</div>
        <textarea class="batch-add-textarea" rows="10" placeholder="素材名&#9;状态清单&#9;步骤
素材1&#9;状态描述1&#9;步骤1
素材2&#9;状态描述2&#9;步骤2"></textarea>
        <div class="batch-add-buttons">
          <button class="batch-add-cancel-btn">取消</button>
          <button class="batch-add-confirm-btn">添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // 获取元素
    const overlay = dialog.querySelector('.batch-add-overlay');
    const textarea = dialog.querySelector('.batch-add-textarea');
    const cancelBtn = dialog.querySelector('.batch-add-cancel-btn');
    const confirmBtn = dialog.querySelector('.batch-add-confirm-btn');

    // 关闭对话框
    function closeDialog() {
      document.body.removeChild(dialog);
    }

    overlay.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);

    // 确认添加
    confirmBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        alert('请输入素材数据');
        return;
      }

      // 按行分割
      const lines = text.split('\n').filter(line => line.trim());

      // 解析每行数据
      lines.forEach(line => {
        const parts = line.split('\t');
        const material = {
          name: parts[0]?.trim() || '未命名素材',
          description: parts[1]?.trim() || '',
          steps: parts[2]?.trim() || '',
          initialState: '',
          processState: '',
          finalState: '',
          images: []
        };
        classifiedData.materials.push(material);
      });

      closeDialog();

      // 重新渲染
      displayCategoryContent('materials');
      console.log('[Ge-extension Popup] 已批量添加素材，数量:', lines.length, '，当前总数:', classifiedData.materials.length);
    });

    // 聚焦到 textarea
    setTimeout(() => textarea.focus(), 100);
  }

  /**
   * 显示批量粘贴场景对话框
   */
  function showBatchPasteScenesDialog() {
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'batch-add-dialog';
    dialog.innerHTML = `
      <div class="batch-add-overlay"></div>
      <div class="batch-add-content">
        <div class="batch-add-title">批量粘贴场景</div>
        <div class="batch-add-hint">请粘贴场景文本，系统会自动识别"场景 1："、"场景 2："等标记来分割</div>
        <textarea class="batch-add-textarea" rows="15" placeholder="场景 1：备菜准备
构图简述：...
初始状态：...

场景 2：切配与炒制
构图简述：...
初始状态：..."></textarea>
        <div class="batch-add-buttons">
          <button class="batch-add-cancel-btn">取消</button>
          <button class="batch-add-confirm-btn">确认添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const overlay = dialog.querySelector('.batch-add-overlay');
    const textarea = dialog.querySelector('.batch-add-textarea');
    const cancelBtn = dialog.querySelector('.batch-add-cancel-btn');
    const confirmBtn = dialog.querySelector('.batch-add-confirm-btn');

    // 关闭对话框的函数
    function closeDialog() {
      document.body.removeChild(dialog);
    }

    // 点击遮罩关闭
    overlay.addEventListener('click', closeDialog);

    // 取消按钮
    cancelBtn.addEventListener('click', closeDialog);

    // 确认按钮
    confirmBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        alert('请输入场景内容');
        return;
      }

      // 记录原始数据
      if (!hasRecordedOriginal.scenes) {
        originalContentOnEdit.scenes = classifiedData.scenes.map(s => ({
          title: s.title || '',
          content: s.content || ''
        }));
        hasRecordedOriginal.scenes = true;
      }

      // 解析场景文本，按"场景 N："分割
      const sceneRegex = /场景\s*(\d+)[：:]\s*/g;
      const parts = text.split(sceneRegex);

      // parts 格式：[前置文本, '1', 场景1内容, '2', 场景2内容, ...]
      // 跳过第一个元素（前置文本），然后每两个元素组成一个场景
      let addedCount = 0;
      for (let i = 1; i < parts.length; i += 2) {
        const sceneNum = parts[i];
        const sceneContent = parts[i + 1]?.trim();

        if (sceneContent) {
          // 构建完整的场景内容（包含"场景 N："标题）
          const fullContent = `场景 ${sceneNum}：${sceneContent}`;
          classifiedData.scenes.push({
            title: fullContent,
            content: ''
          });
          addedCount++;
        }
      }

      closeDialog();

      // 重新渲染
      displayCategoryContent('scenes');
      console.log('[Ge-extension Popup] 已批量添加场景，数量:', addedCount, '，当前总数:', classifiedData.scenes.length);

      if (addedCount > 0) {
        relayHint.textContent = `已添加 ${addedCount} 个场景`;
        setTimeout(() => {
          relayHint.textContent = '点击"开始第二步"后，请检查回复信息';
        }, 2000);
      } else {
        alert('未能识别到场景内容，请确保文本包含"场景 1："、"场景 2："等标记');
      }
    });

    // 聚焦到 textarea
    setTimeout(() => textarea.focus(), 100);
  }

  /**
   * 记录角色原始数据（用于后续检测修改）
   */
  function recordCharacterOriginalData() {
    // 只在第一次时记录原始值
    if (!hasRecordedOriginal.character) {
      // 兼容旧数据：如果 character 是字符串，先转换为数组
      if (typeof classifiedData.character === 'string') {
        const oldCharacter = classifiedData.character;
        classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
        classifiedData.characterImages = undefined;
      }
      if (!Array.isArray(classifiedData.character)) {
        classifiedData.character = [];
      }

      // 记录每个角色的原始数据
      originalContentOnEdit.character = classifiedData.character.map(c => ({
        content: c.content || '',
        images: c.images ? [...c.images] : []
      }));
      hasRecordedOriginal.character = true;
      console.log('[Ge-extension Popup] [编辑开始] 已记录角色原始数据，数量:', originalContentOnEdit.character.length);
    }
  }

  /**
   * 创建隐藏的文件输入框并触发选择（角色图片）
   */
  function createCharacterFileInput(charIndex = 0) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        if (file.type.startsWith('image/')) {
          addImageToCharacter(file, charIndex);
        }
      });
      document.body.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();
  }

  /**
   * 处理角色图片粘贴事件
   */
  function handleCharacterImagePaste(e, charIndex = 0) {
    const items = e.clipboardData?.items;
    if (!items) return;

    recordCharacterOriginalData();  // 记录原始数据

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addImageToCharacter(file, charIndex);
        }
        break;
      }
    }
  }

  /**
   * 处理角色图片拖放事件
   */
  function handleCharacterImageDrop(e, charIndex = 0) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    recordCharacterOriginalData();  // 记录原始数据

    const files = Array.from(e.dataTransfer.files);

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        addImageToCharacter(file, charIndex);
      }
    });
  }

  /**
   * 添加图片到角色
   */
  function addImageToCharacter(file, charIndex = 0) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;

      // 兼容旧数据：如果 character 是字符串，先转换为数组
      if (typeof classifiedData.character === 'string') {
        const oldCharacter = classifiedData.character;
        classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
        classifiedData.characterImages = undefined;
      }
      if (!Array.isArray(classifiedData.character)) {
        classifiedData.character = [];
      }

      // 确保指定索引的角色存在
      if (!classifiedData.character[charIndex]) {
        classifiedData.character[charIndex] = { content: '', images: [] };
      }

      // 确保角色有 images 数组
      if (!classifiedData.character[charIndex].images) {
        classifiedData.character[charIndex].images = [];
      }

      // 添加图片
      classifiedData.character[charIndex].images.push(base64);

      // 更新 UI
      updateCharacterImageCell(charIndex);

      console.log('[Ge-extension Popup] 已添加图片到角色', charIndex + 1, '，当前图片数:', classifiedData.character[charIndex].images.length);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 删除角色图片
   */
  function deleteCharacterImage(charIndex = 0, imgIndex) {
    // 兼容旧数据
    if (typeof classifiedData.character === 'string') {
      const oldCharacter = classifiedData.character;
      classifiedData.character = oldCharacter ? [{ content: oldCharacter, images: classifiedData.characterImages || [] }] : [];
      classifiedData.characterImages = undefined;
    }

    if (Array.isArray(classifiedData.character) && classifiedData.character[charIndex]?.images) {
      classifiedData.character[charIndex].images.splice(imgIndex, 1);
      updateCharacterImageCell(charIndex);
      console.log('[Ge-extension Popup] 已删除角色', charIndex + 1, '的第', imgIndex + 1, '张图片');
    }
  }

  /**
   * 更新角色图片容器显示
   */
  function updateCharacterImageCell(charIndex = 0) {
    const container = categoryDisplay.querySelector(`.character-image-container[data-char-index="${charIndex}"]`) ||
                      categoryDisplay.querySelector('.character-image-container');
    if (container) {
      container.innerHTML = `
        ${renderCharacterImageThumbnails(charIndex)}
        <div class="character-image-add-btn" data-char-index="${charIndex}" title="点击或粘贴添加图片">+</div>
      `;
      // 更新容器的 charIndex
      container.dataset.charIndex = charIndex;

      // 重新绑定事件
      const addBtn = container.querySelector('.character-image-add-btn');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        createCharacterFileInput(charIndex);
      });

      const deleteBtns = container.querySelectorAll('.character-image-delete-btn');
      deleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const imgIndex = parseInt(btn.dataset.imgIndex);
          deleteCharacterImage(charIndex, imgIndex);
        });
      });
    }
  }

  // ========== 清理函数 ==========
  function cleanup() {
    if (relayCheckInterval) {
      clearInterval(relayCheckInterval);
      relayCheckInterval = null;
    }
  }

  // ========== 启动 popup ==========
  init();

  // popup 关闭时清理
  window.addEventListener('unload', cleanup);
})();
