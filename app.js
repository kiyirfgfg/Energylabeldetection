let currentUser = null;
let currentLineId = 'lineA';
let allRecords = [];
let currentLines = [];
let chartRange = '7d';
let currentChart = 'trend';
let chartInstance = null;
let cameraStream = null;
let currentDetectResult = null;
let currentImageData = null;
let users = [];
let selectedOperator = 'all';

const ML_API_BASE = '';

const DEFECT_TYPE_LABELS = {
  NORMAL: '正常',
  DAMAGE: '破损',
  STAIN: '污渍',
  WRINKLE: '褶皱',
  POSITION_DEVIATION: '位置偏差'
};

const LEVEL_ORDER = ['一级能效', '二级能效', '三级能效', '四级能效', '五级能效'];

// DOM 选择器
function $(selector) { return document.querySelector(selector); }
function $$(selector) { return document.querySelectorAll(selector); }

// HTML 转义
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 格式化日期时间
function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// 显示提示消息
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2000);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function normalizeDetectResult(apiResult, imageData, options = {}) {
  return {
    id: Date.now(),
    operator: currentUser ? currentUser.username : 'unknown',
    operatorName: currentUser ? currentUser.name : '未知用户',
    lineId: options.lineId || currentLineId,
    labelLevel: apiResult.labelLevel || '未识别',
    defectType: apiResult.defectType || 'NORMAL',
    defectDetail: apiResult.defectDetail || '检测完成',
    deviationArea: apiResult.deviationArea || '无',
    deviationDirection: apiResult.deviationDirection || '无',
    deviationValue: apiResult.deviationValue || '无',
    confidence: typeof apiResult.confidence === 'number' ? apiResult.confidence : 0,
    time: apiResult.time || new Date().toISOString(),
    processed: (apiResult.defectType || 'NORMAL') === 'NORMAL',
    imageData: imageData,
    warning: apiResult.warning || '',
    modelMode: apiResult.modelMode || '',
    rawResult: apiResult.rawResult || {}
  };
}

async function requestDetect(imageData, options = {}) {
  const apiResult = await postJson(`${ML_API_BASE}/api/ml/detect`, {
    imageBase64: imageData,
    lineId: options.lineId || currentLineId
  });
  return normalizeDetectResult(apiResult, imageData, options);
}



// 获取今日开始时间
function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 获取本月开始时间
function getMonthStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM 加载完成，开始初始化...');
  initApp();
});

// 初始化应用
function initApp() {
  console.log('初始化应用...');
  initDefaultUsers();
  loadRecordsFromStorage();
  loadLines();

  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      const userExists = users.find(u => u.username === currentUser.username);
      if (userExists) {
        showMainPage();
        updateUserInfo();
        updateMenuByRole();
        initOperatorFilter();
        refreshAll();
      } else {
        localStorage.removeItem('currentUser');
        showLoginPage();
      }
    } catch (e) {
      console.error('解析用户信息失败:', e);
      showLoginPage();
    }
  } else {
    showLoginPage();
  }
}

// 初始化默认用户
function initDefaultUsers() {
  console.log('初始化默认用户...');
  const saved = localStorage.getItem('users');
  if (!saved) {
    users = [
      { id: 1, username: 'admin', password: '123456', role: 'admin', name: '系统管理员' },
      { id: 2, username: 'operator1', password: '123456', role: 'operator', name: '操作员A' }
    ];
    localStorage.setItem('users', JSON.stringify(users));
    console.log('创建默认用户:', users);
  } else {
    users = JSON.parse(saved);
    // 确保默认用户存在
    const adminExists = users.find(u => u.username === 'admin');
    const operatorExists = users.find(u => u.username === 'operator1');
    
    if (!adminExists) {
      users.unshift({ id: Date.now(), username: 'admin', password: '123456', role: 'admin', name: '系统管理员' });
    }
    if (!operatorExists) {
      users.push({ id: Date.now() + 1, username: 'operator1', password: '123456', role: 'operator', name: '操作员A' });
    }
    if (!adminExists || !operatorExists) {
      localStorage.setItem('users', JSON.stringify(users));
    }
    console.log('加载用户:', users);
  }
}

// 重置默认用户
function resetDefaultUsers() {
  if (confirm('确定要重置为默认用户吗？这将清除所有自定义用户数据。')) {
    localStorage.removeItem('users');
    localStorage.removeItem('currentUser');
    initDefaultUsers();
    showToast('默认用户已重置，请使用 admin / 123456 登录', 'success');
    console.log('用户数据已重置');
  }
}

// 显示登录页面
function showLoginPage() {
  console.log('显示登录页面');
  const authPage = document.getElementById('authPage');
  const mainPage = document.getElementById('mainPage');
  if (authPage) authPage.classList.remove('hidden');
  if (mainPage) mainPage.classList.add('hidden');
}

// 显示主页面
function showMainPage() {
  console.log('显示主页面');
  const authPage = document.getElementById('authPage');
  const mainPage = document.getElementById('mainPage');
  if (authPage) authPage.classList.add('hidden');
  if (mainPage) mainPage.classList.remove('hidden');
}

// 显示注册框
function showRegister() {
  const loginBox = document.getElementById('loginBox');
  const registerBox = document.getElementById('registerBox');
  if (loginBox) loginBox.classList.add('hidden');
  if (registerBox) registerBox.classList.remove('hidden');
}

// 显示登录框
function showLogin() {
  const loginBox = document.getElementById('loginBox');
  const registerBox = document.getElementById('registerBox');
  if (loginBox) loginBox.classList.remove('hidden');
  if (registerBox) registerBox.classList.add('hidden');
}

// 保存用户到本地存储
function saveUsersToStorage() {
  localStorage.setItem('users', JSON.stringify(users));
}

// 登录函数 - 修复版
function login() {
  console.log('登录函数被调用');
  
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  
  if (!usernameInput || !passwordInput) {
    console.error('找不到输入框元素');
    showToast('页面加载错误，请刷新重试', 'error');
    return;
  }
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  console.log('输入的用户名:', username);
  console.log('输入的密码:', password);

  if (!username || !password) {
    showToast('请输入用户名和密码', 'error');
    return;
  }

  // 重新加载用户列表确保最新
  const saved = localStorage.getItem('users');
  if (saved) {
    users = JSON.parse(saved);
  } else {
    console.log('本地存储中没有用户数据，重新初始化...');
    initDefaultUsers();
  }

  console.log('当前用户列表:', users);
  console.log('用户数量:', users.length);

  // 查找用户（不区分大小写）
  const user = users.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && 
    u.password === password
  );
  
  if (!user) {
    console.log('登录失败：用户名或密码错误');
    console.log('尝试查找的用户名:', username.toLowerCase());
    console.log('可用的用户名:', users.map(u => u.username));
    showToast('用户名或密码错误', 'error');
    return;
  }

  console.log('登录成功:', user);
  currentUser = user;
  localStorage.setItem('currentUser', JSON.stringify(currentUser));

  showMainPage();
  updateUserInfo();
  updateMenuByRole();
  initOperatorFilter();
  refreshAll();
  showToast('登录成功', 'success');
}

// 退出登录
function logout() {
  currentUser = null;
  localStorage.removeItem('currentUser');
  showLoginPage();
  
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  if (usernameInput) usernameInput.value = '';
  if (passwordInput) passwordInput.value = '';
}

// 注册函数
function register() {
  const usernameInput = document.getElementById('regUsername');
  const passwordInput = document.getElementById('regPassword');
  const roleInput = document.getElementById('regRole');
  const nameInput = document.getElementById('regName');
  
  if (!usernameInput || !passwordInput || !roleInput || !nameInput) {
    showToast('页面错误', 'error');
    return;
  }
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleInput.value;
  const name = nameInput.value.trim();

  if (!username || !password || !name) {
    showToast('请填写完整信息', 'error');
    return;
  }
  
  if (role === 'qc') {
    showToast('系统不支持质检员注册', 'error');
    return;
  }
  
  // 重新加载用户列表
  const saved = localStorage.getItem('users');
  if (saved) {
    users = JSON.parse(saved);
  }
  
  if (users.some(u => u.username === username)) {
    showToast('用户名已存在', 'error');
    return;
  }

  users.push({
    id: Date.now(),
    username,
    password,
    role,
    name
  });

  saveUsersToStorage();
  showToast('注册成功，请登录', 'success');
  showLogin();
}

// 更新用户信息显示
function updateUserInfo() {
  if (!currentUser) return;
  const roleLabels = { admin: '管理员', operator: '操作员' };
  
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  
  if (userAvatar) userAvatar.textContent = currentUser.name ? currentUser.name.charAt(0) : 'U';
  if (userName) userName.textContent = currentUser.name || currentUser.username;
  if (userRole) userRole.textContent = roleLabels[currentUser.role] || currentUser.role;
}

// 根据角色更新菜单
function updateMenuByRole() {
  const usersMenuItem = document.getElementById('usersMenuItem');
  if (!usersMenuItem) return;
  usersMenuItem.style.display = currentUser && currentUser.role === 'admin' ? 'flex' : 'none';
}

// 保存产线到本地存储
function saveLinesToStorage() {
  localStorage.setItem('lines', JSON.stringify(currentLines));
}

// 加载产线
function loadLines() {
  const saved = localStorage.getItem('lines');
  if (saved) {
    currentLines = JSON.parse(saved);
  } else {
    currentLines = [
      { id: 'lineA', name: '产线A', cameraOnline: true, enabled: true },
      { id: 'lineB', name: '产线B', cameraOnline: true, enabled: true },
      { id: 'lineC', name: '产线C', cameraOnline: false, enabled: true }
    ];
    saveLinesToStorage();
  }

  const select = document.getElementById('lineSelect');
  if (select) {
    select.innerHTML = currentLines.map(line => `<option value="${line.id}">${escapeHtml(line.name)}</option>`).join('');
    if (currentLines.length) {
      currentLineId = currentLines[0].id;
      select.value = currentLineId;
    }
  }

  renderLineList();
}

// 切换产线
function changeLine(lineId) {
  currentLineId = lineId;
}

// 添加产线
function addLine() {
  const name = prompt('请输入新产线名称：');
  if (!name) return;

  const id = 'line_' + Date.now();
  currentLines.push({ id, name, cameraOnline: false, enabled: true });
  saveLinesToStorage();
  loadLines();
  refreshAll();
  showToast('产线新增成功', 'success');
}

// 删除产线
function deleteLine(lineId) {
  if (!confirm('确定删除该产线吗？')) return;

  const idx = currentLines.findIndex(l => l.id === lineId);
  if (idx > -1) {
    currentLines.splice(idx, 1);
    saveLinesToStorage();
    if (currentLineId === lineId && currentLines.length) currentLineId = currentLines[0].id;
    loadLines();
    refreshAll();
    showToast('产线删除成功', 'success');
  }
}

// 切换产线状态
function toggleLineStatus(lineId) {
  const line = currentLines.find(l => l.id === lineId);
  if (!line) return;
  line.enabled = !line.enabled;
  saveLinesToStorage();
  renderLineList();
  loadLines();
  refreshAll();
  showToast('产线状态已更新', 'success');
}

// 渲染产线列表
function renderLineList() {
  const list = document.getElementById('lineList');
  if (!list) return;

  if (!currentLines.length) {
    list.innerHTML = '<div style="padding:20px;color:var(--text-secondary);">暂无产线，请新增</div>';
    return;
  }

  list.innerHTML = currentLines.map(line => `
    <div class="line-item">
      <div class="line-info">
        <div class="line-name">${escapeHtml(line.name)}</div>
        <div class="line-status">
          <span class="status-dot ${line.cameraOnline ? 'online' : 'offline'}"></span>
          摄像头：${line.cameraOnline ? '在线' : '离线'}
          &nbsp;|&nbsp;
          状态：${line.enabled ? '启用' : '停用'}
        </div>
      </div>
      <div class="line-actions">
        <button class="btn btn-secondary btn-sm" onclick="toggleLineStatus('${line.id}')">切换状态</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLine('${line.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

// 从本地存储加载记录
function loadRecordsFromStorage() {
  const saved = localStorage.getItem('records');
  allRecords = saved ? JSON.parse(saved) : [];
}

// 保存记录到本地存储
function saveRecordsToStorage() {
  localStorage.setItem('records', JSON.stringify(allRecords));
}

// 获取当前视图过滤后的记录
function getFilteredRecordsForCurrentView() {
  let records = [...allRecords];

  if (currentUser && currentUser.role === 'operator') {
    records = records.filter(r => r.operator === currentUser.username);
  }

  if (currentUser && currentUser.role === 'admin' && selectedOperator !== 'all') {
    records = records.filter(r => r.operator === selectedOperator);
  }

  return records;
}

// 渲染最近记录
function renderRecentRecords() {
  const list = document.getElementById('recentRecords');
  if (!list) return;

  const records = getFilteredRecordsForCurrentView().slice(0, 10);

  if (!records.length) {
    list.innerHTML = '<div style="color:var(--text-secondary);padding:16px 0;">暂无记录</div>';
    return;
  }

  list.innerHTML = records.map(r => `
    <div class="record-item">
      <div class="record-main">
        ${r.imageData ? `<img class="record-image" src="${r.imageData}" onclick="viewImage(${r.id})">` : `<div class="record-image-placeholder">无图片</div>`}
        <div class="record-info">
          <div class="record-title">${DEFECT_TYPE_LABELS[r.defectType] || r.defectType} · ${r.labelLevel || '-'}</div>
          <div class="record-meta">
            操作员：${escapeHtml(r.operatorName || r.operator)} |
            产线：${currentLines.find(l => l.id === r.lineId)?.name || r.lineId} |
            时间：${formatDateTime(r.time)}
          </div>
        </div>
      </div>
      <div class="record-actions">
        <span class="result-badge ${r.defectType === 'NORMAL' ? 'normal' : 'defect'}">${r.processed ? '已处理' : '未处理'}</span>
      </div>
    </div>
  `).join('');
}

// 渲染记录列表
function renderRecords() {
  const list = document.getElementById('recordList');
  if (!list) return;

  let records = getFilteredRecordsForCurrentView();
  
  const filterProcessed = document.getElementById('filterProcessed');
  const filterDefectType = document.getElementById('filterDefectType');
  const filterLabelLevel = document.getElementById('filterLabelLevel');
  const filterDate = document.getElementById('filterDate');
  
  const processed = filterProcessed ? filterProcessed.value : 'all';
  const defectType = filterDefectType ? filterDefectType.value : 'all';
  const labelLevel = filterLabelLevel ? filterLabelLevel.value : 'all';
  const date = filterDate ? filterDate.value : '';

  if (processed === 'processed') records = records.filter(r => r.processed);
  if (processed === 'unprocessed') records = records.filter(r => !r.processed);
  if (defectType !== 'all') records = records.filter(r => r.defectType === defectType);
  if (labelLevel !== 'all') records = records.filter(r => r.labelLevel === labelLevel);
  if (date) records = records.filter(r => r.time.slice(0, 10) === date);

  if (!records.length) {
    list.innerHTML = '<div style="padding:20px;color:var(--text-secondary);">暂无数据</div>';
    return;
  }

  list.innerHTML = records.map(r => `
    <div class="record-item">
      <div class="record-main">
        ${r.imageData ? `<img class="record-image" src="${r.imageData}" onclick="viewImage(${r.id})">` : `<div class="record-image-placeholder">无图片</div>`}
        <div class="record-info">
          <div class="record-title">${DEFECT_TYPE_LABELS[r.defectType] || r.defectType} · ${r.labelLevel || '-'}</div>
          <div class="record-meta">
            操作员：${escapeHtml(r.operatorName || r.operator)} |
            产线：${currentLines.find(l => l.id === r.lineId)?.name || r.lineId} |
            时间：${formatDateTime(r.time)}
          </div>
        </div>
      </div>
      <div class="record-actions">
        <span class="record-confidence">置信度 ${(r.confidence * 100).toFixed(1)}%</span>
        <span class="result-badge ${r.defectType === 'NORMAL' ? 'normal' : 'defect'}">${r.processed ? '已处理' : '未处理'}</span>
        ${!r.processed ? `<button class="btn btn-success btn-sm" onclick="processRecord(${r.id})">处理</button>` : ''}
      </div>
    </div>
  `).join('');
}

// 应用记录筛选
function applyRecordFilter() { renderRecords(); }

// 清空记录筛选
function clearRecordFilter() {
  const filterProcessed = document.getElementById('filterProcessed');
  const filterDefectType = document.getElementById('filterDefectType');
  const filterLabelLevel = document.getElementById('filterLabelLevel');
  const filterDate = document.getElementById('filterDate');
  
  if (filterProcessed) filterProcessed.value = 'all';
  if (filterDefectType) filterDefectType.value = 'all';
  if (filterLabelLevel) filterLabelLevel.value = 'all';
  if (filterDate) filterDate.value = '';
  renderRecords();
}

// 处理记录
function processRecord(id) {
  const record = allRecords.find(r => r.id === id);
  if (!record) return;
  record.processed = true;
  saveRecordsToStorage();
  renderRecords();
  renderRecentRecords();
  updateStats();
  updateChartIfVisible();
  showToast('记录已标记为已处理', 'success');
}

// 切换摄像头
function toggleCamera() {
  const btn = document.getElementById('toggleCameraBtn');
  const video = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const previewCanvas = document.getElementById('previewCanvas');
  
  // 检查浏览器是否支持摄像头
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('您的浏览器不支持摄像头功能', 'error');
    console.error('浏览器不支持 getUserMedia');
    return;
  }
  
  if (!cameraStream) {
    // 请求摄像头权限
    navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'environment' // 优先使用后置摄像头
      }, 
      audio: false 
    })
      .then(stream => {
        cameraStream = stream;
        if (video) {
          video.srcObject = stream;
          video.classList.remove('hidden');
          
          // 确保视频可以播放
          video.onloadedmetadata = function() {
            video.play().catch(e => {
              console.error('视频播放失败:', e);
              showToast('视频播放失败', 'error');
            });
          };
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (previewCanvas) previewCanvas.classList.add('hidden');
        if (btn) btn.textContent = '关闭摄像头';
        showToast('摄像头已开启', 'success');
      })
      .catch(err => {
        console.error('摄像头错误详情:', err);
        let errorMsg = '无法打开摄像头';
        
        // 根据错误类型提供更具体的提示
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMsg = '未找到摄像头设备，请检查摄像头是否连接';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMsg = '摄像头被其他程序占用，请关闭其他使用摄像头的应用';
        } else if (err.name === 'OverconstrainedError') {
          errorMsg = '摄像头不支持指定的分辨率';
        } else if (err.name === 'SecurityError') {
          errorMsg = '安全限制：请在安全的HTTPS环境或localhost下使用';
        }
        
        showToast(errorMsg, 'error');
      });
  } else {
    // 关闭摄像头
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    if (video) video.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (btn) btn.textContent = '开启摄像头';
    showToast('摄像头已关闭', 'success');
  }
}

// 拍照检测（自动开启摄像头）
async function captureAndDetectWithCamera() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('previewCanvas');
  const placeholder = document.getElementById('cameraPlaceholder');

  // 如果摄像头未开启，先尝试开启
  if (!cameraStream) {
    try {
      showToast('正在请求摄像头权限...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        },
        audio: false
      });
      cameraStream = stream;
      if (video) {
        video.srcObject = stream;
        video.classList.remove('hidden');
        video.onloadedmetadata = function() {
          video.play().catch(e => console.error('视频播放失败:', e));
        };
      }
      if (placeholder) placeholder.classList.add('hidden');
      if (canvas) canvas.classList.add('hidden');
      showToast('摄像头已开启，请拍照', 'success');
      // 等待摄像头准备好
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error('摄像头错误:', err);
      let errorMsg = '无法打开摄像头';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头';
      } else if (err.name === 'NotFoundError') {
        errorMsg = '未找到摄像头设备';
      } else if (err.name === 'NotReadableError') {
        errorMsg = '摄像头被其他程序占用';
      }
      showToast(errorMsg, 'error');
      return;
    }
  }

  // 执行拍照
  if (!video || video.classList.contains('hidden')) {
    showToast('摄像头未准备好', 'error');
    return;
  }

  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  currentImageData = canvas.toDataURL('image/png');
  await doDetect(currentImageData, true);
}

// 关闭摄像头
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    const video = document.getElementById('cameraVideo');
    const placeholder = document.getElementById('cameraPlaceholder');
    if (video) video.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    showToast('摄像头已关闭', 'success');
  }
}

// 拍照并检测（旧版本，保留兼容性）
async function captureAndDetect() {
  await captureAndDetectWithCamera();
}

// 上传图片
function uploadImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    currentImageData = e.target.result;
    await doDetect(currentImageData, true);
  };
  reader.readAsDataURL(file);
}



// 显示检测结果 - 修复版
function showDetectResult(result) {
  console.log('显示检测结果:', result);
  currentDetectResult = result;

  // 获取元素
  const resultEmpty = document.getElementById('resultEmpty');
  const resultContent = document.getElementById('resultContent');
  
  // 切换显示状态
  if (resultEmpty) {
    resultEmpty.style.display = 'none';
    resultEmpty.classList.add('hidden');
  }
  
  if (resultContent) {
    resultContent.style.display = 'block';
    resultContent.classList.remove('hidden');
  }

  // 设置预览图片
  const resultPreviewImage = document.getElementById('resultPreviewImage');
  if (resultPreviewImage && result.imageData) {
    resultPreviewImage.src = result.imageData;
  }

  // 设置结果标签
  const resultBadge = document.getElementById('resultBadge');
  if (resultBadge) {
    resultBadge.textContent = result.defectType === 'NORMAL' ? '正常' : '缺陷';
    resultBadge.className = `result-badge ${result.defectType === 'NORMAL' ? 'normal' : 'defect'}`;
  }

  // 设置时间
  const resultTime = document.getElementById('resultTime');
  if (resultTime) {
    resultTime.textContent = formatDateTime(result.time);
  }

  // 设置各项数据
  const resultOperator = document.getElementById('resultOperator');
  if (resultOperator) {
    resultOperator.textContent = result.operatorName || result.operator || '-';
  }

  const resultLine = document.getElementById('resultLine');
  if (resultLine) {
    const lineName = currentLines.find(l => l.id === result.lineId)?.name;
    resultLine.textContent = lineName || result.lineId || '-';
  }

  const resultLevel = document.getElementById('resultLevel');
  if (resultLevel) {
    resultLevel.textContent = result.labelLevel || '-';
  }

  const resultDefectType = document.getElementById('resultDefectType');
  if (resultDefectType) {
    resultDefectType.textContent = DEFECT_TYPE_LABELS[result.defectType] || result.defectType || '-';
  }

  const resultDefectDetail = document.getElementById('resultDefectDetail');
  if (resultDefectDetail) {
    resultDefectDetail.textContent = result.defectDetail || '无';
  }

  const resultArea = document.getElementById('resultArea');
  if (resultArea) {
    resultArea.textContent = result.deviationArea || '无';
  }

  const resultDirection = document.getElementById('resultDirection');
  if (resultDirection) {
    resultDirection.textContent = result.deviationDirection || '无';
  }

  const resultDeviation = document.getElementById('resultDeviation');
  if (resultDeviation) {
    resultDeviation.textContent = result.deviationValue || '无';
  }

  const resultConfidence = document.getElementById('resultConfidence');
  if (resultConfidence) {
    resultConfidence.textContent = result.confidence ? `${(result.confidence * 100).toFixed(1)}%` : '-';
  }

  const resultProcessed = document.getElementById('resultProcessed');
  if (resultProcessed) {
    resultProcessed.textContent = result.processed ? '已处理' : '未处理';
  }
}

// 执行检测 - 修复版
async function doDetect(imageData, forceRefresh = true) {
  console.log('执行检测...');
  
  try {
    // 显示加载状态
    showToast('正在检测，请稍候...', 'info');
    
    // 调用真实的AF-CLIP模型API
    const response = await fetch('http://localhost:8080/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageData, lineId: currentLineId })
    });
    
    if (!response.ok) {
      throw new Error('检测服务不可用');
    }
    
    const apiResult = await response.json();
    
    // 规范化结果
    const result = {
      id: Date.now(),
      operator: currentUser ? currentUser.username : 'unknown',
      operatorName: currentUser ? currentUser.name : '未知用户',
      lineId: currentLineId,
      labelLevel: apiResult.labelLevel || '未识别',
      defectType: apiResult.defectType || 'NORMAL',
      defectDetail: apiResult.defectDetail || '检测完成',
      deviationArea: apiResult.deviationArea || '无',
      deviationDirection: apiResult.deviationDirection || '无',
      deviationValue: apiResult.deviationValue || '无',
      confidence: typeof apiResult.confidence === 'number' ? apiResult.confidence : 0,
      time: apiResult.time || new Date().toISOString(),
      processed: (apiResult.defectType || 'NORMAL') === 'NORMAL',
      imageData: imageData
    };

    currentDetectResult = result;
    allRecords.unshift(result);
    saveRecordsToStorage();

    // 立即显示结果
    showDetectResult(result);

    // 更新其他界面
    renderRecentRecords();
    renderRecords();
    updateStats();
    updateChartIfVisible();
    
    showToast('检测完成', 'success');
  } catch (error) {
    console.error('检测失败:', error);
    showToast('使用模拟数据显示检测结果', 'info');
    
    // 失败时使用模拟数据
    const mockResults = [
      {
        labelLevel: '一级能效',
        defectType: 'NORMAL',
        defectDetail: '标签完整，无缺陷',
        deviationArea: '无',
        deviationDirection: '无',
        deviationValue: '无',
        confidence: 0.95
      },
      {
        labelLevel: '二级能效',
        defectType: 'STAIN',
        defectDetail: '标签表面有轻微污渍',
        deviationArea: '右上角',
        deviationDirection: '无',
        deviationValue: '无',
        confidence: 0.88
      },
      {
        labelLevel: '三级能效',
        defectType: 'POSITION_DEVIATION',
        defectDetail: '标签位置偏移',
        deviationArea: '整体',
        deviationDirection: '向右偏移',
        deviationValue: '2mm',
        confidence: 0.92
      },
      {
        labelLevel: '四级能效',
        defectType: 'WRINKLE',
        defectDetail: '标签有褶皱',
        deviationArea: '中部',
        deviationDirection: '无',
        deviationValue: '无',
        confidence: 0.85
      },
      {
        labelLevel: '五级能效',
        defectType: 'DAMAGE',
        defectDetail: '标签边缘破损',
        deviationArea: '边缘',
        deviationDirection: '无',
        deviationValue: '无',
        confidence: 0.90
      }
    ];
    
    const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];
    
    const result = {
      id: Date.now(),
      operator: currentUser ? currentUser.username : 'unknown',
      operatorName: currentUser ? currentUser.name : '未知用户',
      lineId: currentLineId,
      labelLevel: randomResult.labelLevel,
      defectType: randomResult.defectType,
      defectDetail: randomResult.defectDetail,
      deviationArea: randomResult.deviationArea,
      deviationDirection: randomResult.deviationDirection,
      deviationValue: randomResult.deviationValue,
      confidence: randomResult.confidence,
      time: new Date().toISOString(),
      processed: randomResult.defectType === 'NORMAL',
      imageData: imageData
    };
    
    currentDetectResult = result;
    allRecords.unshift(result);
    saveRecordsToStorage();
    showDetectResult(result);
  }
}

// 标记为已处理
function markProcessed() {
  if (!currentDetectResult) return;
  const record = allRecords.find(r => r.id === currentDetectResult.id);
  if (record) {
    record.processed = true;
    currentDetectResult.processed = true;
    saveRecordsToStorage();
    showDetectResult(currentDetectResult);
    renderRecords();
    renderRecentRecords();
    updateStats();
    updateChartIfVisible();
    showToast('已标记为处理完成', 'success');
  }
}

// 重置检测
function resetDetect() {
  currentDetectResult = null;
  currentImageData = null;
  
  const resultContent = document.getElementById('resultContent');
  const resultEmpty = document.getElementById('resultEmpty');
  
  if (resultContent) {
    resultContent.style.display = 'none';
    resultContent.classList.add('hidden');
  }
  
  if (resultEmpty) {
    resultEmpty.style.display = 'flex';
    resultEmpty.classList.remove('hidden');
  }
}

// 初始化图表
function initChart() {
  const chartBox = document.getElementById('chartBox');
  if (!chartBox) return;
  if (chartInstance) chartInstance.dispose();
  chartInstance = echarts.init(chartBox);
  refreshChart();
  
  window.addEventListener('resize', handleChartResize);
}

// 处理图表大小调整
function handleChartResize() {
  if (chartInstance) {
    chartInstance.resize();
  }
}

// 切换图表类型
function switchChart(type) {
  currentChart = type;
  const chartTabs = document.querySelectorAll('.chart-tab');
  chartTabs.forEach(tab => tab.classList.remove('active'));
  const active = document.querySelector(`.chart-tab[data-chart="${type}"]`);
  if (active) active.classList.add('active');
  refreshChart();
}

// 切换图表时间范围
function changeChartRange(range) {
  chartRange = range;
  const timeBtns = document.querySelectorAll('.time-btn');
  timeBtns.forEach(btn => btn.classList.remove('active'));
  const active = document.querySelector(`.time-btn[data-range="${range}"]`);
  if (active) active.classList.add('active');
  refreshChart();
}

// 初始化操作员筛选 - 修复版，添加管理员选项
function initOperatorFilter() {
  const container = document.getElementById('operatorFilterContainer');
  const select = document.getElementById('operatorFilter');
  if (!container || !select) return;

  if (currentUser && currentUser.role === 'admin') {
    container.classList.remove('hidden');
    
    // 清空现有选项
    select.innerHTML = '';
    
    // 添加"全部操作员"选项
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '全部操作员';
    select.appendChild(allOption);
    
    // 添加所有操作员选项
    const operators = users.filter(u => u.role === 'operator');
    operators.forEach(op => {
      const option = document.createElement('option');
      option.value = op.username;
      option.textContent = op.name || op.username;
      select.appendChild(option);
    });
    
    // 添加所有管理员选项
    const admins = users.filter(u => u.role === 'admin');
    if (admins.length > 0) {
      const adminGroup = document.createElement('optgroup');
      adminGroup.label = '管理员';
      admins.forEach(admin => {
        const option = document.createElement('option');
        option.value = admin.username;
        option.textContent = (admin.name || admin.username) + ' (管理员)';
        adminGroup.appendChild(option);
      });
      select.appendChild(adminGroup);
    }
    
    select.value = selectedOperator;
  } else {
    container.classList.add('hidden');
  }
}

// 切换操作员筛选
function changeOperatorFilter(operator) {
  selectedOperator = operator;
  updateStats();
  renderRecentRecords();
  renderRecords();
  refreshChart();
}

// 获取图表基础记录
function getChartBaseRecords() {
  let records = [...allRecords];
  if (currentUser && currentUser.role === 'operator') {
    records = records.filter(r => r.operator === currentUser.username);
  } else if (currentUser && currentUser.role === 'admin' && selectedOperator !== 'all') {
    records = records.filter(r => r.operator === selectedOperator);
  }
  return records;
}

// 获取图表时间范围记录
function getChartRecordsByRange() {
  const records = getChartBaseRecords();

  if (chartRange === 'today') return records.filter(r => new Date(r.time).getTime() >= getTodayStart());
  if (chartRange === '1m') return records.filter(r => new Date(r.time).getTime() >= getMonthStart());
  if (chartRange === '1y') {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return records.filter(r => new Date(r.time).getTime() >= d.getTime());
  }
  if (chartRange === '7d') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return records.filter(r => new Date(r.time).getTime() >= d.getTime());
  }
  return records;
}

// 刷新图表
function refreshChart() {
  if (!chartInstance) return;

  const records = getChartRecordsByRange();
  const total = records.length;
  const normal = records.filter(r => r.defectType === 'NORMAL').length;
  const defect = total - normal;
  const processed = records.filter(r => r.processed).length;

  const summaryTotal = document.getElementById('summaryTotal');
  const summaryNormal = document.getElementById('summaryNormal');
  const summaryDefect = document.getElementById('summaryDefect');
  const summaryProcessed = document.getElementById('summaryProcessed');
  
  if (summaryTotal) summaryTotal.textContent = total;
  if (summaryNormal) summaryNormal.textContent = total ? ((normal / total) * 100).toFixed(1) + '%' : '0%';
  if (summaryDefect) summaryDefect.textContent = total ? ((defect / total) * 100).toFixed(1) + '%' : '0%';
  if (summaryProcessed) summaryProcessed.textContent = total ? ((processed / total) * 100).toFixed(1) + '%' : '0%';

  let option = {};

  if (currentChart === 'trend') {
    const dateMap = {};
    const today = new Date();
    
    let days = 7;
    if (chartRange === 'today') days = 1;
    else if (chartRange === '7d') days = 7;
    else if (chartRange === '1m') days = 30;
    else if (chartRange === '1y') days = 365;
    
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dateMap[dateStr] = 0;
    }
    
    records.forEach(r => {
      const d = r.time.slice(0, 10);
      if (dateMap.hasOwnProperty(d)) {
        dateMap[d] = (dateMap[d] || 0) + 1;
      }
    });

    const dates = Object.keys(dateMap).sort();
    const values = dates.map(d => dateMap[d]);
    const displayDates = dates.map(d => {
      const date = new Date(d);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    option = {
      title: { 
        text: '检测趋势', 
        left: 'center', 
        textStyle: { fontSize: 16, fontWeight: 'bold' },
        top: 10
      },
      tooltip: { 
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#1f2937' },
        formatter: function(params) {
          const date = dates[params[0].dataIndex];
          const value = params[0].value;
          return `<div style="font-weight:bold;margin-bottom:5px">${date}</div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6"></span>
                    检测数量: <strong>${value}</strong>
                  </div>`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: '15%',
        containLabel: true
      },
      xAxis: { 
        type: 'category', 
        boundaryGap: false, 
        data: displayDates,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: {
          color: '#6b7280',
          fontSize: 12,
          rotate: dates.length > 10 ? 45 : 0
        },
        axisTick: { show: false }
      },
      yAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#6b7280', fontSize: 12 },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#e5e7eb'
          }
        }
      },
      series: [{
        name: '检测数量',
        type: 'line',
        smooth: true,
        data: values,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { 
          width: 3, 
          color: '#3b82f6',
          shadowColor: 'rgba(59,130,246,0.3)',
          shadowBlur: 10,
          shadowOffsetY: 5
        },
        itemStyle: { 
          color: '#3b82f6',
          borderColor: '#fff',
          borderWidth: 2
        },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.4)' },
              { offset: 1, color: 'rgba(59,130,246,0.05)' }
            ]
          }
        },
        label: {
          show: true,
          position: 'top',
          formatter: '{c}',
          fontSize: 12,
          color: '#3b82f6',
          fontWeight: 'bold',
          distance: 8
        }
      }]
    };
  }

  if (currentChart === 'defect') {
    const defectMap = {};
    records.filter(r => r.defectType !== 'NORMAL').forEach(r => {
      const name = DEFECT_TYPE_LABELS[r.defectType] || r.defectType;
      defectMap[name] = (defectMap[name] || 0) + 1;
    });

    const data = Object.keys(defectMap).map(name => ({ name, value: defectMap[name] }));
    const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];

    option = {
      title: { text: '缺陷占比', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' }, top: 10 },
      tooltip: { 
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}\n{c} ({d}%)'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          }
        },
        data: data.map((item, index) => ({
          ...item,
          itemStyle: { color: colors[index % colors.length] }
        }))
      }]
    };
  }

  if (currentChart === 'line') {
    const lineMap = {};
    currentLines.forEach(line => {
      lineMap[line.name] = records.filter(r => r.lineId === line.id).length;
    });

    const data = Object.keys(lineMap).map(name => ({ name, value: lineMap[name] }));
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

    option = {
      title: { text: '产线统计', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' }, top: 10 },
      tooltip: { 
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}\n{c} ({d}%)'
        },
        data: data.map((item, index) => ({
          ...item,
          itemStyle: { color: colors[index % colors.length] }
        }))
      }]
    };
  }

  if (currentChart === 'level') {
    const levelMap = {};
    LEVEL_ORDER.forEach(level => {
      levelMap[level] = records.filter(r => r.labelLevel === level).length;
    });

    const data = Object.keys(levelMap).map(name => ({ name, value: levelMap[name] }));
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

    option = {
      title: { text: '能级统计', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' }, top: 10 },
      tooltip: { 
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}\n{c} ({d}%)'
        },
        data: data.map((item, index) => ({
          ...item,
          itemStyle: { color: colors[index % colors.length] }
        }))
      }]
    };
  }

  if (currentChart === 'status') {
    option = {
      title: { text: '正常/缺陷占比', left: 'center', textStyle: { fontSize: 16, fontWeight: 'bold' }, top: 10 },
      tooltip: { 
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}\n{c} ({d}%)'
        },
        data: [
          { name: '正常', value: normal, itemStyle: { color: '#22c55e' } },
          { name: '缺陷', value: defect, itemStyle: { color: '#ef4444' } }
        ]
      }]
    };
  }

  chartInstance.setOption(option, true);
}

// 更新统计数据
function updateStats() {
  const records = getChartBaseRecords();

  const total = records.length;
  const normal = records.filter(r => r.defectType === 'NORMAL').length;
  const defect = total - normal;
  const processed = records.filter(r => r.processed).length;
  const pending = total - processed;

  const todayStart = getTodayStart();
  const monthStart = getMonthStart();

  const todayCount = records.filter(r => new Date(r.time).getTime() >= todayStart).length;
  const monthCount = records.filter(r => new Date(r.time).getTime() >= monthStart).length;

  const statTotal = document.getElementById('statTotal');
  const statNormal = document.getElementById('statNormal');
  const statDefect = document.getElementById('statDefect');
  const statPending = document.getElementById('statPending');
  const statToday = document.getElementById('statToday');
  const statMonth = document.getElementById('statMonth');
  
  if (statTotal) statTotal.textContent = total;
  if (statNormal) statNormal.textContent = normal;
  if (statDefect) statDefect.textContent = defect;
  if (statPending) statPending.textContent = pending;
  if (statToday) statToday.textContent = todayCount;
  if (statMonth) statMonth.textContent = monthCount;
}

// 如果图表可见则更新
function updateChartIfVisible() {
  const chartTab = document.getElementById('tab-charts');
  if (chartTab && !chartTab.classList.contains('hidden')) {
    if (!chartInstance) initChart();
    else refreshChart();
  }
}

// 切换标签页
function showTab(tabName) {
  const tabSections = document.querySelectorAll('.tab-section');
  tabSections.forEach(tab => tab.classList.add('hidden'));
  
  const targetTab = document.getElementById('tab-' + tabName);
  if (targetTab) targetTab.classList.remove('hidden');

  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => item.classList.remove('active'));
  
  const activeItem = document.querySelector(`.menu-item[data-tab="${tabName}"]`);
  if (activeItem) activeItem.classList.add('active');

  const titles = {
    dashboard: { title: '数据总览', subtitle: '实时查看检测数据与统计信息' },
    detect: { title: '检测中心', subtitle: '拍照检测、OCR识别与缺陷分析' },
    records: { title: '检测记录', subtitle: '查看和筛选历史检测数据' },
    charts: { title: '统计图表', subtitle: '多维度数据分析与可视化' },
    lines: { title: '产线配置', subtitle: '管理检测产线与设备' },
    users: { title: '用户管理', subtitle: '管理系统用户与权限' }
  };

  const info = titles[tabName] || titles.dashboard;
  
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  
  if (pageTitle) pageTitle.textContent = info.title;
  if (pageSubtitle) pageSubtitle.textContent = info.subtitle;

  if (tabName === 'charts') {
    setTimeout(() => {
      initChart();
      initOperatorFilter();
      refreshChart();
    }, 100);
  }

  if (tabName === 'dashboard') {
    updateStats();
    renderRecentRecords();
  }

  if (tabName === 'records') renderRecords();
  if (tabName === 'users') renderUserList();
  if (tabName === 'lines') renderLineList();
}

// 渲染用户列表
function renderUserList() {
  const list = document.getElementById('userList');
  if (!list) return;

  const displayUsers = users.filter(u => u.role !== 'qc');
  list.innerHTML = displayUsers.map(u => `
    <div class="user-item">
      <div class="user-avatar-sm">${escapeHtml(u.name ? u.name.charAt(0) : u.username.charAt(0))}</div>
      <div class="user-details">
        <div class="user-name-row">
          ${escapeHtml(u.name || u.username)}
          <span class="user-role-badge ${u.role}">${u.role === 'admin' ? '管理员' : '操作员'}</span>
        </div>
        <div class="user-meta-row">账号：${escapeHtml(u.username)}</div>
      </div>
      <div class="line-actions">
        <button class="btn btn-secondary btn-sm" onclick="editUser(${u.id})">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">删除</button>
      </div>
    </div>
  `).join('');
}

// 添加用户
function addUser() {
  const username = prompt('请输入用户名:');
  if (!username) return;
  
  const saved = localStorage.getItem('users');
  if (saved) {
    users = JSON.parse(saved);
  }
  
  if (users.some(u => u.username === username)) {
    showToast('用户名已存在', 'error');
    return;
  }

  const name = prompt('请输入姓名:');
  if (!name) return;
  const password = prompt('请输入密码:');
  if (!password) return;
  const role = prompt('请输入角色 (admin/operator):', 'operator');
  if (!role || (role !== 'admin' && role !== 'operator')) {
    showToast('角色只能是 admin 或 operator', 'error');
    return;
  }

  users.push({ id: Date.now(), username, password, role, name });
  saveUsersToStorage();
  renderUserList();
  initOperatorFilter();
  showToast('用户添加成功', 'success');
}

// 删除用户
function deleteUser(userId) {
  if (!confirm('确定要删除该用户吗？')) return;
  const index = users.findIndex(u => u.id === userId);
  if (index > -1) {
    users.splice(index, 1);
    saveUsersToStorage();
    renderUserList();
    initOperatorFilter();
    showToast('用户删除成功', 'success');
  }
}

// 编辑用户
function editUser(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const newName = prompt('请输入新姓名:', user.name);
  if (newName === null) return;
  const newRole = prompt('请输入新角色 (admin/operator):', user.role);
  if (newRole === null) return;
  if (newRole !== 'admin' && newRole !== 'operator') {
    showToast('角色只能是 admin 或 operator', 'error');
    return;
  }

  user.name = newName || user.name;
  user.role = newRole || user.role;

  saveUsersToStorage();
  renderUserList();
  initOperatorFilter();
  updateMenuByRole();
  showToast('用户修改成功', 'success');
}

// 打开帮助模态框
function openHelpModal() { 
  const helpModal = document.getElementById('helpModal');
  if (helpModal) helpModal.classList.remove('hidden'); 
}

// 关闭帮助模态框
function closeHelpModal(e) {
  const helpModal = document.getElementById('helpModal');
  if (!e || e.target === helpModal || e.target.closest('.modal-close')) {
    if (helpModal) helpModal.classList.add('hidden');
  }
}

// 查看图片
function viewImage(id) {
  const record = allRecords.find(r => r.id === id);
  if (record && record.imageData) {
    const modalImage = document.getElementById('modalImage');
    const imageModal = document.getElementById('imageModal');
    if (modalImage) modalImage.src = record.imageData;
    if (imageModal) imageModal.classList.remove('hidden');
  }
}

// 关闭图片模态框
function closeImageModal() { 
  const imageModal = document.getElementById('imageModal');
  if (imageModal) imageModal.classList.add('hidden'); 
}

// 将base64图片数据转换为Excel可用的格式
function base64ToArrayBuffer(base64) {
  const base64Data = base64.split(',')[1];
  if (!base64Data) return null;
  
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// 导出Excel - 带图片版本
function exportToExcel() {
  const records = getFilteredRecordsForCurrentView();
  if (!records.length) return showToast('暂无可导出的数据', 'warning');

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 准备数据
  const data = records.map(r => ({
    检测时间: formatDateTime(r.time),
    操作员: r.operatorName || r.operator,
    产线: currentLines.find(l => l.id === r.lineId)?.name || r.lineId,
    能效等级: r.labelLevel,
    缺陷类型: DEFECT_TYPE_LABELS[r.defectType] || r.defectType,
    缺陷说明: r.defectDetail || '',
    置信度: `${(r.confidence * 100).toFixed(1)}%`,
    处理状态: r.processed ? '已处理' : '未处理',
    图片: r.imageData ? '有图片' : '无图片'
  }));

  // 添加汇总数据
  const total = records.length;
  const normal = records.filter(r => r.defectType === 'NORMAL').length;
  const defect = total - normal;
  const processed = records.filter(r => r.processed).length;
  
  const summaryData = [
    {},
    { 检测时间: '汇总统计', 操作员: '', 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' },
    { 检测时间: '总检测数', 操作员: total, 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' },
    { 检测时间: '正常标签', 操作员: normal, 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' },
    { 检测时间: '缺陷标签', 操作员: defect, 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' },
    { 检测时间: '已处理', 操作员: processed, 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' },
    { 检测时间: '未处理', 操作员: total - processed, 产线: '', 能效等级: '', 缺陷类型: '', 缺陷说明: '', 置信度: '', 处理状态: '', 图片: '' }
  ];

  // 合并数据
  const allData = [...data, ...summaryData];

  // 创建工作表
  const ws = XLSX.utils.json_to_sheet(allData);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 20 },  // 检测时间
    { wch: 15 },  // 操作员
    { wch: 15 },  // 产线
    { wch: 12 },  // 能效等级
    { wch: 12 },  // 缺陷类型
    { wch: 20 },  // 缺陷说明
    { wch: 12 },  // 置信度
    { wch: 12 },  // 处理状态
    { wch: 12 }   // 图片
  ];

  // 如果有图片，添加图片到工作表
  let imageCount = 0;
  records.forEach((r, index) => {
    if (r.imageData && r.imageData.startsWith('data:image')) {
      try {
        const imgBuffer = base64ToArrayBuffer(r.imageData);
        if (imgBuffer) {
          // 添加图片到工作簿
          const imgId = XLSX.utils.book_append_sheet(wb, ws, '检测记录');
          
          // 由于xlsx.js在浏览器中直接嵌入图片比较复杂，
          // 我们在单元格中添加图片标记和说明
          const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 8 }); // 图片列
          if (ws[cellRef]) {
            ws[cellRef].v = `图片_${index + 1}`;
            ws[cellRef].c = [{ a: 'SheetJS', t: '查看检测图片' }];
          }
          imageCount++;
        }
      } catch (e) {
        console.error('处理图片失败:', e);
      }
    }
  });

  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(wb, ws, '检测记录');

  // 如果有图片，创建第二个工作表专门存放图片链接
  if (imageCount > 0) {
    const imgData = records.filter(r => r.imageData).map((r, idx) => ({
      序号: idx + 1,
      检测时间: formatDateTime(r.time),
      图片文件名: `检测图片_${idx + 1}_${r.id}.png`,
      图片数据: r.imageData.substring(0, 100) + '...' // 只显示前100个字符作为标识
    }));
    
    const imgWs = XLSX.utils.json_to_sheet(imgData);
    imgWs['!cols'] = [
      { wch: 8 },
      { wch: 20 },
      { wch: 30 },
      { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, imgWs, '图片索引');
  }

  // 生成文件名并下载
  const fileName = `能效标签检测记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  
  showToast(`Excel导出成功，共${records.length}条记录${imageCount > 0 ? '，包含' + imageCount + '张图片索引' : ''}`, 'success');
}

// 刷新所有数据
function refreshAll() {
  const saved = localStorage.getItem('users');
  if (saved) {
    users = JSON.parse(saved);
  }
  
  loadRecordsFromStorage();
  loadLines();
  updateMenuByRole();
  initOperatorFilter();
  renderUserList();
  renderRecentRecords();
  renderRecords();
  renderLineList();
  updateStats();
  refreshChart();
  showToast('数据已刷新', 'success');
}

// 全局绑定到 window 对象 - 确保 HTML 中的 onclick 可以调用
window.login = login;
window.logout = logout;
window.register = register;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.showTab = showTab;
window.refreshAll = refreshAll;
window.exportToExcel = exportToExcel;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.toggleCamera = toggleCamera;
window.captureAndDetect = captureAndDetect;
window.uploadImage = uploadImage;
window.runOCR = runOCR;
window.markProcessed = markProcessed;
window.resetDetect = resetDetect;
window.applyRecordFilter = applyRecordFilter;
window.clearRecordFilter = clearRecordFilter;
window.processRecord = processRecord;
window.changeLine = changeLine;
window.changeOperatorFilter = changeOperatorFilter;
window.switchChart = switchChart;
window.changeChartRange = changeChartRange;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.editUser = editUser;
window.viewImage = viewImage;
window.closeImageModal = closeImageModal;
window.addLine = addLine;
window.deleteLine = deleteLine;
window.toggleLineStatus = toggleLineStatus;

function toggleRealtimeDetect() {
  const btn = document.getElementById('toggleRealtimeBtn');
  const video = document.getElementById('cameraVideo');
  
  if (!cameraStream || !video || video.classList.contains('hidden')) {
    showToast('请先开启摄像头', 'warning');
    return;
  }
  
  if (!isRealtimeDetecting) {
    startRealtimeDetect();
    if (btn) btn.textContent = '停止实时检测';
    if (btn) btn.classList.remove('btn-warning');
    if (btn) btn.classList.add('btn-danger');
    isRealtimeDetecting = true;
    showToast('实时检测已开启', 'success');
  } else {
    stopRealtimeDetect();
    if (btn) btn.textContent = '开启实时检测';
    if (btn) btn.classList.remove('btn-danger');
    if (btn) btn.classList.add('btn-warning');
    isRealtimeDetecting = false;
    showToast('实时检测已停止', 'success');
  }
}

function startRealtimeDetect() {
  const detectInterval = 1500;
  
  realtimeDetectInterval = setInterval(() => {
    captureFrameAndDetect();
  }, detectInterval);
}

function stopRealtimeDetect() {
  if (realtimeDetectInterval) {
    clearInterval(realtimeDetectInterval);
    realtimeDetectInterval = null;
  }
}

function captureFrameAndDetect() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('previewCanvas');
  
  if (!video || !canvas) return;
  
  try {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    currentImageData = canvas.toDataURL('image/jpeg', 0.7);
    doDetectRealtime(currentImageData);
  } catch (e) {
    console.error('实时捕获帧失败:', e);
  }
}

function doDetectRealtime(imageData) {
  const isNormal = Math.random() > 0.35;
  const defectTypeList = ['DAMAGE', 'STAIN', 'WRINKLE', 'POSITION_DEVIATION'];
  const defectType = isNormal ? 'NORMAL' : defectTypeList[Math.floor(Math.random() * defectTypeList.length)];

  let defectDetail = '正常';
  let deviationDirection = '无';
  let deviationValue = '0mm';
  let deviationArea = '无';

  if (defectType === 'DAMAGE') {
    defectDetail = '标签存在破损';
  } else if (defectType === 'STAIN') {
    defectDetail = '标签表面存在污渍';
  } else if (defectType === 'WRINKLE') {
    defectDetail = '标签存在褶皱';
  } else if (defectType === 'POSITION_DEVIATION') {
    defectDetail = '标签位置偏差';
    deviationDirection = ['左', '右', '上', '下'][Math.floor(Math.random() * 4)];
    deviationValue = (Math.random() * 8).toFixed(1) + ' mm';
    deviationArea = ['左上', '右上', '左下', '右下', '中心'][Math.floor(Math.random() * 5)];
  }

  const result = {
    id: Date.now(),
    operator: currentUser ? currentUser.username : 'unknown',
    operatorName: currentUser ? currentUser.name : '未知用户',
    lineId: currentLineId,
    labelLevel: LEVEL_ORDER[Math.floor(Math.random() * LEVEL_ORDER.length)],
    defectType: defectType,
    defectDetail: defectDetail,
    deviationArea: deviationArea,
    deviationDirection: deviationDirection,
    deviationValue: deviationValue,
    confidence: parseFloat((0.85 + Math.random() * 0.14).toFixed(2)),
    time: new Date().toISOString(),
    processed: defectType === 'NORMAL',
    imageData: imageData,
    realtime: true
  };

  showDetectResult(result);
  
  if (defectType !== 'NORMAL') {
    currentDetectResult = result;
    allRecords.unshift(result);
    saveRecordsToStorage();
    renderRecentRecords();
    renderRecords();
    updateStats();
    updateChartIfVisible();
  }
}

const originalToggleCamera = toggleCamera;
window.toggleCamera = function() {
  if (isRealtimeDetecting) {
    stopRealtimeDetect();
    const btn = document.getElementById('toggleRealtimeBtn');
    if (btn) btn.textContent = '开启实时检测';
    if (btn) btn.classList.remove('btn-danger');
    if (btn) btn.classList.add('btn-warning');
    isRealtimeDetecting = false;
  }
  originalToggleCamera();
};

function runOCR() {
  if (!currentImageData) return showToast('请先拍照或上传图片', 'warning');

  const ocrResult = document.getElementById('ocrResult');
  if (ocrResult) ocrResult.textContent = 'OCR识别中...';

  requestOCR(currentImageData)
    .then(result => {
      if (ocrResult) {
        const score = typeof result.score === 'number' ? `（置信度 ${(result.score * 100).toFixed(1)}%）` : '';
        ocrResult.textContent = `${result.text || 'OCR识别完成'}${score}`;
      }
      showToast('OCR识别完成', 'success');
    })
    .catch(error => {
      if (ocrResult) ocrResult.textContent = 'OCR识别失败，请检查模型服务。';
      showToast(error.message || 'OCR识别失败', 'error');
    });
}

function doDetect(imageData, forceRefresh = true) {
  console.log('执行检测...');

  requestDetect(imageData, { lineId: currentLineId, realtime: false })
    .then(result => {
      currentDetectResult = result;
      allRecords.unshift(result);
      saveRecordsToStorage();
      showDetectResult(result);
      renderRecentRecords();
      renderRecords();
      updateStats();
      updateChartIfVisible();

      if (result.warning) {
        showToast(`检测完成（${result.warning}）`, 'warning');
      } else {
        showToast('检测完成', 'success');
      }
    })
    .catch(error => {
      showToast(error.message || '检测失败', 'error');
    });
}

function doDetectRealtime(imageData) {
  if (realtimeRequestInFlight) return;
  realtimeRequestInFlight = true;

  requestDetect(imageData, { lineId: currentLineId, realtime: true })
    .then(result => {
      showDetectResult(result);
      if (result.defectType !== 'NORMAL') {
        currentDetectResult = result;
        allRecords.unshift(result);
        saveRecordsToStorage();
        renderRecentRecords();
        renderRecords();
        updateStats();
        updateChartIfVisible();
      }
    })
    .catch(error => {
      console.error('实时检测失败:', error);
    })
    .finally(() => {
      realtimeRequestInFlight = false;
    });
}

window.runOCR = runOCR;
