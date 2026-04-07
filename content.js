/**
 * Content Script - 后台运行，处理页面内容采集和 Gemini 机器人接力
 *
 * 功能说明：
 * 1. 通过消息接收来自弹窗的指令
 * 2. 读取当前页面文本内容
 * 3. 尝试点击页面上指定的按钮（通过选择器匹配）
 * 4. 将读取到的文本保存到 chrome.storage.local
 * 5. 支持 Gemini 机器人接力（半自动流程）
 */

(function() {
  'use strict';

  // 防止重复注入
  if (window.__geExtensionInjected) {
    return;
  }
  window.__geExtensionInjected = true;

  // ========== 机器人接力状态管理 ==========
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
    BOT2_COMPLETED: 'bot2_completed',
    COMPLETED: 'completed',
    FAILED: 'failed'
  };

  let relayConfig = {
    state: RELAY_STATE.IDLE,
    startUrl: null,
    startGemId: null,
    savedPrevReply: null,
    savedGemReply: null,
    isPaused: false
  };

  let urlCheckInterval = null;

  // 计时器跳过标志
  let skipWaitTimer = false;

  // ========== 0.9 可中断的等待函数（带计时器UI）==========
  /**
   * 可中断的等待函数，会显示 popup 计时器
   * @param {number} ms - 等待毫秒数
   * @param {string} type - 计时器类型：'image_load' 或 'ai_generate'
   */
  async function waitWithTimer(ms, type) {
    const seconds = Math.ceil(ms / 1000);
    skipWaitTimer = false;

    // 通知 popup 显示计时器
    chrome.runtime.sendMessage({
      action: 'showWaitTimer',
      seconds: seconds,
      type: type
    }).catch(err => {
      console.log('[Ge-extension Relay] 通知显示计时器失败:', err);
    });

    console.log(`[Ge-extension Relay] 开始等待 ${seconds} 秒 (${type})，可点击跳过`);

    // 每秒检查一次是否应该跳过
    const startTime = Date.now();
    while (Date.now() - startTime < ms) {
      if (skipWaitTimer) {
        console.log('[Ge-extension Relay] 用户跳过等待');
        break;
      }
      await sleep(1000);
    }

    // 通知 popup 隐藏计时器
    chrome.runtime.sendMessage({
      action: 'hideWaitTimer'
    }).catch(err => {
      console.log('[Ge-extension Relay] 通知隐藏计时器失败:', err);
    });
  }

  // ========== 1. 处理来自弹窗的采集指令 ==========
  function handleCollectRequest() {
    console.log('[Ge-extension] 开始采集页面内容');

    // 读取页面文本内容
    const pageText = extractPageText();

    // 尝试点击页面上的指定按钮（示例：查找提交类按钮）
    const targetClicked = tryClickTargetButton();

    // 组合数据
    const data = {
      url: window.location.href,
      title: document.title,
      text: pageText,
      timestamp: new Date().toISOString(),
      targetButtonClicked: targetClicked
    };

    // 保存到 chrome.storage.local
    saveToStorage(data, function(success) {
      if (success) {
        showNotification('✓ 内容已保存！');
      } else {
        showNotification('✗ 保存失败，请重试');
      }
    });

    return data;
  }

  // ========== 3. 提取页面文本内容 ==========
  function extractPageText() {
    // 优先获取主要内容区域
    const contentSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.content',
      '#content',
      '.post-content',
      '.article-content'
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 100) {
        return element.textContent.trim().substring(0, 5000); // 限制长度
      }
    }

    // 如果没找到主要内容区域，返回 body 的文本
    return document.body.textContent.trim().substring(0, 5000);
  }

  // ========== 4. 尝试点击目标按钮 ==========
  function tryClickTargetButton() {
    // 这里配置要点击的按钮选择器（可根据实际需求修改）
    const targetSelectors = [
      'button[type="submit"]',
      '.submit-button',
      '#submit',
      'input[type="submit"]',
      '.btn-primary'
    ];

    for (const selector of targetSelectors) {
      const button = document.querySelector(selector);
      if (button && isElementVisible(button)) {
        console.log('[Ge-extension] 找到并点击目标按钮:', selector);
        button.click();
        return {
          clicked: true,
          selector: selector
        };
      }
    }

    console.log('[Ge-extension] 未找到可点击的目标按钮');
    return { clicked: false };
  }

  // 检查元素是否可见
  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(element).display !== 'none' &&
      window.getComputedStyle(element).visibility !== 'hidden'
    );
  }

  // ========== 5. 保存数据到 chrome.storage.local ==========
  function saveToStorage(data, callback) {
    // 获取现有数据
    chrome.storage.local.get(['geExtensionData'], function(result) {
      const existingData = result.geExtensionData || [];

      // 添加新数据到数组开头（最新的在前）
      existingData.unshift(data);

      // 限制保存的记录数量（最多保留 50 条）
      const limitedData = existingData.slice(0, 50);

      // 保存回 storage
      chrome.storage.local.set(
        { geExtensionData: limitedData },
        function() {
          if (chrome.runtime.lastError) {
            console.error('[Ge-extension] 保存失败:', chrome.runtime.lastError);
            if (callback) callback(false);
          } else {
            console.log('[Ge-extension] 数据已保存');
            if (callback) callback(true);
          }
        }
      );
    });
  }

  // ========== 6. 显示通知反馈 ==========
  function showNotification(message) {
    // 移除旧通知
    const oldNotification = document.getElementById('ge-notification');
    if (oldNotification) {
      oldNotification.remove();
    }

    // 创建新通知
    const notification = document.createElement('div');
    notification.id = 'ge-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // 3秒后自动消失
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // ========== 7. 初始化：从 storage 恢复接力状态 ==========
  function initializeRelayState() {
    // 首先检查是否有重做配置
    chrome.storage.local.get(['geRedoConfig'], function(redoResult) {
      const redoConfig = redoResult.geRedoConfig;

      if (redoConfig && redoConfig.autoStart) {
        console.log('[Ge-extension] 检测到重做配置:', redoConfig);

        // 根据机器人类型设置 geStep2Config
        if (redoConfig.botKey === 'bot3') {
          // 机器人3：设置场景配置
          const step2Config = {
            state: 'waiting_start',
            bot3Url: redoConfig.bot3Url || window.location.href,
            sceneSetting: redoConfig.sceneSetting || '',
            scenes: redoConfig.scenes || [],
            currentSceneIndex: 0,
            bot3Enabled: true,
            bot4Enabled: false,
            bot5Enabled: false,
            isPaused: false
          };

          chrome.storage.local.set({ geStep2Config: step2Config }, function() {
            console.log('[Ge-extension] 已设置重做配置到 geStep2Config:', step2Config);

            // 清除重做配置
            chrome.storage.local.remove(['geRedoConfig'], function() {
              console.log('[Ge-extension] 已清除重做配置');

              // 自动开始运行
              if (redoConfig.autoStart) {
                console.log('[Ge-extension] 自动开始运行机器人3');
                // 触发执行第二步第一部分
                executeStep2Part1(step2Config);
              }
            });
          });
          return;
        }

        if (redoConfig.botKey === 'bot4') {
          // 机器人4：设置素材配置
          const step2Config = {
            state: 'step2_part2_materials',
            bot4Url: redoConfig.bot4Url || window.location.href,
            materialSetting: redoConfig.materialSetting || '',
            materials: redoConfig.materials || [],
            currentMaterialIndex: 0,
            bot3Enabled: false,
            bot4Enabled: true,
            bot5Enabled: false,
            isPaused: false
          };

          chrome.storage.local.set({ geStep2Config: step2Config }, function() {
            console.log('[Ge-extension] 已设置重做配置到 geStep2Config:', step2Config);
            chrome.storage.local.remove(['geRedoConfig'], function() {
              console.log('[Ge-extension] 已清除重做配置');
              if (redoConfig.autoStart) {
                console.log('[Ge-extension] 自动开始运行机器人4');
                executeStep2Part2(step2Config);
              }
            });
          });
          return;
        }

        if (redoConfig.botKey === 'bot5') {
          // 机器人5：设置角色配置
          const step2Config = {
            state: 'step2_part3_character',
            bot5Url: redoConfig.bot5Url || window.location.href,
            character: redoConfig.character || '',
            bot3Enabled: false,
            bot4Enabled: false,
            bot5Enabled: true,
            isPaused: false
          };

          chrome.storage.local.set({ geStep2Config: step2Config }, function() {
            console.log('[Ge-extension] 已设置重做配置到 geStep2Config:', step2Config);
            chrome.storage.local.remove(['geRedoConfig'], function() {
              console.log('[Ge-extension] 已清除重做配置');
              if (redoConfig.autoStart) {
                console.log('[Ge-extension] 自动开始运行机器人5');
                executeStep2Part3(step2Config);
              }
            });
          });
          return;
        }
      }

      // 没有重做配置，继续正常的接力状态检查
      chrome.storage.local.get(['geRelayConfig'], function(result) {
        const savedConfig = result.geRelayConfig;
      console.log('[Ge-extension] 初始化检查，配置:', savedConfig);

      if (!savedConfig) {
        console.log('[Ge-extension] 没有接力配置');
        return;
      }

      relayConfig = savedConfig;

      // 检查是否暂停
      if (relayConfig.isPaused) {
        console.log('[Ge-extension] 接力已暂停，不自动执行');
        return;
      }

      // URL 校验：根据 state 从 geBotUrls 动态读取期望 URL，检查当前页面是否匹配
      const stateToUrlKey2 = {
        'sending_to_canvas_master': { urlKey: 'canvasMaster', name: '画板大师' },
        'waiting_canvas_master_reply': { urlKey: 'canvasMaster', name: '画板大师' },
        'canvas_master_completed': { urlKey: 'bot2', name: '机器人2' },
        'waiting_for_bot2': { urlKey: 'bot2', name: '机器人2' },
        'waiting_for_gem_select': { urlKey: 'bot2', name: '机器人2' },
        'sending_to_gem': { urlKey: 'bot2', name: '机器人2' },
        'waiting_gem_reply': { urlKey: 'bot2', name: '机器人2' },
        'bot2_completed': { urlKey: 'bot6', name: '机器人4' }
      };
      const urlInfo2 = stateToUrlKey2[relayConfig.state];

      if (urlInfo2) {
        // 内联回调式校验（因为外层是回调不是 async）
        (async () => {
          const botUrlsResult2 = await new Promise(resolve => {
            chrome.storage.local.get(['geBotUrls'], resolve);
          });
          const botUrls2 = botUrlsResult2.geBotUrls || {};
          const expectedUrl2 = botUrls2[urlInfo2.urlKey];

          const verified = await verifyExpectedUrl(expectedUrl2, relayConfig, 'geRelayConfig', urlInfo2.name);
          if (!verified) return; // 校验中或已暂停

          // URL 匹配，继续正常状态分发
          continueRelayStateDispatch(relayConfig);
        })();
        return; // 先返回，让 async IIFE 处理后续
      }

      // 无需校验的状态，正常分发
      continueRelayStateDispatch(relayConfig);
    });
    });
  }

  // ========== 7.1.1 接力状态分发（从 initializeRelayState 提取） ==========
  function continueRelayStateDispatch(relayConfig) {
      if (relayConfig.state === RELAY_STATE.SENDING_TO_CANVAS_MASTER) {
        console.log('[Ge-extension] 检测到需要发送消息给画板大师');
        performSendToCanvasMaster();
        return;
      }

      if (relayConfig.state === RELAY_STATE.WAITING_CANVAS_MASTER_REPLY) {
        console.log('[Ge-extension] 检测到需要继续等待画板大师回复');
        monitorCanvasMasterReply();
        return;
      }

      if (relayConfig.state === RELAY_STATE.CANVAS_MASTER_COMPLETED ||
          relayConfig.state === RELAY_STATE.WAITING_FOR_BOT2) {
        console.log('[Ge-extension] 画板大师已完成，需要跳转到机器人2');
        performJumpToBot2();
        return;
      }

      // 直接发送到机器人2（机器人1未勾选且画板大师未勾选的情况）
      if (relayConfig.state === RELAY_STATE.SENDING_TO_GEM) {
        console.log('[Ge-extension] 检测到需要直接发送消息到机器人2');
        performSendToGem();
        return;
      }

      // 原有的机器人接力状态处理
      if (relayConfig.state === RELAY_STATE.WAITING_FOR_GEM_SELECT) {
        console.log('[Ge-extension] 检测到接力进行中，恢复状态');

        // 获取当前页面的 Gem ID
        const currentGemId = extractGemId(window.location.href);
        console.log('[Ge-extension] 当前页面 Gem ID:', currentGemId);
        console.log('[Ge-extension] 起始 Gem ID:', relayConfig.startGemId);

        // 如果当前页面是新的机器人（Gem ID 不同），开始发送
        if (currentGemId && currentGemId !== relayConfig.startGemId) {
          console.log('[Ge-extension] 检测到已切换到新机器人，开始发送');
          performSendToGem();
        } else {
          console.log('[Ge-extension] 当前页面不是目标机器人，启动 URL 监听');
          // 否则继续监听 URL 变化
          startUrlMonitoring();
        }
      }
  }

  // 页面加载时初始化
  initializeRelayState();

  // ========== 7. 监听来自 popup 的消息 ==========
  chrome.runtime.onMessage.addListener(function(request, _sender, sendResponse) {
    console.log('[Ge-extension Content] 收到消息:', request.action);

    if (request.action === 'getPageInfo') {
      sendResponse({
        url: window.location.href,
        title: document.title
      });
    } else if (request.action === 'collectPageContent') {
      // 采集页面内容
      const data = handleCollectRequest();
      sendResponse({ success: true, data: data });
    } else if (request.action === 'getLatestResponse') {
      // 获取当前页面最新的 AI 回复
      handleGetLatestResponse()
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开启
    } else if (request.action === 'sendAndCollect') {
      // 发送消息并获取回复（用于机器人接力）
      handleSendAndCollect(request.data, sendResponse);
      return true; // 保持消息通道开启
    } else if (request.action === 'getBot1Reply') {
      // 只获取机器人1回复，不执行跳转 - 使用 Promise 包装
      handleGetBot1Reply()
        .then(result => {
          console.log('[Ge-extension Content] getBot1Reply 完成，结果:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('[Ge-extension Content] getBot1Reply 错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开启
    } else if (request.action === 'startRelayStep1') {
      console.log('[Ge-extension Content] 处理 startRelayStep1 消息');
      // 开始机器人接力第一步 - 使用 Promise 包装，使用简单提取方法
      handleGetBot1Reply()
        .then(result => {
          console.log('[Ge-extension Content] startRelayStep1 完成，结果:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('[Ge-extension Content] startRelayStep1 错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开启
    } else if (request.action === 'startRelayStep2') {
      console.log('[Ge-extension Content] 处理 startRelayStep2 消息');
      // 开始机器人接力第二步 - 使用 Promise 包装
      handleStartRelayStep2()
        .then(result => {
          console.log('[Ge-extension Content] startRelayStep2 完成，结果:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('[Ge-extension Content] startRelayStep2 错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开启
    } else if (request.action === 'stopRelay') {
      // 停止机器人接力
      handleStopRelay(sendResponse);
    } else if (request.action === 'pauseRelay') {
      // 暂停机器人接力
      handlePauseRelay(sendResponse);
    } else if (request.action === 'resumeRelay') {
      // 继续机器人接力
      handleResumeRelay(sendResponse);
    } else if (request.action === 'getRelayStatus') {
      // 获取接力状态
      sendResponse({ success: true, config: relayConfig });
    } else if (request.action === 'startAutomation') {
      // 启动 Gemini 自动化流程
      handleStartAutomation(sendResponse);
      return true;
    } else if (request.action === 'showControlPanel') {
      // 显示 Gemini 自动化控制面板
      handleShowControlPanel(sendResponse);
      return true;
    } else if (request.action === 'getAutomationStatus') {
      // 获取自动化状态
      handleGetAutomationStatus(sendResponse);
      return true;
    } else if (request.action === 'timerEnded') {
      // 用户点击跳过按钮，结束等待
      console.log('[Ge-extension Content] 收到 timerEnded 消息，类型:', request.type);
      skipWaitTimer = true;
      sendResponse({ success: true });
    }
    return true;
  });

  // ========== 7.1 处理启动自动化 ==========
  function handleStartAutomation(sendResponse) {
    // 检查是否在 Gemini 页面
    if (!window.location.href.includes('gemini.google.com')) {
      sendResponse({
        success: false,
        error: '请先访问 Gemini 页面'
      });
      return;
    }

    // 检查 gemini-automation.js 是否已加载
    if (window.GeminiAutomation) {
      try {
        window.GeminiAutomation.start()
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            sendResponse({
              success: false,
              error: error.message
            });
          });
        return; // 异步响应
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    } else {
      // gemini-automation.js 未加载，尝试加载
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('gemini-automation.js');
      script.onload = function() {
        try {
          window.GeminiAutomation.start()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              sendResponse({
                success: false,
                error: error.message
              });
            });
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message
          });
        }
      };
      script.onerror = function() {
        sendResponse({
          success: false,
          error: '无法加载自动化模块'
        });
      };
      document.head.appendChild(script);
    }
  }

  // ========== 7.2 处理显示控制面板 ==========
  function handleShowControlPanel(sendResponse) {
    // 检查是否在 Gemini 页面
    if (!window.location.href.includes('gemini.google.com')) {
      sendResponse({
        success: false,
        error: '请先访问 Gemini 页面'
      });
      return;
    }

    // 检查 gemini-automation.js 是否已加载
    if (window.GeminiAutomation) {
      window.GeminiAutomation.showPanel();
      sendResponse({ success: true });
    } else {
      // gemini-automation.js 未加载，尝试加载
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('gemini-automation.js');
      script.onload = function() {
        window.GeminiAutomation.showPanel();
        sendResponse({ success: true });
      };
      script.onerror = function() {
        sendResponse({
          success: false,
          error: '无法加载自动化模块'
        });
      };
      document.head.appendChild(script);
    }
  }

  // ========== 7.3 处理获取自动化状态 ==========
  function handleGetAutomationStatus(sendResponse) {
    if (window.GeminiAutomation) {
      const status = window.GeminiAutomation.getStatus();
      sendResponse({
        status: status.state,
        progress: {
          current: status.currentIndex + 1,
          total: status.totalAgents
        }
      });
    } else {
      sendResponse({
        status: 'idle',
        progress: { current: 0, total: 3 }
      });
    }
  }

  // ========== 7.41 获取机器人1回复（不跳转） ==========
  async function handleGetBot1Reply() {
    console.log('[Ge-extension Relay] 获取机器人 1 的回复');

    try {
      // 清除旧的修改记录，确保使用新的机器人回复
      await chrome.storage.local.remove(['gePrevReplyModified']);
      console.log('[Ge-extension Relay] 已清除旧的修改记录');

      // 使用简单方法获取当前页面的最新回复
      const responseResult = await getSimpleResponse();
      console.log('[Ge-extension Relay] getSimpleResponse 结果:', responseResult);

      if (responseResult.success && responseResult.data) {
        // 保存回复和起始信息
        // 机器人1完成后，先跳转到画板大师
        relayConfig.state = RELAY_STATE.WAITING_FOR_CANVAS_MASTER;
        relayConfig.savedPrevReply = responseResult.data;
        relayConfig.startUrl = window.location.href;
        relayConfig.startGemId = extractGemId(window.location.href);
        relayConfig.isPaused = true; // 设置为暂停状态

        // 记录机器人1完成
        await updateTaskBotRecord('bot1', {
          ran: true,
          content: responseResult.data
        });

        console.log('[Ge-extension Relay] 准备保存配置...');
        await saveRelayConfig();
        console.log('[Ge-extension Relay] 配置保存完成');

        console.log('[Ge-extension Relay] 获取到机器人 1 的回复，长度:', responseResult.data.length);
        const result = { success: true, data: responseResult.data };
        console.log('[Ge-extension Relay] 准备返回结果:', result);
        return result;
      } else {
        const result = { success: false, error: '无法获取机器人1的回复' };
        console.log('[Ge-extension Relay] 返回失败结果:', result);
        return result;
      }
    } catch (error) {
      console.error('[Ge-extension Relay] 获取机器人1回复失败:', error);
      const result = { success: false, error: error.message };
      console.log('[Ge-extension Relay] 返回异常结果:', result);
      return result;
    }
  }

  // ========== 7.41 跳转到画板大师 ==========
  async function performJumpToCanvasMaster() {
    console.log('[Ge-extension Relay] 开始跳转到画板大师');

    // 读取画板大师URL和勾选状态
    const urlsResult = await new Promise(resolve => {
      chrome.storage.local.get(['geBotUrls'], resolve);
    });
    const canvasMasterUrl = urlsResult.geBotUrls?.canvasMaster;
    const isCanvasMasterEnabled = urlsResult.geBotUrls?.canvasMasterEnabled !== false; // 默认启用

    // 检查画板大师是否启用
    if (!isCanvasMasterEnabled) {
      console.log('[Ge-extension Relay] 画板大师未勾选，跳过直接进入机器人2');
      // 直接跳转到机器人2
      relayConfig.state = RELAY_STATE.WAITING_FOR_BOT2;
      await saveRelayConfig();
      performJumpToBot2();
      return;
    }

    if (!canvasMasterUrl) {
      console.log('[Ge-extension Relay] 未配置画板大师URL，跳过直接进入机器人2');
      // 直接跳转到机器人2
      relayConfig.state = RELAY_STATE.WAITING_FOR_BOT2;
      await saveRelayConfig();
      performJumpToBot2();
      return;
    }

    relayConfig.state = RELAY_STATE.SENDING_TO_CANVAS_MASTER;
    await saveRelayConfig();

    console.log('[Ge-extension Relay] 画板大师URL:', canvasMasterUrl);

    // 延迟3-6秒后跳转
    const delay = 3000 + Math.random() * 3000;
    console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后在新标签页打开画板大师');
    await sleep(delay);

    // 在新标签页打开画板大师
    window.open(canvasMasterUrl, '_blank');
  }

  // ========== 7.42 发送消息给画板大师 ==========
  async function performSendToCanvasMaster() {
    console.log('[Ge-extension Relay] 开始发送消息给画板大师');

    relayConfig.state = RELAY_STATE.SENDING_TO_CANVAS_MASTER;
    await saveRelayConfig();

    try {
      if (!relayConfig.savedPrevReply) {
        throw new Error('没有保存的回复');
      }

      // 检查是否有用户修改后的机器人1回复
      const storageResult = await chrome.storage.local.get(['gePrevReplyModified']);
      let message = relayConfig.savedPrevReply;

      if (storageResult.gePrevReplyModified && storageResult.gePrevReplyModified.content) {
        console.log('[Ge-extension Relay] 使用用户修改后的机器人1回复');
        message = storageResult.gePrevReplyModified.content;
      }

      console.log('[Ge-extension Relay] [画板大师] 发送消息长度:', message.length);

      // 切换到 Thinking 模式
      await switchToThinkingMode();

      // 获取输入框
      const inputBox = await waitForInputBox();
      if (!inputBox) {
        throw new Error('找不到输入框');
      }

      // 填写消息
      await simulateInput(inputBox, message);
      await sleep(500);

      // 获取并点击发送按钮
      const sendButton = getSendButton();
      if (!sendButton) {
        throw new Error('找不到发送按钮');
      }
      await simulateClick(sendButton);

      console.log('[Ge-extension Relay] [画板大师] 消息已发送');

      // 更新状态，开始监控回复
      relayConfig.state = RELAY_STATE.WAITING_CANVAS_MASTER_REPLY;
      await saveRelayConfig();

      // 开始监控回复
      monitorCanvasMasterReply();

    } catch (error) {
      console.error('[Ge-extension Relay] 发送消息给画板大师失败:', error);
      relayConfig.state = RELAY_STATE.FAILED;
      await saveRelayConfig();
    }
  }

  // ========== 7.43 监控画板大师回复 ==========
  async function monitorCanvasMasterReply() {
    console.log('[Ge-extension Relay] 开始监控画板大师回复');

    relayConfig.state = RELAY_STATE.WAITING_CANVAS_MASTER_REPLY;
    await saveRelayConfig();

    // 使用与等待机器人回复相同的监控逻辑
    await monitorReplyAndFinishForCanvasMaster();
  }

  // ========== 7.44 等待画板大师回复完成（不解析内容） ==========
  async function monitorReplyAndFinishForCanvasMaster() {
    console.log('[Ge-extension Relay] 等待画板大师回复完成...');

    // 初始等待 5 秒，让 AI 开始生成
    await sleep(5000);
    console.log('[Ge-extension Relay] [画板大师] 开始检测回复内容变化...');

    let prevResponse = null;
    let prevLength = 0;
    let unchangedCount = 0;
    const maxUnchangedCount = 2; // 连续两次没变化就完成
    let hasContent = false; // 是否已经有内容了
    let firstContentCaptured = false; // 是否已捕获第一次内容

    while (unchangedCount < maxUnchangedCount) {
      // 检查暂停状态
      if (relayConfig.isPaused) {
        console.log('[Ge-extension Relay] [画板大师] 检测到暂停，停止等待回复');
        return;
      }

      // 获取当前回复（使用与机器人2相同的方法）
      const responseResult = await handleGetLatestResponse();
      let currentResponse = '';
      let currentLength = 0;

      if (responseResult.success && responseResult.data) {
        currentResponse = responseResult.data;
        currentLength = currentResponse.length;
      }

      console.log('[Ge-extension Relay] [画板大师] 检测回复，长度:', currentLength, 'hasContent:', hasContent, 'unchangedCount:', unchangedCount);

      // 只有当有内容后才开始比较
      if (currentLength > 50) {
        if (!hasContent) {
          // 第一次获取到内容，标记有内容，但这次不参与比较
          hasContent = true;
          console.log('[Ge-extension Relay] [画板大师] 检测到内容，等待下一轮开始比较，长度:', currentLength);
        } else if (!firstContentCaptured) {
          // 第二次检测到内容，现在开始正式比较
          firstContentCaptured = true;
          prevResponse = currentResponse;
          prevLength = currentLength;
          console.log('[Ge-extension Relay] [画板大师] 开始正式比较，基准长度:', currentLength);
        } else {
          // 正常比较阶段
          if (currentLength === prevLength && currentResponse === prevResponse) {
            unchangedCount++;
            console.log('[Ge-extension Relay] [画板大师] 回复未变化，计数:', unchangedCount, '/', maxUnchangedCount);
          } else {
            unchangedCount = 0; // 重置计数
            prevResponse = currentResponse;
            prevLength = currentLength;
            console.log('[Ge-extension Relay] [画板大师] 回复有变化，重置计数，新长度:', currentLength);
          }
        }
      }

      // 等待 2 秒后再次检查
      if (unchangedCount < maxUnchangedCount) {
        await sleep(2000);
      }
    }

    console.log('[Ge-extension Relay] [画板大师] 回复完成，最终长度:', prevLength);

    // 记录画板大师完成
    await updateTaskBotRecord('canvasMaster', {
      ran: true,
      content: relayConfig.savedGemReply || ''
    });

    // 画板大师完成，更新状态
    relayConfig.state = RELAY_STATE.CANVAS_MASTER_COMPLETED;
    await saveRelayConfig();

    console.log('[Ge-extension Relay] [画板大师] 完成，准备跳转到机器人2');

    // 通知 popup 更新进度
    chrome.runtime.sendMessage({
      action: 'canvasMasterCompleted',
      data: { success: true }
    });

    // 延迟后跳转到机器人2
    const delay = 3000 + Math.random() * 2000;
    console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人2');
    await sleep(delay);

    // 执行跳转到机器人2
    performJumpToBot2();
    await saveRelayConfig();
  }

  // ========== 7.45 跳转到机器人2 ==========
  async function performJumpToBot2() {
    console.log('[Ge-extension Relay] 开始跳转到机器人2');

    // 读取机器人2 URL和勾选状态
    const urlsResult = await new Promise(resolve => {
      chrome.storage.local.get(['geBotUrls'], resolve);
    });
    const bot2Url = urlsResult.geBotUrls?.bot2;
    const isBot2Enabled = urlsResult.geBotUrls?.bot2Enabled !== false; // 默认启用

    // 检查机器人2是否启用
    if (!isBot2Enabled) {
      console.log('[Ge-extension Relay] 机器人2未勾选，跳过直接进入手动分类模式');
      // 标记第一步完成，但第二步需要手动输入
      relayConfig.state = RELAY_STATE.COMPLETED;
      relayConfig.savedGemReply = ''; // 空回复，表示需要手动输入
      await saveRelayConfig();

      // 初始化空的 geStep2Config，等待用户手动输入
      await new Promise(resolve => {
        chrome.storage.local.set({
          geStep2Config: {
            state: 'waiting_start',
            scenes: [],
            materials: [],
            character: '',
            characterImages: [],
            sceneSetting: '',
            materialSetting: '',
            isPaused: true
          }
        }, resolve);
      });

      console.log('[Ge-extension Relay] 已跳过机器人2，请在 popup 中手动输入分类数据');
      showNotification('机器人2已跳过，请手动输入分类数据');
      return;
    }

    if (!bot2Url) {
      console.log('[Ge-extension Relay] 未配置机器人2 URL');
      relayConfig.state = RELAY_STATE.FAILED;
      await saveRelayConfig();
      return;
    }

    relayConfig.state = RELAY_STATE.WAITING_FOR_BOT2;
    await saveRelayConfig();

    console.log('[Ge-extension Relay] 机器人2 URL:', bot2Url);

    // 更新状态为跳转中
    relayConfig.state = RELAY_STATE.WAITING_FOR_GEM_SELECT;
    await saveRelayConfig();

    // 在新标签页打开机器人2
    window.open(bot2Url, '_blank');
  }

  // ========== 7.46 跳转到机器人4(bot6) ==========
  async function performJumpToBot6() {
    console.log('[Ge-extension Relay] 开始跳转到机器人4(bot6)');

    // 读取机器人4 URL和勾选状态
    const urlsResult = await new Promise(resolve => {
      chrome.storage.local.get(['geBotUrls'], resolve);
    });
    const bot6Url = urlsResult.geBotUrls?.bot6;
    const isBot6Enabled = urlsResult.geBotUrls?.bot6Enabled !== false;

    // 检查机器人4是否启用
    if (!isBot6Enabled || !bot6Url) {
      console.log('[Ge-extension Relay] 机器人4未勾选或未配置URL，直接完成');
      relayConfig.state = RELAY_STATE.COMPLETED;
      await saveRelayConfig();
      showNotification('✓ 第一步完成！');
      return;
    }

    // bot6也使用bot1的回复（savedPrevReply保持不变，仍为bot1的回复）
    relayConfig.targetBot = 'bot6';  // 标记目标，供performSendToGem判断
    relayConfig.state = RELAY_STATE.WAITING_FOR_GEM_SELECT;
    await saveRelayConfig();

    console.log('[Ge-extension Relay] 机器人4 URL:', bot6Url);

    // 延迟3-6秒后跳转
    const delay = 3000 + Math.random() * 3000;
    console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后在新标签页打开机器人4');
    await sleep(delay);

    // 在新标签页打开机器人4
    window.open(bot6Url, '_blank');
  }

  // ========== 7.41 开始机器人接力第二步 ==========
  async function handleStartRelayStep2() {
    console.log('[Ge-extension Relay] ===== 开始第二步 =====');

    try {
      // 从 storage 读取第二步配置
      const storageResult = await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });

      const config = storageResult.geStep2Config;
      if (!config) {
        return { success: false, error: '未找到第二步配置' };
      }

      // 读取机器人启用状态
      const bot3Enabled = config.bot3Enabled !== false;  // 默认启用
      const bot4Enabled = config.bot4Enabled !== false;
      const bot5Enabled = config.bot5Enabled !== false;

      console.log('[Ge-extension Relay] Bot3 启用:', bot3Enabled, ', Bot4 启用:', bot4Enabled, ', Bot5 启用:', bot5Enabled);
      console.log('[Ge-extension Relay] 场景数量:', config.scenes.length);
      console.log('[Ge-extension Relay] 素材数量:', config.materials.length);

      // 根据启用状态决定起始步骤
      if (bot3Enabled && config.scenes.length > 0) {
        // ===== 第一部分：场景概念图生成 =====
        console.log('[Ge-extension Relay] ===== 第一部分：场景概念图生成 =====');

        // 跳转到机器人3
        const delay1 = 3000 + Math.random() * 3000;
        console.log('[Ge-extension Relay] 将在', Math.round(delay1/1000), '秒后跳转到机器人3');

        await sleep(delay1);
        window.open(config.bot3Url, '_blank');
        console.log('[Ge-extension Relay] 已跳转到机器人3');

        // 保存状态到 storage，让机器人3页面的 content script 继续执行
        config.state = 'step2_part1_scenes';
        config.currentSceneIndex = 0;
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: config }, resolve);
        });

        console.log('[Ge-extension Relay] 第二步第一部分已启动，等待机器人3页面处理...');
        return { success: true, message: '第二步已启动，正在生成场景概念图...' };

      } else if (bot4Enabled && config.materials.length > 0) {
        // Bot3 未启用或无场景，直接进入素材生成
        console.log('[Ge-extension Relay] Bot3 未启用或无场景，跳过场景生成，直接进入素材生成');

        const delay = 3000 + Math.random() * 3000;
        console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人4');

        await sleep(delay);
        window.open(config.bot4Url, '_blank');
        console.log('[Ge-extension Relay] 已跳转到机器人4');

        config.state = 'step2_part2_materials';
        config.currentMaterialIndex = 0;
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: config }, resolve);
        });

        return { success: true, message: '第二步已启动，正在生成素材概念图...' };

      } else if (bot5Enabled && config.character && config.character.length > 0) {
        // Bot3、Bot4 都未启用或无数据，直接进入角色生成
        console.log('[Ge-extension Relay] Bot3、Bot4 未启用或无数据，跳过场景和素材生成，直接进入角色生成');
        console.log('[Ge-extension Relay] 角色数据类型:', Array.isArray(config.character) ? '数组' : typeof config.character);
        console.log('[Ge-extension Relay] 角色数据长度:', config.character.length);

        const delay = 3000 + Math.random() * 3000;
        console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人5');

        await sleep(delay);
        window.open(config.bot5Url, '_blank');
        console.log('[Ge-extension Relay] 已跳转到机器人5');

        config.state = 'step2_part3_character';
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: config }, resolve);
        });

        return { success: true, message: '第二步已启动，正在生成角色概念图...' };

      } else {
        // Bot3/4/5 都未启用或无数据，检查 Bot7（参考图）
        const bot7Enabled = config.bot7Enabled !== false && config.bot7Url;

        if (bot7Enabled) {
          // 暂停等待用户填写参考图数据
          console.log('[Ge-extension Relay] Bot3/4/5 未启用或无数据，Bot7 启用，暂停等待参考图输入');
          config.state = 'waiting_for_bot7_input';
          config.isPaused = true;
          await new Promise((resolve) => {
            chrome.storage.local.set({ geStep2Config: config }, resolve);
          });
          showNotification('请填写参考图数据后点击继续');
          return { success: true, message: '请填写参考图数据后点击继续' };
        } else {
          // 没有可执行的任务
          console.log('[Ge-extension Relay] 没有可执行的任务');
          return { success: false, error: '没有启用的机器人或没有数据可处理' };
        }
      }

    } catch (error) {
      console.error('[Ge-extension Relay] 第二步启动失败:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 7.4.2 第二步初始化：在机器人3/4页面加载时执行 ==========
  async function initializeStep2() {
    const storageResult = await new Promise((resolve) => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });

    const config = storageResult.geStep2Config;
    if (!config || config.state === 'waiting_start') {
      return; // 没有第二步任务或未开始
    }

    console.log('[Ge-extension Relay] 检测到第二步任务，状态:', config.state);

    // URL 校验：根据 state 从 geBotUrls 动态读取期望 URL，检查当前页面是否匹配
    if (config.state !== 'completed' && config.state !== 'waiting_start' && config.state !== 'waiting_for_bot7_input') {
      const botUrlsResult = await new Promise(resolve => {
        chrome.storage.local.get(['geBotUrls'], resolve);
      });
      const botUrls = botUrlsResult.geBotUrls || {};

      const stateToUrlAndName = {
        'step2_part1_scenes': { urlKey: 'bot3', name: '机器人3' },
        'step2_part2_materials': { urlKey: 'bot4', name: '机器人4' },
        'step2_part3_character': { urlKey: 'bot5', name: '机器人5' },
        'step2_part4_bot7': { urlKey: 'bot7', name: '机器人7' }
      };
      const urlInfo = stateToUrlAndName[config.state];
      if (urlInfo) {
        const expectedUrl = botUrls[urlInfo.urlKey] || config[urlInfo.urlKey + 'Url'];
        const verified = await verifyExpectedUrl(expectedUrl, config, 'geStep2Config', urlInfo.name);
        if (!verified) return; // 校验中（重试跳转）或已暂停，不继续执行
      }
    }

    if (config.state === 'step2_part1_scenes') {
      // 在机器人3页面，执行场景生成
      await executeStep2Part1(config);
    } else if (config.state === 'step2_part2_materials') {
      // 在机器人4页面，执行素材生成
      await executeStep2Part2(config);
    } else if (config.state === 'step2_part3_character') {
      // 在机器人5页面，执行角色生成
      await executeStep2Part3(config);
    } else if (config.state === 'step2_part4_bot7') {
      // 在机器人7（编号8）页面，执行参考图生成
      await executeStep2Part4(config);
    }
  }

  // ========== 7.4.3 执行第二步第一部分：场景生成 ==========
  async function executeStep2Part1(config) {
    console.log('[Ge-extension Relay] ===== 执行场景生成 =====');
    console.log('[Ge-extension Relay] 场景总数:', config.scenes.length);
    console.log('[Ge-extension Relay] 当前场景索引:', config.currentSceneIndex);

    // 等待页面加载完成
    await sleep(3000);

    // 依次发送每个场景
    for (let i = config.currentSceneIndex; i < config.scenes.length; i++) {
      // 检查是否被停止或暂停
      const checkResult = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      if (!checkResult.geStep2Config) {
        console.log('[Ge-extension Relay] 检测到停止信号，中止场景生成');
        return;
      }

      // 检查是否被暂停
      if (checkResult.geStep2Config.isPaused) {
        console.log('[Ge-extension Relay] 检测到暂停信号，等待恢复...');
        // 保存当前进度（只更新进度字段，不覆盖用户修改的数据）
        config.currentSceneIndex = i;
        config.isPaused = checkResult.geStep2Config.isPaused;
        await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], (result) => {
            const latest = result.geStep2Config || {};
            latest.currentSceneIndex = config.currentSceneIndex;
            latest.isPaused = config.isPaused;
            chrome.storage.local.set({ geStep2Config: latest }, resolve);
          });
        });
        // 等待恢复（每秒检查一次）
        while (true) {
          await sleep(1000);
          const pauseCheck = await new Promise(resolve => {
            chrome.storage.local.get(['geStep2Config'], resolve);
          });
          if (!pauseCheck.geStep2Config) {
            console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
            return;
          }
          if (!pauseCheck.geStep2Config.isPaused) {
            console.log('[Ge-extension Relay] 检测到恢复信号，继续执行');
            // 恢复时重新读取完整配置（可能被 handleResumeRelay 更新过）
            const resumeConfig = pauseCheck.geStep2Config;
            config.isPaused = false;
            config.currentSceneIndex = resumeConfig.currentSceneIndex;
            config.currentMaterialIndex = resumeConfig.currentMaterialIndex;
            config.state = resumeConfig.state;
            config.scenes = resumeConfig.scenes || config.scenes;
            config.materials = resumeConfig.materials || config.materials;
            console.log('[Ge-extension Relay] 恢复后的配置: currentSceneIndex=', config.currentSceneIndex, ', state=', config.state);
            // 如果 currentSceneIndex 被更新到更早的位置，需要调整循环变量 i
            // 设置为 currentSceneIndex - 1，因为 for 循环结束时会 i++
            if (config.currentSceneIndex <= i) {
              i = config.currentSceneIndex - 1;
              console.log('[Ge-extension Relay] 场景索引回退，下一次将从场景', config.currentSceneIndex + 1, '开始');
            }
            break;
          }
        }
      }

      // 从 storage 重新读取最新的场景数据（用户可能在 popup 中修改过）
      console.log('[Ge-extension Relay] [发送前] 准备从 storage 读取最新场景数据...');
      const latestConfig = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      console.log('[Ge-extension Relay] [发送前] storage 读取结果存在:', !!latestConfig.geStep2Config);
      console.log('[Ge-extension Relay] [发送前] storage 中场景数量:', latestConfig.geStep2Config?.scenes?.length);
      if (latestConfig.geStep2Config?.scenes) {
        config.scenes = latestConfig.geStep2Config.scenes;
        console.log('[Ge-extension Relay] [发送前] 已从 storage 更新 config.scenes');
      }

      const scene = config.scenes[i];
      const sceneNumber = i + 1;

      console.log('[Ge-extension Relay] 发送场景', sceneNumber, '/', config.scenes.length);
      // 优先使用 title（用户修改后的完整内容），如果为空则使用 content
      const sceneContent = scene.title || scene.content || '';
      console.log('[Ge-extension Relay] [发送前] 场景', sceneNumber, 'content:', sceneContent?.substring(0, 50) + '...');

      // 构建场景消息，添加场景设置前缀
      const sceneSettingPrefix = config.sceneSetting ? `${config.sceneSetting}\n` : '';
      const message = sceneSettingPrefix + sceneContent;
      console.log('[Ge-extension Relay] [发送前] 最终发送的场景内容:', message.substring(0, 100) + '...');

      // 发送消息
      await sendAndWaitForComplete(message);

      console.log('[Ge-extension Relay] 场景', sceneNumber, '生成完成');

      // 更新进度（只更新进度字段，不覆盖 scenes 数据）
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latest = result.geStep2Config || {};
          latest.currentSceneIndex = i + 1;
          chrome.storage.local.set({ geStep2Config: latest }, resolve);
        });
      });
    }

    console.log('[Ge-extension Relay] 所有场景生成完成');

    // 记录机器人3完成
    await updateTaskBotRecord('bot3', {
      ran: true,
      sceneSetting: config.sceneSetting || '',
      scenes: config.scenes || [],
      sceneCount: config.scenes?.length || 0
    });

    // 读取最新的配置和启用状态
    const latestResult = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    const latestConfig = latestResult.geStep2Config || config;

    const bot4Enabled = latestConfig.bot4Enabled !== false;
    const bot5Enabled = latestConfig.bot5Enabled !== false;

    console.log('[Ge-extension Relay] 场景完成后检查 - Bot4 启用:', bot4Enabled, ', Bot5 启用:', bot5Enabled);
    console.log('[Ge-extension Relay] 原始配置 - bot4Enabled:', latestConfig.bot4Enabled, ', bot5Enabled:', latestConfig.bot5Enabled);
    console.log('[Ge-extension Relay] 素材数量:', latestConfig.materials?.length || 0);
    console.log('[Ge-extension Relay] 角色数据类型:', typeof latestConfig.character);
    console.log('[Ge-extension Relay] 角色是否是数组:', Array.isArray(latestConfig.character));
    if (Array.isArray(latestConfig.character)) {
      console.log('[Ge-extension Relay] 角色数组长度:', latestConfig.character.length);
      if (latestConfig.character.length > 0) {
        console.log('[Ge-extension Relay] 第一个角色内容:', latestConfig.character[0].content?.substring(0, 50) + '...');
      }
    }
    console.log('[Ge-extension Relay] 角色数据:', latestConfig.character);

    // 检查角色是否有内容（支持数组和字符串格式）
    const hasCharacter = (Array.isArray(latestConfig.character) && latestConfig.character.length > 0) ||
                         (typeof latestConfig.character === 'string' && latestConfig.character.trim());
    console.log('[Ge-extension Relay] 角色是否有内容:', hasCharacter);

    // 决定下一步
    if (bot4Enabled && latestConfig.materials && latestConfig.materials.length > 0) {
      // 跳转到机器人4进行素材生成
      const delay = 3000 + Math.random() * 3000;
      console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人4');
      await sleep(delay);

      window.open(latestConfig.bot4Url, '_blank');
      console.log('[Ge-extension Relay] 已跳转到机器人4');

      latestConfig.state = 'step2_part2_materials';
      latestConfig.currentMaterialIndex = 0;
      await new Promise((resolve) => {
        chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
      });
    } else if (bot5Enabled && hasCharacter) {
      // Bot4 未启用或无素材，跳过素材生成，直接进入角色生成
      console.log('[Ge-extension Relay] Bot4 未启用或无素材，跳过素材生成，准备跳转到机器人5');

      const delay = 3000 + Math.random() * 3000;
      console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人5');
      await sleep(delay);

      window.open(latestConfig.bot5Url, '_blank');
      console.log('[Ge-extension Relay] 已跳转到机器人5');

      latestConfig.state = 'step2_part3_character';
      await new Promise((resolve) => {
        chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
      });
    } else {
      // Bot4 和 Bot5 都未启用或无数据，检查 Bot7
      const bot7Enabled = latestConfig.bot7Enabled !== false && latestConfig.bot7Url;

      if (bot7Enabled) {
        // 暂停等待用户填写参考图数据
        console.log('[Ge-extension Relay] Bot4/Bot5 未启用或无数据，Bot7 启用，暂停等待参考图输入');
        latestConfig.state = 'waiting_for_bot7_input';
        latestConfig.isPaused = true;
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
        showNotification('请填写参考图数据后点击继续');
      } else {
        // 全部未启用，直接完成
        console.log('[Ge-extension Relay] Bot4、Bot5、Bot7 都未启用或无数据，第二步完成');

        latestConfig.state = 'completed';
        latestConfig.isPaused = false;
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });

        console.log('[Ge-extension Relay] ===== 第二步全部完成 =====');
        showNotification('✓ 第二步全部完成！');
      }
    }
  }

  // ========== 7.4.4 执行第二步第二部分：素材生成 ==========
  async function executeStep2Part2(config) {
    console.log('[Ge-extension Relay] ===== 执行素材生成 =====');
    console.log('[Ge-extension Relay] 素材总数:', config.materials.length);
    console.log('[Ge-extension Relay] 当前素材索引:', config.currentMaterialIndex);

    // 等待页面加载完成
    await sleep(3000);

    // 依次发送每个素材
    for (let i = config.currentMaterialIndex; i < config.materials.length; i++) {
      // 检查是否被停止或暂停
      const checkResult = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      if (!checkResult.geStep2Config) {
        console.log('[Ge-extension Relay] 检测到停止信号，中止素材生成');
        return;
      }

      // 检查是否被暂停
      if (checkResult.geStep2Config.isPaused) {
        console.log('[Ge-extension Relay] 检测到暂停信号，等待恢复...');
        // 只保存进度字段，不覆盖 materials（用户可能在 popup 中修改过）
        await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], (result) => {
            const latestConfig = result.geStep2Config || {};
            // 只更新进度字段，保留最新的 materials
            latestConfig.currentMaterialIndex = i;
            latestConfig.currentSceneIndex = config.currentSceneIndex;
            latestConfig.state = config.state;
            latestConfig.isPaused = checkResult.geStep2Config.isPaused;
            chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
          });
        });
        // 等待恢复（每秒检查一次）
        while (true) {
          await sleep(1000);
          const pauseCheck = await new Promise(resolve => {
            chrome.storage.local.get(['geStep2Config'], resolve);
          });
          if (!pauseCheck.geStep2Config) {
            console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
            return;
          }
          if (!pauseCheck.geStep2Config.isPaused) {
            console.log('[Ge-extension Relay] 检测到恢复信号，继续执行');
            // 恢复时重新读取完整配置（可能被 handleResumeRelay 更新过）
            const resumeConfig = pauseCheck.geStep2Config;
            config.isPaused = false;
            config.currentSceneIndex = resumeConfig.currentSceneIndex;
            config.currentMaterialIndex = resumeConfig.currentMaterialIndex;
            config.state = resumeConfig.state;
            config.scenes = resumeConfig.scenes || config.scenes;
            config.materials = resumeConfig.materials || config.materials;
            console.log('[Ge-extension Relay] 恢复后的配置: currentMaterialIndex=', config.currentMaterialIndex, ', state=', config.state);
            // 如果 currentMaterialIndex 被更新到更早的位置，需要调整循环变量 i
            // 设置为 currentMaterialIndex - 1，因为 for 循环结束时会 i++
            if (config.currentMaterialIndex <= i) {
              i = config.currentMaterialIndex - 1;
              console.log('[Ge-extension Relay] 素材索引回退，下一次将从素材', config.currentMaterialIndex + 1, '开始');
            }
            break;
          }
        }
      }

      // 从 storage 重新读取最新的素材数据（用户可能在 popup 中修改过）
      console.log('[Ge-extension Relay] [发送前] 准备从 storage 读取最新素材数据...');
      const latestConfig = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      console.log('[Ge-extension Relay] [发送前] storage 读取结果存在:', !!latestConfig.geStep2Config);
      console.log('[Ge-extension Relay] [发送前] storage 中素材数量:', latestConfig.geStep2Config?.materials?.length);
      if (latestConfig.geStep2Config?.materials) {
        config.materials = latestConfig.geStep2Config.materials;
        console.log('[Ge-extension Relay] [发送前] 已从 storage 更新 config.materials');
      }

      const material = config.materials[i];
      const materialNumber = i + 1;

      console.log('[Ge-extension Relay] 发送素材', materialNumber, '/', config.materials.length);
      console.log('[Ge-extension Relay] [发送前] 素材', materialNumber, 'name:', material?.name);
      console.log('[Ge-extension Relay] [发送前] 素材', materialNumber, 'rawLine:', material?.rawLine?.substring(0, 50) + '...');

      // 优先使用原始行（包含制表符），如果没有则用拼接方式
      // 添加素材角色设置前缀
      const materialSettingPrefix = config.materialSetting ? `${config.materialSetting}\n` : '';
      const materialContent = material.rawLine || `${material.name} ${material.description} ${material.steps}`.trim();
      const message = materialSettingPrefix + materialContent;
      console.log('[Ge-extension Relay] [发送前] 最终发送的素材内容:', message);
      console.log('[Ge-extension Relay] 使用', material.rawLine ? 'rawLine (原始行)' : '拼接方式');

      // 获取素材的图片
      const materialImages = material.images || [];
      console.log('[Ge-extension Relay] [发送前] 素材', materialNumber, '图片数量:', materialImages.length);

      // 发送消息（包含图片）
      await sendAndWaitForComplete(message, materialImages);

      console.log('[Ge-extension Relay] 素材', materialNumber, '生成完成');

      // 只更新进度字段，不覆盖 materials（用户可能在 popup 中修改过）
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          // 只更新进度字段，保留最新的 materials
          latestConfig.currentMaterialIndex = i + 1;
          latestConfig.currentSceneIndex = config.currentSceneIndex;
          latestConfig.state = config.state;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });
    }

    console.log('[Ge-extension Relay] 所有素材生成完成');

    // 记录机器人4完成
    await updateTaskBotRecord('bot4', {
      ran: true,
      materialSetting: config.materialSetting || '',
      materials: config.materials || [],
      materialCount: config.materials?.length || 0
    });

    // 检查是否有角色信息、机器人5的URL和启用状态
    const latestResult = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    const latestConfig = latestResult.geStep2Config || config;

    // 检查 Bot5 是否启用
    const bot5Enabled = latestConfig.bot5Enabled !== false;

    // 检查角色信息（支持数组和字符串格式）
    const hasCharacter = (Array.isArray(latestConfig.character) && latestConfig.character.length > 0) ||
                         (typeof latestConfig.character === 'string' && latestConfig.character.trim());

    if (bot5Enabled && hasCharacter && latestConfig.bot5Url) {
      // 有角色信息且 Bot5 启用，跳转到机器人5
      console.log('[Ge-extension Relay] 有角色信息且 Bot5 启用，准备跳转到机器人5');

      // 更新状态为第三部分
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const cfg = result.geStep2Config || {};
          cfg.state = 'step2_part3_character';
          cfg.isPaused = false;
          chrome.storage.local.set({ geStep2Config: cfg }, resolve);
        });
      });

      // 延迟3-6秒后跳转到机器人5
      const delay = 3000 + Math.random() * 3000;
      console.log('[Ge-extension Relay] 将在', Math.round(delay/1000), '秒后跳转到机器人5');
      await sleep(delay);

      window.open(latestConfig.bot5Url, '_blank');
      console.log('[Ge-extension Relay] 已跳转到机器人5');
    } else {
      // Bot5 未启用或没有角色信息或机器人5 URL，检查 Bot7
      const bot7Enabled = latestConfig.bot7Enabled !== false && latestConfig.bot7Url;

      if (bot7Enabled) {
        // 暂停等待用户填写参考图数据
        console.log('[Ge-extension Relay] Bot5 未启用或无数据，Bot7 启用，暂停等待参考图输入');
        latestConfig.state = 'waiting_for_bot7_input';
        latestConfig.isPaused = true;
        await new Promise((resolve) => {
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
        showNotification('请填写参考图数据后点击继续');
      } else {
        // Bot5 和 Bot7 都未启用，直接完成
        console.log('[Ge-extension Relay] Bot5 未启用或无角色信息或无 URL，第二步完成');

        await new Promise((resolve) => {
          chrome.storage.local.get(['geStep2Config'], (result) => {
            const cfg = result.geStep2Config || {};
            cfg.state = 'completed';
            cfg.isPaused = false;
            chrome.storage.local.set({ geStep2Config: cfg }, resolve);
          });
        });

        console.log('[Ge-extension Relay] ===== 第二步全部完成 =====');
        showNotification('✓ 第二步全部完成！');
      }
    }
  }

  // ========== 7.4.4.3 执行第二步第三部分：角色生成 ==========
  async function executeStep2Part3(config) {
    console.log('[Ge-extension Relay] ===== 执行角色生成 =====');

    // 检查角色信息（支持数组和字符串格式）
    const hasCharacter = (Array.isArray(config.character) && config.character.length > 0) ||
                         (typeof config.character === 'string' && config.character.trim());
    console.log('[Ge-extension Relay] 角色信息:', hasCharacter ? '有' : '无');

    if (!hasCharacter) {
      console.log('[Ge-extension Relay] 无角色信息，跳过第三部分');

      // 直接标记完成
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          latestConfig.state = 'completed';
          latestConfig.isPaused = false;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });

      console.log('[Ge-extension Relay] ===== 第二步全部完成 =====');
      showNotification('✓ 第二步全部完成！');
      return;
    }

    // 等待页面加载完成
    await sleep(3000);

    // 检查是否被停止
    const checkResult = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    if (!checkResult.geStep2Config) {
      console.log('[Ge-extension Relay] 检测到停止信号，中止角色生成');
      return;
    }

    // 检查是否被暂停
    if (checkResult.geStep2Config.isPaused) {
      console.log('[Ge-extension Relay] 检测到暂停信号，等待恢复...');
      await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          latestConfig.state = 'step2_part3_character';
          latestConfig.isPaused = true;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });

      // 等待恢复
      while (true) {
        await sleep(1000);
        const pauseCheck = await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], resolve);
        });
        if (!pauseCheck.geStep2Config) {
          console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
          return;
        }
        if (!pauseCheck.geStep2Config.isPaused) {
          console.log('[Ge-extension Relay] 检测到恢复信号，继续执行');
          break;
        }
      }
    }

    // 从 storage 重新读取最新的角色数据（用户可能在 popup 中修改过）
    console.log('[Ge-extension Relay] [发送前] 准备从 storage 读取最新角色数据...');
    const latestConfig = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    console.log('[Ge-extension Relay] [发送前] storage 读取结果存在:', !!latestConfig.geStep2Config);

    let character = config.character;
    if (latestConfig.geStep2Config?.character) {
      character = latestConfig.geStep2Config.character;
      console.log('[Ge-extension Relay] [发送前] 已从 storage 更新角色数据');
    }

    // 获取角色图片（支持数组和字符串格式）
    let characterImages = [];
    if (Array.isArray(character)) {
      // 新格式：character 是数组，每个元素包含 { content, images }
      // 合并所有角色的图片
      characterImages = character.flatMap(c => c.images || []);
    } else {
      // 旧格式：从独立字段获取图片
      characterImages = latestConfig.geStep2Config?.characterImages || [];
    }
    console.log('[Ge-extension Relay] [发送前] 角色图片数量:', characterImages.length);

    // 构建角色文本内容
    let characterText = '';
    if (Array.isArray(character)) {
      // 新格式：合并所有角色的内容
      characterText = character.map(c => c.content || '').join('\n\n');
    } else {
      // 旧格式：直接使用字符串
      characterText = character || '';
    }

    console.log('[Ge-extension Relay] 发送角色信息');
    console.log('[Ge-extension Relay] [发送前] 角色内容:', characterText?.substring(0, 100) + '...');

    // 构建角色消息，添加素材角色设置前缀
    const materialSettingPrefix = config.materialSetting ? `${config.materialSetting}\n` : '';
    const message = materialSettingPrefix + characterText;
    console.log('[Ge-extension Relay] [发送前] 最终发送的角色内容:', message.substring(0, 100) + '...');

    // 发送消息（包含图片）
    await sendAndWaitForComplete(message, characterImages);

    console.log('[Ge-extension Relay] 角色生成完成');

    // 记录机器人5完成
    await updateTaskBotRecord('bot5', {
      ran: true,
      character: characterText || '',
      characterImages: characterImages?.length || 0
    });

    // 更新状态 — 检查 Bot7 是否启用
    const bot7Result = await new Promise((resolve) => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    const bot7Config = bot7Result.geStep2Config || {};
    const bot7Enabled = bot7Config.bot7Enabled !== false && bot7Config.bot7Url;

    if (bot7Enabled) {
      // Bot7 启用，暂停等待用户填写参考图数据
      console.log('[Ge-extension Relay] Bot5 完成，Bot7 启用，暂停等待参考图输入');
      bot7Config.state = 'waiting_for_bot7_input';
      bot7Config.isPaused = true;
      await new Promise((resolve) => {
        chrome.storage.local.set({ geStep2Config: bot7Config }, resolve);
      });
      showNotification('请填写参考图数据后点击继续');
    } else {
      // Bot7 未启用，直接完成
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          latestConfig.state = 'completed';
          latestConfig.isPaused = false;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });

      console.log('[Ge-extension Relay] ===== 第二步全部完成 =====');
      showNotification('✓ 第二步全部完成！');
    }
  }

  // ========== 7.4.4.4 执行第二步第四部分：参考图生成（机器人7/编号8） ==========
  async function executeStep2Part4(config) {
    console.log('[Ge-extension Relay] ===== 执行参考图生成（机器人7/编号8） =====');

    const referenceImages = config.referenceImages || [];
    console.log('[Ge-extension Relay] 参考图条目数:', referenceImages.length);

    if (referenceImages.length === 0) {
      console.log('[Ge-extension Relay] 无参考图数据，跳过');

      // 更新状态为完成
      await new Promise((resolve) => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          latestConfig.state = 'completed';
          latestConfig.isPaused = false;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });

      showNotification('✓ 参考图任务跳过（无数据），第二步完成！');
      return;
    }

    // 等待页面加载完成
    await sleep(3000);

    // 从 storage 重新读取最新数据（用户可能在 popup 中修改过）
    const latestStorage = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    const latestConfig = latestStorage.geStep2Config || config;
    const latestReferences = latestConfig.referenceImages || referenceImages;

    // 依次发送每个参考图条目
    for (let i = (latestConfig.currentReferenceIndex || 0); i < latestReferences.length; i++) {
      const ref = latestReferences[i];
      if (!ref || !ref.name) {
        console.log('[Ge-extension Relay] 跳过空参考图条目:', i);
        continue;
      }

      // 检查是否被停止
      const checkResult = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      if (!checkResult.geStep2Config) {
        console.log('[Ge-extension Relay] 检测到停止信号，中止参考图生成');
        return;
      }

      // 检查是否被暂停
      if (checkResult.geStep2Config.isPaused) {
        console.log('[Ge-extension Relay] 检测到暂停信号，保存进度...');
        await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], (result) => {
            const latest = result.geStep2Config || {};
            latest.currentReferenceIndex = i;
            latest.isPaused = true;
            chrome.storage.local.set({ geStep2Config: latest }, resolve);
          });
        });
        // 等待恢复
        while (true) {
          await sleep(1000);
          const pauseCheck = await new Promise(resolve => {
            chrome.storage.local.get(['geStep2Config'], resolve);
          });
          if (!pauseCheck.geStep2Config) {
            console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
            return;
          }
          if (!pauseCheck.geStep2Config.isPaused) {
            console.log('[Ge-extension Relay] 检测到恢复信号，继续执行');
            break;
          }
        }
      }

      console.log('[Ge-extension Relay] 发送参考图', i + 1, '/', latestReferences.length, ':', ref.name);

      // 构建发送消息
      const message = ref.name;
      const images = ref.images || [];

      // 发送消息并等待完成
      await sendAndWaitForComplete(message, images.length > 0 ? images : null);

      console.log('[Ge-extension Relay] 参考图', i + 1, '生成完成');

      // 保存进度（只更新进度字段，不覆盖 referenceImages 等数据）
      await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latest = result.geStep2Config || {};
          latest.currentReferenceIndex = i + 1;
          chrome.storage.local.set({ geStep2Config: latest }, resolve);
        });
      });
    }

    // 记录机器人7完成
    await updateTaskBotRecord('bot7', {
      ran: true,
      referenceCount: latestReferences.length
    });

    // 更新状态为完成
    await new Promise((resolve) => {
      chrome.storage.local.get(['geStep2Config'], (result) => {
        const completedConfig = result.geStep2Config || {};
        completedConfig.state = 'completed';
        completedConfig.isPaused = false;
        chrome.storage.local.set({ geStep2Config: completedConfig }, resolve);
      });
    });

    console.log('[Ge-extension Relay] ===== 参考图生成全部完成 =====');
    showNotification('✓ 参考图生成完成！');
  }

  // ========== 7.4.4 切换到 Thinking 模式 ==========
  async function switchToThinkingMode() {
    console.log('[Ge-extension Relay] 尝试切换到 Thinking 模式');

    // 检查总开关状态
    const switchResult = await new Promise(resolve => {
      chrome.storage.local.get(['geThinkingModeEnabled'], resolve);
    });
    if (switchResult.geThinkingModeEnabled === false) {
      console.log('[Ge-extension Relay] Thinking模式已关闭，跳过切换');
      return;
    }

    // 先检查当前是否已经是 Thinking 模式（检查页面上显示的当前模式文本）
    const currentModeLabel = document.querySelector('.logo-pill-label-container span.gds-title-m');
    const currentModeText = currentModeLabel ? currentModeLabel.textContent.trim() : '';
    if (currentModeText === 'Thinking' || currentModeText === '思考') {
      console.log('[Ge-extension Relay] 当前已是 Thinking 模式，跳过切换');
      return;
    }

    // 最多重试5次
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[Ge-extension Relay] 第 ${attempt} 次尝试切换 Thinking 模式`);

      // 点击下拉箭头展开模式选择菜单
      const dropdownIcon = document.querySelector('mat-icon[data-mat-icon-name="keyboard_arrow_down"]');
      if (dropdownIcon) {
        dropdownIcon.click();
        console.log('[Ge-extension Relay] 已点击下拉箭头');
        await sleep(500); // 等待菜单展开
      } else {
        console.log('[Ge-extension Relay] 未找到下拉箭头');
        if (attempt < 5) {
          console.log('[Ge-extension Relay] 2秒后重试...');
          await sleep(2000);
          continue;
        }
        break;
      }

      // 在下拉菜单中查找 Thinking 选项
      const menuOptions = document.querySelectorAll('.title-and-check');
      console.log('[Ge-extension Relay] 找到下拉菜单选项数量:', menuOptions.length);
      let thinkingOption = null;
      for (const opt of menuOptions) {
        const optText = opt.textContent.trim();
        console.log('[Ge-extension Relay] 菜单选项文本:', optText);
        if (optText.includes('Thinking') || optText.includes('思考')) {
          thinkingOption = opt;
          break;
        }
      }

      if (thinkingOption) {
        thinkingOption.click();
        console.log('[Ge-extension Relay] 已点击 Thinking 选项');
        await sleep(500); // 等待模式切换
        return; // 成功切换，退出函数
      } else {
        console.log('[Ge-extension Relay] 未找到 Thinking 选项');
        if (attempt < 5) {
          console.log('[Ge-extension Relay] 2秒后重试...');
          await sleep(2000);
        }
      }
    }

    console.log('[Ge-extension Relay] 5次尝试后仍未成功切换 Thinking 模式，跳过');
  }

  // 记录上一次发送的消息和图片（用于检测发送失败后重发）
  let lastSentMessage = null;
  let lastSentImages = null;

  // ========== 任务历史记录相关 ==========

  // 更新任务的机器人记录
  async function updateTaskBotRecord(botKey, data) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geCurrentTaskId', 'geTaskHistory'], (result) => {
        const currentTaskId = result.geCurrentTaskId;
        if (!currentTaskId) {
          console.log('[Ge-extension Relay] 没有当前任务ID，跳过记录');
          resolve(false);
          return;
        }

        let tasks = result.geTaskHistory || [];
        const taskIndex = tasks.findIndex(t => t.taskId === currentTaskId);

        if (taskIndex === -1) {
          console.log('[Ge-extension Relay] 找不到当前任务，跳过记录');
          resolve(false);
          return;
        }

        // 更新对应机器人的记录
        tasks[taskIndex].bots[botKey] = {
          ...tasks[taskIndex].bots[botKey],
          ...data,
          ran: true
        };

        chrome.storage.local.set({ geTaskHistory: tasks }, () => {
          console.log('[Ge-extension Relay] 任务记录已更新:', botKey, data);
          resolve(true);
        });
      });
    });
  }

  // ========== 7.4.5 发送消息并等待完成 ==========
  async function sendAndWaitForComplete(message, images = null) {
    console.log('[Ge-extension Relay] 发送消息:', message.substring(0, 100));
    if (images && images.length > 0) {
      console.log('[Ge-extension Relay] 附带', images.length, '张图片');
    }

    // 获取输入框，检查是否有残留内容（说明上一条没发出去）
    const inputBox = await waitForInputBox();
    if (!inputBox) {
      throw new Error('找不到输入框');
    }

    const currentInputContent = inputBox.textContent?.trim() || inputBox.value?.trim() || '';
    if (currentInputContent.length > 0 && lastSentMessage) {
      console.warn('[Ge-extension Relay] 检测到输入框有残留内容，上一条消息可能未发送成功');
      console.warn('[Ge-extension Relay] 残留内容:', currentInputContent.substring(0, 50) + '...');
      console.log('[Ge-extension Relay] 将重新发送上一条消息...');

      // 清空输入框
      inputBox.value = '';
      inputBox.textContent = '';
      if (inputBox.innerHTML) {
        inputBox.innerHTML = '';
      }
      await sleep(500);

      // 重新发送上一条消息
      console.log('[Ge-extension Relay] 重发上一条消息:', lastSentMessage.substring(0, 100));
      await sendAndWaitForCompleteInternal(lastSentMessage, lastSentImages);
      console.log('[Ge-extension Relay] 上一条消息重发完成');
    }

    // 发送当前消息
    await sendAndWaitForCompleteInternal(message, images);

    // 记录本次发送的消息（用于下次检测）
    lastSentMessage = message;
    lastSentImages = images;
  }

  // ========== 7.4.5.1 内部发送函数 ==========
  async function sendAndWaitForCompleteInternal(message, images = null) {
    console.log('[Ge-extension Relay] [内部] 发送消息:', message.substring(0, 100));

    // 先切换到 Thinking 模式
    await switchToThinkingMode();

    // 获取输入框
    const inputBox = await waitForInputBox();
    if (!inputBox) {
      throw new Error('找不到输入框');
    }

    // 如果有图片，先粘贴图片，等待 60 秒后发送
    if (images && images.length > 0) {
      await pasteImagesToInput(inputBox, images);
      console.log('[Ge-extension Relay] 等待 60 秒让图片加载...');
      await waitWithTimer(60000, 'image_load');
    }

    // 填写消息（如果有图片则不清空输入框，保留已粘贴的图片）
    const hasImages = images && images.length > 0;
    await simulateInput(inputBox, message, hasImages);
    await sleep(500);

    // 循环查找发送按钮，支持暂停恢复
    let sendButton = null;
    while (!sendButton) {
      sendButton = getSendButton();

      if (!sendButton) {
        // 找不到按钮，等待 1.5-2 秒后重试
        const retryDelay = 1500 + Math.random() * 500;
        console.log('[Ge-extension Relay] 找不到发送按钮，', Math.round(retryDelay / 1000 * 10) / 10, '秒后重试');
        await sleep(retryDelay);

        // 检查是否暂停
        const checkResult = await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], resolve);
        });
        if (checkResult.geStep2Config?.isPaused) {
          console.log('[Ge-extension Relay] 找按钮过程中检测到暂停，等待恢复...');
          // 等待恢复
          while (true) {
            await sleep(1000);
            const pauseCheck = await new Promise(resolve => {
              chrome.storage.local.get(['geStep2Config'], resolve);
            });
            if (!pauseCheck.geStep2Config) {
              console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
              throw new Error('已停止');
            }
            if (!pauseCheck.geStep2Config.isPaused) {
              console.log('[Ge-extension Relay] 检测到恢复信号，继续找发送按钮');
              break;
            }
          }
        }
      }
    }

    await simulateClick(sendButton);
    console.log('[Ge-extension Relay] 消息已发送');

    // 先等待40秒，让AI开始生成
    console.log('[Ge-extension Relay] 等待40秒让AI开始生成...');
    await waitWithTimer(40000, 'ai_generate');

    // 等待发送按钮图标变化（表示生成完成）
    await waitForSendButtonReady();
    console.log('[Ge-extension Relay] 检测到生成完成');
  }

  // ========== 7.4.6 等待发送按钮恢复可用状态 ==========
  async function waitForSendButtonReady() {
    console.log('[Ge-extension Relay] 等待生成完成...');

    let wasDisabled = null; // 初始为 null，第一次检查时记录实际状态
    let unchangedCount = 0;
    const maxUnchangedCount = 20; // 最多检测20次

    while (unchangedCount < maxUnchangedCount) {
      // 先等待1-3秒再检查（每次检查前都要等待）
      const randomDelay = 1000 + Math.random() * 2000; // 1-3秒
      console.log('[Ge-extension Relay] 等待', Math.round(randomDelay / 1000), '秒后检查');
      await sleep(randomDelay);

      // 检查是否被停止或暂停
      const checkResult = await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], resolve);
      });
      if (!checkResult.geStep2Config) {
        console.log('[Ge-extension Relay] 等待生成期间检测到停止信号');
        throw new Error('已停止');
      }

      // 检查是否被暂停
      if (checkResult.geStep2Config.isPaused) {
        console.log('[Ge-extension Relay] 等待生成期间检测到暂停信号，等待恢复...');
        // 等待恢复
        while (true) {
          await sleep(1000);
          const pauseCheck = await new Promise(resolve => {
            chrome.storage.local.get(['geStep2Config'], resolve);
          });
          if (!pauseCheck.geStep2Config) {
            console.log('[Ge-extension Relay] 暂停期间检测到停止信号');
            throw new Error('已停止');
          }
          if (!pauseCheck.geStep2Config.isPaused) {
            console.log('[Ge-extension Relay] 检测到恢复信号，继续等待生成完成');
            break;
          }
        }
      }

      // 检查发送按钮状态
      const sendButton = document.querySelector('button mat-icon.send-button-icon, mat-icon.send-button-icon, button[aria-label*="发送"], button[aria-label*="Send"]');

      if (sendButton) {
        // 检查按钮是否禁用
        const isDisabled = sendButton.closest('button')?.disabled ||
                           sendButton.closest('button')?.getAttribute('aria-disabled') === 'true';

        // 检查图标类名
        const iconElement = sendButton.tagName === 'MAT-ICON' || sendButton.classList.contains('mat-icon')
          ? sendButton
          : sendButton.querySelector('mat-icon');

        const iconClass = iconElement?.className || '';
        console.log('[Ge-extension Relay] 按钮状态 - 禁用:', isDisabled, '图标:', iconClass, '上一次禁用:', wasDisabled);

        // 第一次检查时初始化状态
        if (wasDisabled === null) {
          wasDisabled = isDisabled;
          console.log('[Ge-extension Relay] 初始化按钮状态 - 禁用:', wasDisabled);
          // 初始化后继续，不计数
          continue;
        }

        // 检测状态变化：从禁用变为可用，立即退出
        if (wasDisabled && !isDisabled) {
          console.log('[Ge-extension Relay] 检测到按钮从禁用变为可用，立即发送');
          return; // 直接返回，不需要再等
        }

        // 更新上一次的禁用状态
        wasDisabled = isDisabled;

        // 如果当前是禁用状态，继续等待
        if (isDisabled) {
          unchangedCount++;
          console.log('[Ge-extension Relay] 按钮仍禁用，计数:', unchangedCount, '/', maxUnchangedCount);
        } else {
          // 按钮已可用（从开始就是可用）
          console.log('[Ge-extension Relay] 按钮已可用，可以发送');
          break; // 退出循环
        }
      } else {
        console.log('[Ge-extension Relay] 警告：找不到发送按钮，继续等待');
        unchangedCount++;
      }
    }

    console.log('[Ge-extension Relay] 发送按钮已恢复，生成完成');
  }

  // ========== 7.5 停止机器人接力 ==========
  function handleStopRelay(sendResponse) {
    console.log('[Ge-extension Relay] 停止接力');

    // 清除 URL 监听
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }

    // 重置第一步状态
    relayConfig.state = RELAY_STATE.IDLE;
    relayConfig.startUrl = null;
    relayConfig.startGemId = null;
    relayConfig.savedPrevReply = null;
    relayConfig.savedGemReply = null;
    saveRelayConfig();

    // 清除第二步配置
    chrome.storage.local.remove(['geStep2Config'], () => {
      console.log('[Ge-extension Relay] 第二步配置已清除');
    });

    sendResponse({ success: true });
  }

  // ========== 7.51 暂停机器人接力 ==========
  async function handlePauseRelay(sendResponse) {
    console.log('[Ge-extension Relay] 暂停接力');

    relayConfig.isPaused = true;
    saveRelayConfig();

    // 清除 URL 监听（暂停跳转）
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }

    // 检查第二步状态，设置第二步暂停
    const step2Result = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    if (step2Result.geStep2Config && step2Result.geStep2Config.state !== 'completed') {
      step2Result.geStep2Config.isPaused = true;
      await new Promise(resolve => {
        chrome.storage.local.set({ geStep2Config: step2Result.geStep2Config }, resolve);
      });
      console.log('[Ge-extension Relay] 第二步已暂停');
    }

    sendResponse({ success: true });
  }

  // ========== 7.52 继续机器人接力（智能恢复） ==========
  async function handleResumeRelay(sendResponse) {
    console.log('[Ge-extension Relay] 继续接力（智能恢复）');

    relayConfig.isPaused = false;
    saveRelayConfig();

    // 【关键修复】无论 config 是否存在，都要先设置 isPaused = false 到 storage
    // 这样暂停循环才能检测到恢复信号
    await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], (result) => {
        const latestConfig = result.geStep2Config || {};
        latestConfig.isPaused = false;
        latestConfig.urlRetryCount = 0;
        chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        console.log('[Ge-extension Relay] 已设置 isPaused = false 到 storage');
      });
    });

    // 读取修改信息
    const modifyResult = await new Promise(resolve => {
      chrome.storage.local.get(['geModifyInfo'], resolve);
    });
    const modifyInfo = modifyResult.geModifyInfo;
    console.log('[Ge-extension Relay] 修改信息:', modifyInfo);

    // 读取当前第二步配置
    const step2Result = await new Promise(resolve => {
      chrome.storage.local.get(['geStep2Config'], resolve);
    });
    const config = step2Result.geStep2Config;

    if (config && config.state !== 'completed') {

      // 智能恢复逻辑
      let needJump = false;
      let jumpUrl = null;
      let newState = config.state;
      let newSceneIndex = config.currentSceneIndex;
      let newMaterialIndex = config.currentMaterialIndex;
      let newReferenceIndex = config.currentReferenceIndex;

      if (modifyInfo) {
        const { modifiedSceneIndex, modifiedMaterialIndex, modifiedCharacter, modifiedReferenceIndex } = modifyInfo;

        // 判断逻辑
        if (modifiedSceneIndex !== -1) {
          // 有场景被修改
          console.log('[Ge-extension Relay] 检测到场景', modifiedSceneIndex + 1, '被修改');

          // 如果当前在素材部分，或者修改的场景在当前执行位置之前
          if (config.state === 'step2_part2_materials' ||
              (config.state === 'step2_part1_scenes' && config.currentSceneIndex > modifiedSceneIndex)) {
            // 需要跳转到机器人3（场景生成页面），从修改的场景开始
            needJump = true;
            jumpUrl = config.bot3Url;
            newState = 'step2_part1_scenes';
            newSceneIndex = modifiedSceneIndex;
            newMaterialIndex = 0;
            console.log('[Ge-extension Relay] 需要跳转到机器人3，从场景', modifiedSceneIndex + 1, '重新开始');
          } else {
            console.log('[Ge-extension Relay] 修改的场景在当前位置之后，继续正常执行');
          }
        } else if (modifiedMaterialIndex !== -1) {
          // 只有素材被修改（没有场景被修改）
          console.log('[Ge-extension Relay] 检测到素材', modifiedMaterialIndex + 1, '被修改');

          // 如果修改的素材在当前执行位置之前
          if (config.state === 'step2_part2_materials' && config.currentMaterialIndex > modifiedMaterialIndex) {
            // 需要跳转到机器人4（素材生成页面），从修改的素材重新开始
            // 跳转到新页面可以确保 content.js 重新初始化，读取最新的 materials 数据
            needJump = true;
            jumpUrl = config.bot4Url;
            newState = 'step2_part2_materials';
            newMaterialIndex = modifiedMaterialIndex;
            console.log('[Ge-extension Relay] 需要跳转到机器人4，从素材', modifiedMaterialIndex + 1, '重新开始');
          } else if (config.state === 'step2_part1_scenes') {
            // 当前在场景部分，素材的修改不影响当前执行
            console.log('[Ge-extension Relay] 当前在场景部分，素材修改不影响执行');
          } else {
            console.log('[Ge-extension Relay] 修改的素材在当前位置之后，继续正常执行');
          }
        }

        // 角色修改不影响执行顺序，最后会发送角色
        if (modifiedCharacter) {
          console.log('[Ge-extension Relay] 检测到角色被修改，将在最后发送新角色');
        }

        // 参考图修改检测
        if (modifiedReferenceIndex !== undefined && modifiedReferenceIndex !== -1) {
          console.log('[Ge-extension Relay] 检测到参考图', modifiedReferenceIndex + 1, '被修改');

          // 如果修改的参考图在当前执行位置之前
          if (config.currentReferenceIndex > modifiedReferenceIndex) {
            needJump = true;
            jumpUrl = config.bot7Url;
            newState = 'step2_part4_bot7';
            newReferenceIndex = modifiedReferenceIndex;
            console.log('[Ge-extension Relay] 需要跳转到机器人8，从参考图', modifiedReferenceIndex + 1, '重新开始');
          } else {
            console.log('[Ge-extension Relay] 修改的参考图在当前位置之后，继续正常执行');
          }
        }
      }

      // 更新配置（只更新进度字段，保留最新的 scenes 和 materials）
      await new Promise(resolve => {
        chrome.storage.local.get(['geStep2Config'], (result) => {
          const latestConfig = result.geStep2Config || {};
          // 只更新进度字段，保留最新的 scenes 和 materials
          latestConfig.state = newState;
          latestConfig.currentSceneIndex = newSceneIndex;
          latestConfig.currentMaterialIndex = newMaterialIndex;
          latestConfig.currentReferenceIndex = newReferenceIndex;
          latestConfig.isPaused = false;
          latestConfig.urlRetryCount = 0;
          chrome.storage.local.set({ geStep2Config: latestConfig }, resolve);
        });
      });
      console.log('[Ge-extension Relay] 第二步配置已更新:', {
        state: newState,
        currentSceneIndex: newSceneIndex,
        currentMaterialIndex: newMaterialIndex,
        currentReferenceIndex: newReferenceIndex
      });

      // 清除修改信息（已经处理过了）
      await new Promise(resolve => {
        chrome.storage.local.remove(['geModifyInfo'], resolve);
      });

      // 兜底跳转：URL 校验失败导致的暂停，恢复时重新跳转到正确的 bot 页面
      if (!needJump && config.urlVerifyFailed) {
        const botUrlsResult = await new Promise(resolve => {
          chrome.storage.local.get(['geBotUrls'], resolve);
        });
        const botUrls = botUrlsResult.geBotUrls || {};
        const stateToUrlKey = {
          'step2_part1_scenes': 'bot3',
          'step2_part2_materials': 'bot4',
          'step2_part3_character': 'bot5',
          'step2_part4_bot7': 'bot7'
        };
        const urlKey = stateToUrlKey[newState || config.state];
        if (urlKey && botUrls[urlKey]) {
          needJump = true;
          jumpUrl = botUrls[urlKey];
          console.log('[Ge-extension Relay] URL 校验失败恢复，重新跳转到:', jumpUrl);
        }
        // 清除失败标志
        await new Promise(resolve => {
          chrome.storage.local.get(['geStep2Config'], (result) => {
            const cfg = result.geStep2Config || {};
            delete cfg.urlVerifyFailed;
            chrome.storage.local.set({ geStep2Config: cfg }, resolve);
          });
        });
      }

      // 如果需要跳转
      if (needJump && jumpUrl) {
        console.log('[Ge-extension Relay] 执行跳转:', jumpUrl);
        sendResponse({ success: true, jumped: true });
        // 使用 location.href 导航到新页面（会在当前标签页打开）
        window.location.href = jumpUrl;
        return;
      }
    }

    // 根据当前状态恢复执行
    if (relayConfig.state === RELAY_STATE.WAITING_FOR_CANVAS_MASTER) {
      // 跳转到画板大师
      performJumpToCanvasMaster();
    } else if (relayConfig.state === RELAY_STATE.SENDING_TO_CANVAS_MASTER) {
      // 继续发送消息给画板大师
      performSendToCanvasMaster();
    } else if (relayConfig.state === RELAY_STATE.WAITING_CANVAS_MASTER_REPLY) {
      // 继续等待画板大师回复
      monitorCanvasMasterReply();
    } else if (relayConfig.state === RELAY_STATE.CANVAS_MASTER_COMPLETED) {
      // 画板大师完成，跳转到机器人2
      performJumpToBot2();
    } else if (relayConfig.state === RELAY_STATE.BOT2_COMPLETED) {
      // 机器人2完成，跳转到机器人4(bot6)
      performJumpToBot6();
    } else if (relayConfig.state === RELAY_STATE.WAITING_FOR_BOT2) {
      // 继续跳转到机器人2
      performJumpToBot2();
    } else if (relayConfig.state === RELAY_STATE.WAITING_FOR_GEM_SELECT) {
      // 继续跳转到机器人（兼容旧状态）
      performJumpToBot2();
    } else if (relayConfig.state === RELAY_STATE.SENDING_TO_GEM) {
      // 继续发送消息
      performSendToGem();
    } else if (relayConfig.state === RELAY_STATE.WAITING_GEM_REPLY) {
      // 继续等待回复
      monitorReplyAndFinish();
    }

    sendResponse({ success: true });
  }

  // ========== 7.6 提取 Gem ID ==========
  function extractGemId(url) {
    if (!url) return null;
    const match = url.match(/\/gem\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }

  // ========== 7.6.1 URL 匹配校验辅助函数 ==========
  /**
   * 判断当前页面 URL 是否匹配期望的目标 URL
   * Gemini URL 提取 /gem/xxxxx 部分比较，其他 URL 用 pathname 比较
   * @param {string} expectedUrl - 期望的目标 URL
   * @returns {boolean} 是否匹配
   */
  function urlMatchesExpected(expectedUrl) {
    if (!expectedUrl) return true; // 没有期望 URL，视为匹配（兼容旧逻辑）

    const currentUrl = window.location.href;
    const expectedGemId = extractGemId(expectedUrl);

    if (expectedGemId) {
      // Gemini URL：比较 Gem ID
      const currentGemId = extractGemId(currentUrl);
      return currentGemId === expectedGemId;
    } else {
      // 非 Gemini URL（如画板大师）：比较 pathname
      try {
        const expectedPath = new URL(expectedUrl).pathname;
        const currentPath = new URL(currentUrl).pathname;
        return expectedPath === currentPath;
      } catch (e) {
        // URL 解析失败，做简单的字符串比较
        return currentUrl.includes(expectedUrl);
      }
    }
  }

  // ========== 7.6.2 URL 校验逻辑（用于 initializeStep2 / initializeRelayState 入口） ==========
  /**
   * 在页面加载时检查当前 URL 是否匹配期望的机器人 URL
   * 不匹配时自动重试跳转，5次失败后暂停等用户处理
   * @param {string} expectedUrl - 期望的目标 URL（从 geBotUrls 动态读取）
   * @param {object} config - geStep2Config 或 relayConfig
   * @param {string} storageKey - 'geStep2Config' 或 'geRelayConfig'
   * @param {string} botName - 机器人名称（用于通知消息）
   * @returns {boolean} true=URL匹配可继续执行, false=需要等待（重试中或已暂停）
   */
  async function verifyExpectedUrl(expectedUrl, config, storageKey, botName) {
    if (!expectedUrl) return true; // 没有期望 URL，直接通过

    if (urlMatchesExpected(expectedUrl)) {
      // URL 匹配成功，清除重试计数
      console.log('[Ge-extension Relay] URL 校验通过，已到达目标页面');
      config.urlRetryCount = 0;
      await new Promise(resolve => {
        chrome.storage.local.set({ [storageKey]: config }, resolve);
      });
      return true;
    }

    // URL 不匹配
    const retryCount = (config.urlRetryCount || 0) + 1;

    if (retryCount <= 5) {
      console.log(`[Ge-extension Relay] URL 不匹配，第 ${retryCount}/5 次重试跳转到 ${botName}`);
      console.log('[Ge-extension Relay] 期望 URL:', expectedUrl);
      console.log('[Ge-extension Relay] 当前 URL:', window.location.href);

      config.urlRetryCount = retryCount;
      await new Promise(resolve => {
        chrome.storage.local.set({ [storageKey]: config }, resolve);
      });

      // 等待 5 秒后重新跳转
      await sleep(5000);
      window.location.href = expectedUrl;
      return false; // 不继续执行，等待页面重新加载
    }

    // 5 次都失败
    console.error(`[Ge-extension Relay] URL 校验失败，已重试 5 次仍未到达 ${botName}`);
    showNotification(`请检查网络问题或手动跳转到【${botName}】`);

    config.isPaused = true;
    config.urlRetryCount = 0;
    config.urlVerifyFailed = true;
    await new Promise(resolve => {
      chrome.storage.local.set({ [storageKey]: config }, resolve);
    });
    return false;
  }

  // ========== 7.7 启动 URL 监听 ==========
  function startUrlMonitoring() {
    // 清除旧的监听
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
    }

    console.log('[Ge-extension Relay] 启动 URL 监听');

    // 每 500ms 检查一次 URL
    urlCheckInterval = setInterval(function() {
      // 检查暂停状态
      if (relayConfig.isPaused) {
        console.log('[Ge-extension Relay] 已暂停，停止 URL 检查');
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
        return;
      }

      const currentUrl = window.location.href;
      const currentGemId = extractGemId(currentUrl);

      console.log('[Ge-extension Relay] 检查 URL:', currentUrl);
      console.log('[Ge-extension Relay] 当前 Gem ID:', currentGemId);
      console.log('[Ge-extension Relay] 起始 Gem ID:', relayConfig.startGemId);

      // 检查是否变成了不同的 Gem 页面
      if (currentGemId && currentGemId !== relayConfig.startGemId) {
        console.log('[Ge-extension Relay] 检测到用户切换到了不同的机器人');

        // 清除监听
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;

        // 自动发送消息
        performSendToGem();
      }
    }, 500);
  }

  // ========== 7.8 执行发送到机器人 ==========
  async function performSendToGem() {
    console.log('[Ge-extension Relay] 开始发送消息到机器人');

    relayConfig.state = RELAY_STATE.SENDING_TO_GEM;
    await saveRelayConfig();

    try {
      if (!relayConfig.savedPrevReply) {
        throw new Error('没有保存的回复');
      }

      // 检查是否有用户修改后的机器人1回复
      const storageResult = await chrome.storage.local.get(['gePrevReplyModified']);
      let message = relayConfig.savedPrevReply;

      if (storageResult.gePrevReplyModified && storageResult.gePrevReplyModified.content) {
        console.log('[Ge-extension Relay] 使用用户修改后的机器人1回复');
        message = storageResult.gePrevReplyModified.content;
      }

      // 构建发送消息，      // bot6模式下不添加格式后缀（机器人4有自己的prompt），bot2模式添加格式后缀
      const isBot6Mode = relayConfig.targetBot === 'bot6';
      if (!isBot6Mode) {
        const formatSuffix = '\n\n分为三大点输出 一、场景（文本格式） 二、素材（表格格式） 三、角色（如果涉及角色 回复使用文本格式）';
        message = message + formatSuffix;
      }
      console.log('[Ge-extension Relay] [发送前] 最终发送到机器人2的内容:', message);

      // 先切换到 Thinking 模式
      await switchToThinkingMode();

      // 获取输入框
      const inputBox = await waitForInputBox();
      if (!inputBox) {
        throw new Error('找不到输入框');
      }

      // 填写消息
      await simulateInput(inputBox, message);
      await sleep(500);

      // 验证消息是否包含格式后缀
      const actualInput = inputBox.value || inputBox.textContent;
      console.log('[Ge-extension Relay] [填写后] 输入框内容长度:', actualInput.length);
      console.log('[Ge-extension Relay] [填写后] 输入框末尾200字符:', actualInput.slice(-200));

      // 验证输入成功
      const inputValue = inputBox.value || inputBox.textContent;
      if (!inputValue.includes(message.substring(0, 50))) {
        throw new Error('消息填写失败');
      }

      // 获取并点击发送按钮
      const sendButton = getSendButton();
      if (!sendButton) {
        throw new Error('找不到发送按钮');
      }

      await simulateClick(sendButton);

      // 等待回复生成（使用新的检测机制）
      relayConfig.state = RELAY_STATE.WAITING_GEM_REPLY;
      await saveRelayConfig();

      await waitForNewGemResponse();

      // 获取回复
      const responseResult = await handleGetLatestResponse();

      if (responseResult.success && responseResult.data) {
        if (isBot6Mode) {
          // 当前在bot6页面，直接完成
          relayConfig.savedGemReply = responseResult.data;
          relayConfig.state = RELAY_STATE.COMPLETED;
          await saveRelayConfig();

          // 记录bot6完成
          await updateTaskBotRecord('bot6', {
            ran: true,
            content: message || ''
          });

          console.log('[Ge-extension Relay] 机器人4完成，第一步完成！');
          showNotification('✓ 第一步完成！');
        } else {
          // 当前在bot2页面
          // 将bot2回复保存到独立storage，供popup解析场景/角色
          await new Promise(r => chrome.storage.local.set({ geBot2Reply: responseResult.data }, r));

          // 读取bot6（机器人4）配置
          const bot6Result = await new Promise(r => chrome.storage.local.get(['geBotUrls'], r));
          const isBot6Enabled = bot6Result.geBotUrls?.bot6Enabled !== false;
          const bot6Url = bot6Result.geBotUrls?.bot6;

          if (isBot6Enabled && bot6Url) {
            // bot6启用：先保存bot2回复，然后跳转到bot6
            relayConfig.savedGemReply = responseResult.data;
            relayConfig.state = RELAY_STATE.BOT2_COMPLETED;
            await saveRelayConfig();

            // 记录机器人2完成
            await updateTaskBotRecord('bot2', {
              ran: true,
              content: message || ''
            });

            console.log('[Ge-extension Relay] 机器人2完成，准备跳转到机器人4');
            showNotification('✓ 机器人2完成，正在跳转到机器人4...');

            // 跳转到bot6
            performJumpToBot6();
          } else {
            // bot6未启用：原逻辑，第一步完成
            relayConfig.savedGemReply = responseResult.data;
            relayConfig.state = RELAY_STATE.COMPLETED;
            await saveRelayConfig();

            // 记录机器人2完成
            await updateTaskBotRecord('bot2', {
              ran: true,
              content: message || ''
            });

            console.log('[Ge-extension Relay] 第一步完成！');
            showNotification('✓ 第一步完成！');
          }
        }
      } else {
        throw new Error('获取回复失败');
      }
    } catch (error) {
      console.error('[Ge-extension Relay] 发送失败:', error);
      relayConfig.state = RELAY_STATE.FAILED;
      await saveRelayConfig();
      showNotification('✗ 发送失败');
    }
  }

  // ========== 7.9 保存接力配置到 storage ==========
  async function saveRelayConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ geRelayConfig: relayConfig }, () => {
        resolve();
      });
    });
  }

  // ========== 7.4 获取最新的 AI 回复（获取完整文本内容）==========
  async function handleGetLatestResponse() {
    console.log('[Ge-extension] 获取最新 AI 回复');

    // 始终使用文本提取方式获取完整内容（包括场景和素材）
    const result = await getResponseByText();

    // 如果成功获取到回复，保存到 storage
    if (result.success && result.data) {
      await saveReplyToStorage(result.data);
    }

    return result;
  }

  // 保存回复内容到 chrome.storage
  async function saveReplyToStorage(content) {
    try {
      const timestamp = Date.now();
      const filename = `gemini-reply-${timestamp}.txt`;

      await chrome.storage.local.set({
        'geLastReply': {
          content: content,
          filename: filename,
          timestamp: timestamp
        }
      });

      console.log('[Ge-extension] 回复已保存到 storage, 文件名:', filename);
    } catch (error) {
      console.error('[Ge-extension] 保存到 storage 失败:', error);
    }
  }

  // 简单方法：直接获取全部回复文本（用于机器人 1）
  async function getSimpleResponse() {
    console.log('[Ge-extension] 使用简单方法获取回复文本');

    const selectors = [
      // Gemini 特定选择器
      'model-response:last-of-type',
      '[data-testid="model-response"]:last-child',
      'markdown.markdown:last-child',
      // 通用选择器
      '.response-container:last-child',
      '.assistant-message:last-child .message-content',
      '[role="assistant"]:last-child .message-text'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[Ge-extension] 找到元素:', selector);

        // 尝试多种提取方式
        const textMethods = [
          () => element.textContent?.trim() || '',
          () => element.innerText?.trim() || '',
          () => {
            // 深度遍历获取所有文本
            let text = '';
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  // 跳过空白节点
                  if (node.textContent.trim().length === 0) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  // 跳过按钮和元数据内的文本
                  const parent = node.parentElement;
                  if (parent && (
                    parent.tagName === 'BUTTON' ||
                    parent.classList.contains('metadata') ||
                    parent.classList.contains('feedback') ||
                    parent.classList.contains('copy-button')
                  )) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            let node;
            while (node = walker.nextNode()) {
              text += node.textContent;
            }
            return text.trim();
          }
        ];

        for (const method of textMethods) {
          const text = method();
          console.log('[Ge-extension] 提取文本长度:', text.length, '前50字符:', text.substring(0, 50));

          if (text && text.length >= 10) {
            console.log('[Ge-extension] 简单方法找到回复，长度:', text.length);
            return { success: true, data: text };
          }
        }
      }
    }

    // 备选：查找所有可能的回复容器
    const allResponses = document.querySelectorAll('[data-testid*="response"], .response, .ai-message');
    console.log('[Ge-extension] 备选方法找到', allResponses.length, '个响应容器');

    for (const resp of Array.from(allResponses).reverse()) {
      const text = resp.textContent?.trim() || '';
      console.log('[Ge-extension] 备选检查元素，文本长度:', text.length);

      if (text && text.length >= 10) {
        console.log('[Ge-extension] 简单方法找到回复，长度:', text.length);
        return { success: true, data: text };
      }
    }

    console.log('[Ge-extension] 简单方法未找到有效的回复');
    return { success: false, error: '未找到有效的回复' };
  }

  // 复杂方法：通过文本提取获取回复（分别处理场景和素材，用于机器人 2）
  async function getResponseByText() {
    console.log('[Ge-extension] 使用文本提取方式获取回复');

    const selectors = [
      // Gemini 特定选择器
      'model-response:last-of-type',
      '[data-testid="model-response"]:last-child',
      'markdown.markdown:last-child',
      // 通用选择器
      '.response-container:last-child',
      '.assistant-message:last-child .message-content',
      '[role="assistant"]:last-child .message-text'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length >= 10) {
        // 先提取素材表格（如果有）
        const tableData = extractTableFromHtml(element);
        const tableText = tableData ? `\n\n二、素材清单\n${tableData}` : '';

        // 再提取场景文本（用普通方式）
        const scenesText = extractScenesText(element);

        // 提取角色文本（三、后面的内容）
        const characterText = extractCharacterText(element);

        // 合并场景、素材和角色
        const fullText = scenesText + tableText + characterText;

        if (fullText && fullText.trim().length > 0) {
          console.log('[Ge-extension] 找到回复，长度:', fullText.length);
          return { success: true, data: fullText };
        }
      }
    }

    // 备选方法：查找所有可能的回复容器
    const allResponses = document.querySelectorAll('[data-testid*="response"], .response, .ai-message');
    for (const resp of Array.from(allResponses).reverse()) {
      const text = extractTextContent(resp);
      if (text && text.length >= 10) {
        console.log('[Ge-extension] 找到回复，长度:', text.length);
        return { success: true, data: text };
      }
    }

    console.log('[Ge-extension] 未找到有效的回复');
    return { success: false, error: '未找到有效的回复' };
  }

  // 提取场景部分的文本
  function extractScenesText(element) {
    console.log('[Ge-extension] 提取场景文本');

    // 先尝试从 HTML 表格中提取场景数据
    const sceneTableData = extractScenesTableFromHtml(element);
    if (sceneTableData) {
      console.log('[Ge-extension] 从表格提取到场景数据，长度:', sceneTableData.length);
      return '一、场景构图简述\n' + sceneTableData;
    }

    // 如果没有找到表格，使用文本方式提取
    console.log('[Ge-extension] 未找到场景表格，使用文本方式提取');

    // 查找包含"场景"的部分
    const fullText = extractTextContent(element);

    // 找到"一、场景构图简述"到"二、素材清单"之间的全部内容
    // 使用贪婪匹配确保捕获完整内容
    const sceneMatch = fullText.match(/一、[\s\S]*?场景构图简述[\s\S]*?(?=二、\s*素材清单|$)/);
    if (sceneMatch) {
      console.log('[Ge-extension] 提取到场景部分，长度:', sceneMatch[0].length);
      return sceneMatch[0];
    }

    // 如果没有明确标记，尝试查找包含"场景"关键词的部分
    const lines = fullText.split('\n');
    let sceneText = '';
    let foundSceneStart = false;

    for (const line of lines) {
      // 检测场景开始（包含"场景"但不是"素材清单"）
      if (!foundSceneStart && (line.includes('场景') || line.includes('构图') || line.match(/^场景\s*\d+/))) {
        foundSceneStart = true;
      }

      // 添加场景区域的每一行，直到遇到结束标记
      if (foundSceneStart) {
        if (line.includes('素材清单') || line.includes('素材类别') || (line.includes('二、') && line.includes('素材'))) {
          break;
        }
        sceneText += line + '\n';
      }
    }

    if (sceneText.length > 0) {
      console.log('[Ge-extension] 通过关键词提取到场景部分');
      return '一、场景构图简述\n' + sceneText;
    }

    // 如果没有找到场景部分，返回全部内容
    console.log('[Ge-extension] 未找到场景部分，返回全部内容');
    return fullText;
  }

  // 提取角色部分的文本
  function extractCharacterText(element) {
    console.log('[Ge-extension] 提取角色文本');

    const fullText = extractTextContent(element);

    // 查找"三、"开头的角色部分（直到文本结束）
    const characterMatch = fullText.match(/三、[\s\S]*$/);
    if (characterMatch) {
      console.log('[Ge-extension] 提取到角色部分，长度:', characterMatch[0].length);
      return '\n\n' + characterMatch[0];
    }

    console.log('[Ge-extension] 未找到角色部分');
    return '';
  }

  // 从 HTML 元素中提取表格数据（素材表格）
  function extractTableFromHtml(element) {
    console.log('[Ge-extension] 尝试从 HTML 提取素材表格');

    // 查找表格
    const tables = element.querySelectorAll('table');
    if (tables.length === 0) {
      console.log('[Ge-extension] 未找到表格元素');
      return null;
    }

    console.log('[Ge-extension] 找到', tables.length, '个表格');

    // 解析表格
    let result = '';
    let lastCategory = ''; // 记录上一个分类（用于空单元格）

    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');

      // 先检查是否是场景表格，如果是则跳过
      const firstRow = rows[0];
      if (firstRow) {
        const headerCells = firstRow.querySelectorAll('td, th');
        const headerText = Array.from(headerCells).map(cell => cell.textContent.trim()).join('');
        if (headerText.includes('场景编号') || headerText.includes('场景名称') ||
            headerText.includes('构图简述') || headerText.includes('场景描述')) {
          console.log('[Ge-extension] 跳过场景表格', tableIndex + 1);
          return;
        }
      }

      console.log('[Ge-extension] 解析素材表格', tableIndex + 1);

      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === 0) return;

        // 提取每列内容
        const rowData = [];
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          rowData.push(text);
        });

        // 跳过看起来像标题的行
        const rowText = rowData.join('');
        if (rowText.includes('素材') && (rowText.includes('状态') || rowText.includes('类别') || rowText.includes('清单'))) {
          console.log('[Ge-extension] 跳过表头行');
          return;
        }

        // 检查第一列是否为空（分类合并）
        let category = rowData[0] || '';
        if (!category && lastCategory) {
          category = lastCategory;
        } else if (category) {
          lastCategory = category;
        }

        // 构建格式化行（制表符分隔）
        if (category && !rowData[0]) {
          // 第一列为空，补充分类
          rowData[0] = category;
        }

        result += rowData.join('\t') + '\n';
      });
    });

    if (result.length > 0) {
      console.log('[Ge-extension] 表格解析成功，总长度:', result.length);
      return result;
    }

    console.log('[Ge-extension] 表格解析失败');
    return null;
  }

  // 从 HTML 元素中提取场景表格数据
  function extractScenesTableFromHtml(element) {
    console.log('[Ge-extension] 尝试从 HTML 提取场景表格');

    // 查找表格
    const tables = element.querySelectorAll('table');
    if (tables.length === 0) {
      console.log('[Ge-extension] 未找到场景表格元素');
      return null;
    }

    console.log('[Ge-extension] 找到', tables.length, '个表格，尝试提取场景数据');

    // 解析表格，查找场景相关的表格
    let result = '';

    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      let isSceneTable = false;

      // 先检查第一行是否包含场景相关的表头
      const firstRow = rows[0];
      if (firstRow) {
        const headerCells = firstRow.querySelectorAll('td, th');
        const headerText = Array.from(headerCells).map(cell => cell.textContent.trim()).join('');

        // 检查是否是场景表格
        if (headerText.includes('场景编号') || headerText.includes('场景名称') ||
            headerText.includes('构图简述') || headerText.includes('场景描述')) {
          isSceneTable = true;
          console.log('[Ge-extension] 识别到场景表格', tableIndex + 1);
        }
      }

      if (!isSceneTable) {
        return; // 不是场景表格，跳过
      }

      // 解析场景表格（跳过表头行）
      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // 跳过表头

        const cells = row.querySelectorAll('td, th');
        if (cells.length === 0) return;

        // 提取每列内容
        const rowData = [];
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          rowData.push(text);
        });

        // 跳过空行
        if (rowData.every(cell => !cell)) return;

        // 构建格式化行（制表符分隔）
        result += rowData.join('\t') + '\n';
      });
    });

    if (result.length > 0) {
      console.log('[Ge-extension] 场景表格解析成功，总长度:', result.length);
      return result;
    }

    console.log('[Ge-extension] 未找到有效的场景表格数据');
    return null;
  }

  // ========== 7.5 发送消息并获取回复 ==========
  async function handleSendAndCollect(data, sendResponse) {
    console.log('[Ge-extension] 发送消息并获取回复');

    try {
      const message = data.message;
      if (!message) {
        sendResponse({ success: false, error: '消息为空' });
        return;
      }

      // 获取输入框
      const inputBox = await waitForInputBox();
      if (!inputBox) {
        sendResponse({ success: false, error: '找不到输入框' });
        return;
      }

      // 填写消息
      await simulateInput(inputBox, message);
      await sleep(500);

      // 验证输入成功
      const inputValue = inputBox.value || inputBox.textContent;
      if (!inputValue.includes(message.substring(0, 50))) {
        sendResponse({ success: false, error: '消息填写失败' });
        return;
      }

      // 获取并点击发送按钮
      const sendButton = getSendButton();
      if (!sendButton) {
        sendResponse({ success: false, error: '找不到发送按钮' });
        return;
      }

      await simulateClick(sendButton);

      // 等待回复生成（使用新的检测机制）
      await waitForNewGemResponse();

      // 获取回复（此时应该已完成）
      const responseResult = await handleGetLatestResponse();

      if (responseResult.success) {
        console.log('[Ge-extension] 获取到新回复');
        sendResponse({ success: true, data: responseResult.data });
      } else {
        sendResponse({ success: false, error: '获取回复失败' });
      }

    } catch (error) {
      console.error('[Ge-extension] 发送消息失败:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // ========== 辅助函数 ==========

  /**
   * 提取元素的文本内容（保留换行符）
   */
  function extractTextContent(element) {
    const clone = element.cloneNode(true);
    const unwanted = clone.querySelectorAll('button, .copy-button, .feedback, .metadata, script, style');
    unwanted.forEach(el => el.remove());

    // 使用 innerText 保留换行符
    return clone.innerText.trim();
  }

  /**
   * 等待输入框可用
   */
  function waitForInputBox() {
    return new Promise((resolve, reject) => {
      const element = document.querySelector('rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], textarea[aria-label*="输入"], div[contenteditable="true"][role="textbox"]');
      if (element) {
        return resolve(element);
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector('rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], div[contenteditable="true"]');
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // 10秒超时
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('等待输入框超时'));
      }, 10000);
    });
  }

  /**
   * 模拟输入
   */
  async function simulateInput(element, text, skipClear = false) {
    element.focus();

    if (!skipClear) {
      element.textContent = '';
    }

    if (element.tagName === 'TEXTAREA') {
      element.value = text;
    } else if (element.isContentEditable) {
      if (skipClear) {
      // 有图片时不清空，追加文字（保留已有的图片元素）
      // 使用 execCommand 模拟键盘输入，兼容富文本编辑器内部状态
      element.focus();
      document.execCommand('insertText', false, text);
    } else {
      element.textContent = text;
    }
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
  }

  /**
   * 模拟点击
   */
  async function simulateClick(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    element.click();
    await sleep(100);
  }

  /**
   * 将 base64 图片转换为 File 对象
   */
  function base64ToFile(base64, filename) {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  /**
   * 粘贴图片到输入框
   */
  async function pasteImagesToInput(inputBox, images) {
    if (!images || images.length === 0) return;

    console.log('[Ge-extension Relay] 准备粘贴', images.length, '张图片...');

    // 将所有 base64 图片转换为 File 对象
    const files = images.map((base64, index) => {
      return base64ToFile(base64, `image_${index + 1}.png`);
    });

    // 使用 DataTransfer 模拟粘贴
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));

    // 创建粘贴事件
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    // 在输入框上触发粘贴事件
    inputBox.focus();
    inputBox.dispatchEvent(pasteEvent);

    console.log('[Ge-extension Relay] 图片粘贴事件已触发');

    // 等待图片上传处理
    await sleep(2000);
  }

  /**
   * 获取发送按钮
   */
  function getSendButton() {
    const selectors = [
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="提交"]',
      'button[data-testid="send-button"]',
      'button[type="submit"]'
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        return button;
      }
    }
    return null;
  }

  /**
   * 等待回复生成完成（用于新机器人回复）
   * 逻辑：等待5秒后，每2秒检查一次，连续两次没变化就完成
   */
  async function waitForNewGemResponse() {
    console.log('[Ge-extension] 等待新机器人回复生成...');

    // 初始等待 5 秒，让 AI 开始生成
    await sleep(5000);
    console.log('[Ge-extension] 开始检测回复内容变化...');

    let prevResponse = null;
    let prevLength = 0;
    let unchangedCount = 0;
    const maxUnchangedCount = 2; // 连续两次没变化就完成
    let hasContent = false; // 是否已经有内容了
    let firstContentCaptured = false; // 是否已捕获第一次内容

    while (unchangedCount < maxUnchangedCount) {
      // 检查暂停状态
      if (relayConfig.isPaused) {
        console.log('[Ge-extension] 检测到暂停，停止等待回复');
        return;
      }

      // 获取当前回复
      const responseResult = await handleGetLatestResponse();
      let currentResponse = '';
      let currentLength = 0;

      if (responseResult.success && responseResult.data) {
        currentResponse = responseResult.data;
        currentLength = currentResponse.length;
      }

      console.log('[Ge-extension] 检测回复，长度:', currentLength, 'hasContent:', hasContent, 'firstCaptured:', firstContentCaptured, 'unchangedCount:', unchangedCount);

      // 只有当有内容后才开始比较
      if (currentLength > 50) {
        if (!hasContent) {
          // 第一次获取到内容，标记有内容，但这次不参与比较
          hasContent = true;
          console.log('[Ge-extension] 检测到内容，等待下一轮开始比较，长度:', currentLength);
        } else if (!firstContentCaptured) {
          // 第二次检测到内容，现在开始正式比较
          firstContentCaptured = true;
          prevResponse = currentResponse;
          prevLength = currentLength;
          console.log('[Ge-extension] 开始正式比较，基准长度:', currentLength);
        } else {
          // 正常比较阶段
          if (currentLength === prevLength && currentResponse === prevResponse) {
            unchangedCount++;
            console.log('[Ge-extension] 回复未变化，计数:', unchangedCount, '/', maxUnchangedCount);
          } else {
            unchangedCount = 0; // 重置计数
            prevResponse = currentResponse;
            prevLength = currentLength;
            console.log('[Ge-extension] 回复有变化，重置计数，新长度:', currentLength);
          }
        }
      } else if (hasContent) {
        // 之前有内容，现在突然变空了（不太可能，但记录一下）
        console.log('[Ge-extension] 警告：回复内容变空');
      }

      // 等待 2 秒后再次检查
      if (unchangedCount < maxUnchangedCount) {
        await sleep(2000);
      }
    }

    console.log('[Ge-extension] 回复生成完成，最终长度:', prevLength);
  }

  /**
   * 检查是否正在生成回复
   */
  function isGeneratingResponse() {
    const indicators = [
      '[data-testid="thinking"]',
      '.loading',
      '.generating',
      '.typing-indicator',
      '[aria-busy="true"]'
    ];

    for (const selector of indicators) {
      const element = document.querySelector(selector);
      if (element && isElementVisible(element)) {
        return true;
      }
    }

    const lastResponse = document.querySelector('[data-testid="model-response"]:last-child, .response:last-child');
    if (lastResponse) {
      const text = lastResponse.textContent;
      if (text.includes('...') || text.includes('正在') || text.includes('生成中')) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查元素是否可见
   */
  function isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * 延迟函数
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 8. 初始化 ==========
  function init() {
    // Content script 已加载，等待来自 popup 的消息
    console.log('[Ge-extension] Content script 已加载，等待指令...');

    // 检查是否有第二步任务需要处理
    initializeStep2();
  }

  // 启动扩展
  init();
})();
