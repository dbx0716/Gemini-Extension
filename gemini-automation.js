/**
 * Gemini 网页多 Agent 串行接力自动化模块
 *
 * 功能说明：
 * - 实现多个 Gemini agent 之间的自动化消息转发
 * - 支持状态机控制流程
 * - 使用 MutationObserver 监听 DOM 变化
 * - 支持重试、超时、错误恢复
 *
 * 使用方法：
 * 1. 在 Gemini 网页中打开控制台
 * 2. 调用 GeminiAutomation.startPipeline() 启动
 * 3. 手动给第一个 agent 发送消息后，自动化开始
 */

(function(window) {
  'use strict';

  // ========================
  // 配置：Agent Pipeline 定义
  // ========================

  /**
   * Agent Pipeline 配置
   * 每个 agent 代表 Gemini 中的一个独立会话/聊天
   *
   * 配置说明：
   * - name: agent 名称，用于日志显示
   * - urlPattern: 匹配该 agent 的 URL 模式
   * - inputSelector: 输入框选择器
   * - sendButtonSelector: 发送按钮选择器
   * - responseSelector: 回复内容容器选择器
   * - waitingIndicatorSelector: 等待指示器选择器（判断是否正在生成）
   * - switchMethod: 切换方法（'tab' | 'sidebar' | 'navigation'）
   * - switchTarget: 切换目标（选择器或 URL）
   */
  const AGENT_PIPELINE = [
    {
      name: 'Agent-1 (Gemma-3)',
      urlPattern: 'gemini.google.com',
      inputSelector: 'rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], textarea[aria-label*="输入"]',
      sendButtonSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[data-testid="send-button"]',
      responseSelector: 'model-response, .response, [data-testid*="response"], .markdown',
      waitingIndicatorSelector: '[data-testid="thinking"], .loading, .generating, [role="status"][aria-busy="true"]',
      switchMethod: 'tab',
      switchTarget: null // 第一个 agent 不需要切换
    },
    {
      name: 'Agent-2 (Flash)',
      urlPattern: 'gemini.google.com',
      inputSelector: 'rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], textarea[aria-label*="输入"]',
      sendButtonSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[data-testid="send-button"]',
      responseSelector: 'model-response, .response, [data-testid*="response"], .markdown',
      waitingIndicatorSelector: '[data-testid="thinking"], .loading, .generating, [role="status"][aria-busy="true"]',
      switchMethod: 'newChat',
      switchTarget: null // 需要在新聊天中切换模型
    },
    {
      name: 'Agent-3 (Pro)',
      urlPattern: 'gemini.google.com',
      inputSelector: 'rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], textarea[aria-label*="输入"]',
      sendButtonSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[data-testid="send-button"]',
      responseSelector: 'model-response, .response, [data-testid*="response"], .markdown',
      waitingIndicatorSelector: '[data-testid="thinking"], .loading, .generating, [role="status"][aria-busy="true"]',
      switchMethod: 'newChat',
      switchTarget: null
    }
  ];

  // ========================
  // 配置：运行时参数
  // ========================

  const CONFIG = {
    // 等待超时时间（毫秒）
    WAIT_TIMEOUT: 120000,        // 等待回复超时：2 分钟
    SWITCH_TIMEOUT: 30000,       // 切换 agent 超时：30 秒
    SEND_TIMEOUT: 10000,         // 发送超时：10 秒

    // 轮询间隔（毫秒）
    POLL_INTERVAL: 500,          // 状态检查间隔
    RETRY_DELAY: 2000,           // 重试延迟

    // 最大重试次数
    MAX_RETRIES: 3,

    // 是否启用调试日志
    DEBUG: true,

    // 是否自动滚动到回复内容
    AUTO_SCROLL: true,

    // 回复内容最小长度（过滤无效回复）
    MIN_RESPONSE_LENGTH: 10
  };

  // ========================
  // 状态机定义
  // ========================

  const STATE = {
    IDLE: 'idle',                          // 空闲状态
    INITIALIZING: 'initializing',          // 初始化中
    WAITING_FIRST_RESPONSE: 'waiting_first_response',  // 等待第一个 agent 回复
    EXTRACTING_RESPONSE: 'extracting_response',        // 提取回复内容
    SWITCHING_AGENT: 'switching_agent',    // 切换到下一个 agent
    FILLING_INPUT: 'filling_input',        // 填写输入框
    SENDING: 'sending',                    // 发送消息
    WAITING_NEXT_RESPONSE: 'waiting_next_response',    // 等待后续 agent 回复
    COMPLETED: 'completed',                // 流程完成
    FAILED: 'failed',                      // 流程失败
    PAUSED: 'paused'                       // 暂停
  };

  // ========================
  // 全局状态管理
  // ========================

  const StateManager = {
    currentState: STATE.IDLE,
    currentIndex: 0,
    collectedResponses: [],
    error: null,
    startTime: null,
    observers: [],
    abortController: null,  // 用于中断异步操作

    setState(newState) {
      const oldState = this.currentState;
      this.currentState = newState;
      this.log(`状态变更: ${oldState} -> ${newState}`);
      this.notifyStateChange(newState, oldState);
    },

    reset() {
      this.currentState = STATE.IDLE;
      this.currentIndex = 0;
      this.collectedResponses = [];
      this.error = null;
      this.startTime = null;
      this.cleanupObservers();
      // 重置中断控制器
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    },

    onStateChange(callback) {
      this.observers.push(callback);
    },

    notifyStateChange(newState, oldState) {
      this.observers.forEach(cb => cb(newState, oldState));
    },

    cleanupObservers() {
      this.observers.forEach(observer => {
        if (observer && typeof observer.disconnect === 'function') {
          observer.disconnect();
        }
      });
      this.observers = [];
    },

    /**
     * 创建新的中断控制器
     */
    createAbortController() {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();
      return this.abortController.signal;
    },

    /**
     * 检查是否应该中止流程
     * @returns {boolean}
     */
    shouldAbort() {
      return this.currentState === STATE.FAILED ||
             this.currentState === STATE.PAUSED;
    },

    /**
     * 检查是否被停止
     * @returns {boolean}
     */
    isStopped() {
      return this.currentState === STATE.FAILED;
    },

    /**
     * 检查是否被暂停
     * @returns {boolean}
     */
    isPaused() {
      return this.currentState === STATE.PAUSED;
    },

    /**
     * 等待暂停恢复
     * @returns {Promise<void>}
     */
    async waitForResume() {
      while (this.isPaused()) {
        await DOMUtils.sleep(100);
        // 如果在暂停期间被停止，抛出异常
        if (this.isStopped()) {
          throw new Error('流程已停止');
        }
      }
    },

    log(...args) {
      if (CONFIG.DEBUG) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[GeminiAutomation ${timestamp}]`, ...args);
      }
    }
  };

  // ========================
  // DOM 操作工具
  // ========================

  const DOMUtils = {
    /**
     * 等待元素出现
     * @param {string} selector - CSS 选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<HTMLElement>}
     */
    waitForElement(selector, timeout = CONFIG.WAIT_TIMEOUT) {
      return new Promise((resolve, reject) => {
        // 立即检查
        const element = document.querySelector(selector);
        if (element) {
          return resolve(element);
        }

        // 设置超时
        const timeoutId = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`等待元素超时: ${selector}`));
        }, timeout);

        // 使用 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver((_mutations) => {
          const element = document.querySelector(selector);
          if (element) {
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        // 保存 observer 以便清理
        StateManager.observers.push(observer);
      });
    },

    /**
     * 等待元素消失
     * @param {string} selector - CSS 选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<void>}
     */
    waitForElementHidden(selector, timeout = CONFIG.WAIT_TIMEOUT) {
      return new Promise((resolve, reject) => {
        // 检查元素是否已存在
        const element = document.querySelector(selector);
        if (!element) {
          return resolve();
        }

        // 设置超时
        const timeoutId = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`等待元素消失超时: ${selector}`));
        }, timeout);

        // 使用 MutationObserver 监听
        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector);
          if (!element) {
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        StateManager.observers.push(observer);
      });
    },

    /**
     * 模拟用户输入（支持多种输入类型）
     * @param {HTMLElement} element - 输入元素
     * @param {string} text - 要输入的文本
     */
    async simulateInput(element, text) {
      // 清空现有内容
      element.focus();
      element.textContent = '';

      // 尝试多种输入方法
      if (element.tagName === 'TEXTAREA') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.isContentEditable) {
        // 对于 contenteditable 元素
        element.textContent = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('DOMSubtreeModified', { bubbles: true }));
      }

      // 触发输入事件
      const events = ['focus', 'input', 'change', 'blur'];
      for (const eventType of events) {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      }

      // 等待一下让 UI 更新
      await this.sleep(100);
    },

    /**
     * 模拟点击
     * @param {HTMLElement} element - 要点击的元素
     */
    async simulateClick(element) {
      // 滚动到元素可见
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(200);

      // 模拟鼠标事件
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      element.click();
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await this.sleep(100);
    },

    /**
     * 延迟函数（支持中断检查）
     * @param {number} ms - 延迟毫秒数
     * @param {AbortSignal} signal - 可选的中断信号
     * @returns {Promise<void>}
     */
    async sleep(ms, signal = null) {
      const interval = 100; // 检查间隔
      let elapsed = 0;

      while (elapsed < ms) {
        // 检查是否需要中止
        if (StateManager.shouldAbort()) {
          if (StateManager.isStopped()) {
            throw new Error('流程已停止');
          }
          if (StateManager.isPaused()) {
            await StateManager.waitForResume();
          }
        }

        // 检查中断信号
        if (signal && signal.aborted) {
          throw new Error('操作已中断');
        }

        await new Promise(resolve => setTimeout(resolve, Math.min(interval, ms - elapsed)));
        elapsed += interval;
      }
    },

    /**
     * 轮询等待条件满足
     * @param {Function} condition - 条件函数
     * @param {number} timeout - 超时时间
     * @param {number} interval - 检查间隔
     * @returns {Promise<any>}
     */
    async poll(condition, timeout = CONFIG.WAIT_TIMEOUT, interval = CONFIG.POLL_INTERVAL) {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        try {
          const result = await condition();
          if (result) {
            return result;
          }
        } catch (e) {
          // 条件函数可能抛出异常，继续尝试
        }
        await this.sleep(interval);
      }

      throw new Error(`轮询超时: ${timeout}ms`);
    },

    /**
     * 检查元素是否可见
     * @param {HTMLElement} element - 要检查的元素
     * @returns {boolean}
     */
    isElementVisible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  };

  // ========================
  // Gemini 页面特定操作
  // ========================

  const GeminiActions = {
    /**
     * 获取当前页面的最后一个用户消息
     * @returns {string|null}
     */
    getLastUserMessage() {
      const selectors = [
        'user-message:last-child .message-content',
        '[data-testid="user-message"]:last-child',
        '.conversation-turn.user .message-text:last-child'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return null;
    },

    /**
     * 获取最新的 AI 回复
     * @returns {string|null}
     */
    getLatestAIResponse() {
      // 多种选择器策略
      const selectors = [
        // Gemini 特定选择器
        'model-response:last-of-type .response-content',
        '[data-testid="model-response"]:last-child',
        'markdown.markdown:last-child',

        // 通用选择器
        '.response-container:last-child .response-text',
        '.assistant-message:last-child .message-content',
        '[role="assistant"]:last-child .message-text'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length >= CONFIG.MIN_RESPONSE_LENGTH) {
          const text = this.extractTextContent(element);
          if (text) return text;
        }
      }

      // 备选方法：查找所有可能的回复容器
      const allResponses = document.querySelectorAll('[data-testid*="response"], .response, .ai-message');
      for (const resp of Array.from(allResponses).reverse()) {
        const text = this.extractTextContent(resp);
        if (text && text.length >= CONFIG.MIN_RESPONSE_LENGTH) {
          return text;
        }
      }

      return null;
    },

    /**
     * 提取元素的文本内容（处理嵌套结构）
     * @param {HTMLElement} element - 要提取的元素
     * @returns {string}
     */
    extractTextContent(element) {
      // 克隆元素以避免修改原始 DOM
      const clone = element.cloneNode(true);

      // 移除不需要的子元素
      const unwanted = clone.querySelectorAll('button, .copy-button, .feedback, .metadata, script, style');
      unwanted.forEach(el => el.remove());

      return clone.textContent.trim();
    },

    /**
     * 检查是否正在生成回复
     * @returns {boolean}
     */
    isGeneratingResponse() {
      const indicators = [
        '[data-testid="thinking"]',
        '.loading',
        '.generating',
        '.typing-indicator',
        '[aria-busy="true"]',
        'spinner',
        '.progress'
      ];

      for (const selector of indicators) {
        const element = document.querySelector(selector);
        if (element && DOMUtils.isElementVisible(element)) {
          return true;
        }
      }

      // 检查最后一个回复是否有省略号或加载标记
      const lastResponse = document.querySelector('[data-testid="model-response"]:last-child, .response:last-child');
      if (lastResponse) {
        const text = lastResponse.textContent;
        if (text.includes('...') || text.includes('正在') || text.includes('生成中')) {
          return true;
        }
      }

      return false;
    },

    /**
     * 等待回复生成完成
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<void>}
     */
    async waitForResponseComplete(signal) {
      StateManager.log('等待回复生成完成...');

      // 首先等待生成状态出现
      try {
        await this.pollWithCheck(
          () => this.isGeneratingResponse() || this.getLatestAIResponse(),
          10000, // 等待生成开始的超时
          500,
          signal
        );
      } catch (e) {
        if (e.message === '流程已停止' || e.message === '操作已中断') {
          throw e;
        }
        StateManager.log('未检测到生成状态，可能回复已存在或生成很快');
      }

      // 等待生成状态结束
      await this.pollWithCheck(
        () => !this.isGeneratingResponse(),
        CONFIG.WAIT_TIMEOUT,
        CONFIG.POLL_INTERVAL,
        signal
      );

      // 检查状态
      if (StateManager.isStopped()) {
        throw new Error('流程已停止');
      }

      // 额外等待确保内容稳定
      await DOMUtils.sleep(1000, signal);

      StateManager.log('回复生成完成');
    },

    /**
     * 轮询等待（支持中断检查）
     * @param {Function} condition - 条件函数
     * @param {number} timeout - 超时时间
     * @param {number} interval - 检查间隔
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<any>}
     */
    async pollWithCheck(condition, timeout, interval, signal) {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        // 检查中断信号
        if (signal && signal.aborted) {
          throw new Error('操作已中断');
        }

        // 检查状态
        if (StateManager.isStopped()) {
          throw new Error('流程已停止');
        }
        if (StateManager.isPaused()) {
          await StateManager.waitForResume();
        }

        try {
          const result = await condition();
          if (result) {
            return result;
          }
        } catch (e) {
          // 条件函数可能抛出异常，继续尝试
        }
        await DOMUtils.sleep(interval, signal);
      }

      throw new Error(`轮询超时: ${timeout}ms`);
    },

    /**
     * 获取输入框元素
     * @param {Object} agentConfig - agent 配置
     * @returns {HTMLElement|null}
     */
    getInputBox(agentConfig) {
      // 尝试多个选择器
      const selectors = [
        agentConfig.inputSelector,
        'rich-textarea[contenteditable="true"]',
        'textarea[placeholder*="输入"]',
        'textarea[aria-label*="输入"]',
        'div[contenteditable="true"][role="textbox"]',
        '.prompt-textarea',
        '#prompt-textarea'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        // 找到可见且可编辑的输入框
        for (const element of elements) {
          if (DOMUtils.isElementVisible(element)) {
            return element;
          }
        }
      }

      return null;
    },

    /**
     * 获取发送按钮
     * @returns {HTMLElement|null}
     */
    getSendButton() {
      const selectors = [
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="提交"]',
        'button[data-testid="send-button"]',
        'button[type="submit"]',
        '.send-button',
        '#send-button'
      ];

      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button && !button.disabled && DOMUtils.isElementVisible(button)) {
          return button;
        }
      }

      return null;
    },

    /**
     * 发送消息
     * @param {string} message - 要发送的消息
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<boolean>}
     */
    async sendMessage(message, signal) {
      // 检查状态
      if (StateManager.isStopped()) {
        throw new Error('流程已停止');
      }
      if (StateManager.isPaused()) {
        await StateManager.waitForResume();
      }

      StateManager.log('准备发送消息...');

      try {
        // 获取输入框
        const inputBox = await this.waitForInputBox(signal);
        if (!inputBox) {
          throw new Error('找不到输入框');
        }

        // 填写消息
        await DOMUtils.simulateInput(inputBox, message);
        await DOMUtils.sleep(500, signal);

        // 验证输入成功
        const inputValue = inputBox.value || inputBox.textContent;
        if (!inputValue.includes(message.substring(0, 50))) {
          throw new Error('消息填写失败');
        }

        // 获取并点击发送按钮
        const sendButton = this.getSendButton();
        if (!sendButton) {
          throw new Error('找不到发送按钮');
        }

        await DOMUtils.simulateClick(sendButton);
        await DOMUtils.sleep(1000, signal);

        StateManager.log('消息发送成功');
        return true;

      } catch (error) {
        // 检查是否是因为停止而抛出的错误
        if (error.message === '流程已停止' || error.message === '操作已中断') {
          throw error;
        }
        StateManager.log(`发送消息失败: ${error.message}`);
        throw error;
      }
    },

    /**
     * 等待输入框可用
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<HTMLElement>}
     */
    async waitForInputBox(signal) {
      return this.waitForElementWithCheck(
        'rich-textarea[contenteditable="true"], textarea[placeholder*="输入"], div[contenteditable="true"]',
        CONFIG.SEND_TIMEOUT,
        signal
      );
    },

    /**
     * 等待元素出现（支持中断检查）
     * @param {string} selector - CSS 选择器
     * @param {number} timeout - 超时时间
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<HTMLElement>}
     */
    async waitForElementWithCheck(selector, timeout, signal) {
      return new Promise((resolve, reject) => {
        // 立即检查
        const element = document.querySelector(selector);
        if (element) {
          return resolve(element);
        }

        let timeoutId = null;
        let observer = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (observer) observer.disconnect();
        };

        // 设置超时
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`等待元素超时: ${selector}`));
        }, timeout);

        // 检查中断信号
        if (signal) {
          signal.addEventListener('abort', () => {
            cleanup();
            reject(new Error('操作已中断'));
          });
        }

        // 使用 MutationObserver 监听 DOM 变化
        observer = new MutationObserver(() => {
          // 检查状态
          if (StateManager.isStopped()) {
            cleanup();
            reject(new Error('流程已停止'));
            return;
          }

          const element = document.querySelector(selector);
          if (element) {
            cleanup();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      });
    },

    /**
     * 切换到新聊天
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<boolean>}
     */
    async startNewChat(signal) {
      // 检查状态
      if (StateManager.isStopped()) {
        throw new Error('流程已停止');
      }

      StateManager.log('切换到新聊天...');

      try {
        // 查找新聊天按钮
        const newChatSelectors = [
          'a[href*="/app"]',
          'button[aria-label*="新聊天"]',
          'button[aria-label*="New chat"]',
          '[data-testid="new-chat-button"]',
          '.new-chat-button'
        ];

        let newChatButton = null;
        for (const selector of newChatSelectors) {
          newChatButton = document.querySelector(selector);
          if (newChatButton && DOMUtils.isElementVisible(newChatButton)) {
            break;
          }
        }

        if (newChatButton) {
          await DOMUtils.simulateClick(newChatButton);
          await DOMUtils.sleep(2000, signal);
          StateManager.log('已切换到新聊天');
          return true;
        }

        // 如果找不到按钮，尝试直接导航
        const newChatUrl = window.location.origin + '/app';
        if (window.location.href !== newChatUrl) {
          window.location.href = newChatUrl;
          await DOMUtils.sleep(3000, signal);
          StateManager.log('已导航到新聊天');
          return true;
        }

        return false;

      } catch (error) {
        if (error.message === '流程已停止' || error.message === '操作已中断') {
          throw error;
        }
        StateManager.log(`切换新聊天失败: ${error.message}`);
        return false;
      }
    },

    /**
     * 切换模型（如果需要）
     * @param {string} modelName - 模型名称
     * @returns {Promise<boolean>}
     */
    async switchModel(modelName) {
      StateManager.log(`尝试切换到模型: ${modelName}`);

      try {
        // 查找模型选择器
        const modelSelectorSelectors = [
          '[data-testid="model-selector"]',
          '.model-selector',
          'button[aria-label*="模型"]',
          'button[aria-label*="Model"]'
        ];

        let modelSelector = null;
        for (const selector of modelSelectorSelectors) {
          modelSelector = document.querySelector(selector);
          if (modelSelector && DOMUtils.isElementVisible(modelSelector)) {
            break;
          }
        }

        if (!modelSelector) {
          StateManager.log('未找到模型选择器，跳过模型切换');
          return false;
        }

        // 点击打开模型选择器
        await DOMUtils.simulateClick(modelSelector);
        await DOMUtils.sleep(500);

        // 查找目标模型选项
        const modelOptionSelectors = [
          `[data-model="${modelName}"]`,
          `[aria-label*="${modelName}"]`,
          `button:has-text("${modelName}")`,
          `.model-option:contains("${modelName}")`
        ];

        let modelOption = null;
        for (const selector of modelOptionSelectors) {
          modelOption = document.querySelector(selector);
          if (modelOption && DOMUtils.isElementVisible(modelOption)) {
            break;
          }
        }

        if (modelOption) {
          await DOMUtils.simulateClick(modelOption);
          await DOMUtils.sleep(1000);
          StateManager.log(`已切换到模型: ${modelName}`);
          return true;
        }

        // 关闭模型选择器
        await DOMUtils.simulateClick(modelSelector);
        return false;

      } catch (error) {
        StateManager.log(`切换模型失败: ${error.message}`);
        return false;
      }
    }
  };

  // ========================
  // Pipeline 控制器
  // ========================

  const PipelineController = {
    /**
     * 启动自动化流程
     * @returns {Promise<void>}
     */
    async start() {
      if (StateManager.currentState !== STATE.IDLE) {
        throw new Error('流程已在运行中');
      }

      StateManager.reset();
      // 创建中断控制器
      StateManager.createAbortController();
      StateManager.startTime = Date.now();
      StateManager.setState(STATE.INITIALIZING);

      try {
        StateManager.log('=== Gemini 自动化流程启动 ===');
        StateManager.log(`Agent Pipeline: ${AGENT_PIPELINE.map(a => a.name).join(' -> ')}`);

        // 开始执行流程
        await this.runPipeline();

      } catch (error) {
        // 检查是否是用户停止的
        if (error.message === '流程已停止' || error.message === '操作已中断') {
          StateManager.log('流程已停止');
        } else {
          StateManager.error = error;
          StateManager.setState(STATE.FAILED);
          StateManager.log('流程执行失败:', error);
          throw error;
        }
      }
    },

    /**
     * 运行 Pipeline
     */
    async runPipeline() {
      // 创建中断控制器
      const signal = StateManager.createAbortController();

      for (let i = 0; i < AGENT_PIPELINE.length; i++) {
        // 每次循环开始时检查状态
        if (StateManager.isStopped()) {
          StateManager.log('流程已被停止');
          throw new Error('流程已停止');
        }
        if (StateManager.isPaused()) {
          await StateManager.waitForResume();
        }

        StateManager.currentIndex = i;
        const currentAgent = AGENT_PIPELINE[i];
        const isFirstAgent = i === 0;
        const isLastAgent = i === AGENT_PIPELINE.length - 1;

        StateManager.log(`\n--- 处理 Agent ${i + 1}/${AGENT_PIPELINE.length}: ${currentAgent.name} ---`);

        // 处理当前 agent
        const response = await this.processAgent(currentAgent, isFirstAgent, signal);

        // 再次检查状态
        if (StateManager.isStopped()) {
          StateManager.log('流程已被停止');
          throw new Error('流程已停止');
        }

        // 保存回复
        StateManager.collectedResponses.push({
          agentName: currentAgent.name,
          response: response,
          timestamp: new Date().toISOString()
        });

        // 如果不是最后一个 agent，准备切换到下一个
        if (!isLastAgent) {
          const nextAgent = AGENT_PIPELINE[i + 1];
          await this.switchToNextAgent(currentAgent, nextAgent, response, signal);
        }
      }

      // 流程完成
      StateManager.setState(STATE.COMPLETED);
      StateManager.log('\n=== 自动化流程完成 ===');
      this.printSummary();
    },

    /**
     * 处理单个 Agent
     * @param {Object} agentConfig - agent 配置
     * @param {boolean} isFirst - 是否是第一个 agent
     * @param {AbortSignal} signal - 中断信号
     * @returns {Promise<string>} - agent 的回复
     */
    async processAgent(agentConfig, isFirst, signal) {
      // 检查状态
      if (StateManager.isStopped()) {
        throw new Error('流程已停止');
      }
      if (StateManager.isPaused()) {
        await StateManager.waitForResume();
      }

      if (isFirst) {
        // 第一个 agent：等待手动发送的消息得到回复
        StateManager.setState(STATE.WAITING_FIRST_RESPONSE);
        StateManager.log('等待第一个 agent 回复（请确保已手动发送第一条消息）...');

        await GeminiActions.waitForResponseComplete(signal);

        // 检查是否在等待期间被停止
        if (StateManager.isStopped()) {
          throw new Error('流程已停止');
        }

        StateManager.setState(STATE.EXTRACTING_RESPONSE);
        const response = GeminiActions.getLatestAIResponse();

        if (!response) {
          throw new Error('未能获取第一个 agent 的回复');
        }

        StateManager.log(`获取到回复 (${response.length} 字符)`);
        return response;

      } else {
        // 后续 agent：发送前一个 agent 的回复并等待新回复
        StateManager.setState(STATE.FILLING_INPUT);
        const previousResponse = StateManager.collectedResponses[StateManager.collectedResponses.length - 1].response;

        StateManager.log('发送消息到 agent...');
        await GeminiActions.sendMessage(previousResponse, signal);

        // 再次检查状态
        if (StateManager.isStopped()) {
          throw new Error('流程已停止');
        }

        StateManager.setState(STATE.WAITING_NEXT_RESPONSE);
        await GeminiActions.waitForResponseComplete(signal);

        // 检查是否在等待期间被停止
        if (StateManager.isStopped()) {
          throw new Error('流程已停止');
        }

        StateManager.setState(STATE.EXTRACTING_RESPONSE);
        const response = GeminiActions.getLatestAIResponse();

        if (!response) {
          throw new Error(`未能获取 ${agentConfig.name} 的回复`);
        }

        StateManager.log(`获取到回复 (${response.length} 字符)`);
        return response;
      }
    },

    /**
     * 切换到下一个 Agent
     * @param {Object} _currentAgent - 当前 agent
     * @param {Object} nextAgent - 下一个 agent
     * @param {string} _response - 当前 agent 的回复（需要传递）
     * @param {AbortSignal} signal - 中断信号
     */
    async switchToNextAgent(_currentAgent, nextAgent, _response, signal) {
      // 检查状态
      if (StateManager.isStopped()) {
        throw new Error('流程已停止');
      }
      if (StateManager.isPaused()) {
        await StateManager.waitForResume();
      }

      StateManager.setState(STATE.SWITCHING_AGENT);
      StateManager.log(`切换到下一个 agent: ${nextAgent.name}`);

      try {
        // 根据切换方法执行不同的切换逻辑
        switch (nextAgent.switchMethod) {
          case 'newChat':
            await GeminiActions.startNewChat(signal);
            // 可以在这里添加模型切换逻辑
            // await GeminiActions.switchModel(nextAgent.modelName);
            break;

          case 'tab':
            // 如果是在同一个页面的不同 tab，点击 tab 切换
            // 这需要具体的页面结构来实现
            StateManager.log('Tab 切换模式：需要手动实现 tab 切换逻辑');
            break;

          case 'navigation':
            // 如果是导航到不同的 URL
            if (nextAgent.switchTarget) {
              window.location.href = nextAgent.switchTarget;
              await DOMUtils.sleep(3000, signal);
            }
            break;

          default:
            StateManager.log(`未知切换方法: ${nextAgent.switchMethod}`);
        }

        // 验证切换成功
        await DOMUtils.sleep(1000, signal);

        // 再次检查状态
        if (StateManager.isStopped()) {
          throw new Error('流程已停止');
        }

      } catch (error) {
        // 检查是否是因为停止而抛出的错误
        if (error.message === '流程已停止' || error.message === '操作已中断') {
          throw error;
        }
        StateManager.log(`切换 agent 失败: ${error.message}`);
        throw error;
      }
    },

    /**
     * 打印流程摘要
     */
    printSummary() {
      const duration = Date.now() - StateManager.startTime;
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);

      console.log('\n========== 流程摘要 ==========');
      console.log(`总耗时: ${minutes}分${seconds}秒`);
      console.log(`处理的 Agent 数量: ${AGENT_PIPELINE.length}`);
      console.log(`收集的回复数量: ${StateManager.collectedResponses.length}`);

      StateManager.collectedResponses.forEach((item, index) => {
        console.log(`\n[Agent ${index + 1}] ${item.agentName}`);
        console.log(`回复长度: ${item.response.length} 字符`);
        console.log(`回复预览: ${item.response.substring(0, 100)}...`);
      });

      console.log('\n================================');
    },

    /**
     * 暂停流程
     */
    pause() {
      if (StateManager.currentState !== STATE.IDLE &&
          StateManager.currentState !== STATE.COMPLETED &&
          StateManager.currentState !== STATE.FAILED) {
        StateManager.setState(STATE.PAUSED);
        StateManager.log('流程已暂停');
      }
    },

    /**
     * 恢复流程
     */
    async resume() {
      if (StateManager.currentState === STATE.PAUSED) {
        StateManager.log('恢复流程...');
        // 从当前状态继续执行
        await this.runPipeline();
      }
    },

    /**
     * 停止流程
     */
    stop() {
      if (StateManager.currentState !== STATE.IDLE &&
          StateManager.currentState !== STATE.COMPLETED &&
          StateManager.currentState !== STATE.FAILED) {

        StateManager.log('正在停止流程...');

        // 中断所有异步操作
        if (StateManager.abortController) {
          StateManager.abortController.abort();
        }

        StateManager.setState(STATE.FAILED);
        StateManager.cleanupObservers();
        StateManager.log('流程已停止');
      }
    },

    /**
     * 获取当前状态信息
     */
    getStatus() {
      return {
        state: StateManager.currentState,
        currentIndex: StateManager.currentIndex,
        totalAgents: AGENT_PIPELINE.length,
        currentAgent: AGENT_PIPELINE[StateManager.currentIndex]?.name,
        collectedResponses: StateManager.collectedResponses.length,
        error: StateManager.error?.message,
        elapsed: StateManager.startTime ? Date.now() - StateManager.startTime : 0
      };
    }
  };

  // ========================
  // UI 控制面板（可选）
  // ========================

  const ControlPanel = {
    element: null,

    create() {
      if (this.element) return;

      const panel = document.createElement('div');
      panel.id = 'gemini-automation-panel';
      panel.innerHTML = `
        <div class="ga-header">
          <span class="ga-title">Gemini 自动化</span>
          <button class="ga-close" data-action="close">×</button>
        </div>
        <div class="ga-content">
          <div class="ga-status">
            <span class="ga-status-label">状态:</span>
            <span class="ga-status-value" id="ga-status-value">idle</span>
          </div>
          <div class="ga-progress">
            <span class="ga-progress-label">进度:</span>
            <span class="ga-progress-value" id="ga-progress-value">0/${AGENT_PIPELINE.length}</span>
          </div>
          <div class="ga-buttons">
            <button class="ga-btn ga-btn-primary" data-action="start">启动流程</button>
            <button class="ga-btn ga-btn-warning" data-action="pause">暂停</button>
            <button class="ga-btn ga-btn-danger" data-action="stop">停止</button>
          </div>
          <div class="ga-log" id="ga-log"></div>
        </div>
      `;

      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        #gemini-automation-panel {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 320px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          z-index: 999999;
          overflow: hidden;
        }
        .ga-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ga-title {
          font-weight: 600;
        }
        .ga-close {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        }
        .ga-content {
          padding: 16px;
        }
        .ga-status, .ga-progress {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .ga-status-label, .ga-progress-label {
          color: #666;
        }
        .ga-status-value {
          font-weight: 500;
          color: #667eea;
        }
        .ga-buttons {
          display: flex;
          gap: 8px;
          margin: 12px 0;
        }
        .ga-btn {
          flex: 1;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: opacity 0.2s;
        }
        .ga-btn:hover {
          opacity: 0.9;
        }
        .ga-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .ga-btn-warning {
          background: #f59e0b;
          color: white;
        }
        .ga-btn-danger {
          background: #ef4444;
          color: white;
        }
        .ga-log {
          margin-top: 12px;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 6px;
          max-height: 150px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 11px;
          color: #666;
        }
        .ga-log-entry {
          padding: 2px 0;
          border-bottom: 1px solid #eee;
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(panel);

      this.element = panel;
      this.bindEvents();
    },

    bindEvents() {
      this.element.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;

        switch (action) {
          case 'close':
            this.destroy();
            break;
          case 'start':
            PipelineController.start().catch(err => {
              this.log('启动失败: ' + err.message);
            });
            break;
          case 'pause':
            PipelineController.pause();
            break;
          case 'stop':
            PipelineController.stop();
            break;
        }
      });
    },

    updateStatus(status) {
      const statusValue = document.getElementById('ga-status-value');
      if (statusValue) {
        statusValue.textContent = status;
      }
    },

    updateProgress(current, total) {
      const progressValue = document.getElementById('ga-progress-value');
      if (progressValue) {
        progressValue.textContent = `${current}/${total}`;
      }
    },

    log(message) {
      const logDiv = document.getElementById('ga-log');
      if (logDiv) {
        const entry = document.createElement('div');
        entry.className = 'ga-log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logDiv.insertBefore(entry, logDiv.firstChild);
      }
    },

    destroy() {
      if (this.element) {
        this.element.remove();
        this.element = null;
      }
    }
  };

  // 监听状态变化并更新 UI
  StateManager.onStateChange((newState) => {
    if (ControlPanel.element) {
      ControlPanel.updateStatus(newState);
      ControlPanel.updateProgress(
        StateManager.currentIndex + 1,
        AGENT_PIPELINE.length
      );
    }
  });

  // ========================
  // 导出 API
  // ========================

  window.GeminiAutomation = {
    // 启动自动化流程
    start: () => PipelineController.start(),

    // 暂停流程
    pause: () => PipelineController.pause(),

    // 恢复流程
    resume: () => PipelineController.resume(),

    // 停止流程
    stop: () => PipelineController.stop(),

    // 获取当前状态
    getStatus: () => PipelineController.getStatus(),

    // 显示控制面板
    showPanel: () => ControlPanel.create(),

    // 隐藏控制面板
    hidePanel: () => ControlPanel.destroy(),

    // 配置
    CONFIG: CONFIG,
    AGENT_PIPELINE: AGENT_PIPELINE,
    STATE: STATE
  };

  // 在控制台显示使用提示
  console.log('%c[Gemini Automation]', 'color: #667eea; font-weight: bold;', '模块已加载');
  console.log('使用 GeminiAutomation.start() 启动自动化流程');
  console.log('使用 GeminiAutomation.showPanel() 显示控制面板');

})(window);
