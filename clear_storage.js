// 只清除与机器人接力相关的数据，保留其他设置
chrome.storage.local.remove([
  'geStep2Config',
  'geRelayConfig', 
  'geModifyInfo',
  'geRelayPaused'
], function() {
  console.log('已清除机器人接力相关数据');
  
  // 验证清除结果
  chrome.storage.local.get(null, function(data) {
    console.log('当前 storage 中剩余的数据:', Object.keys(data));
  });
});
