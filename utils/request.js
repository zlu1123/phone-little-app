/**
 * 统一请求工具
 * 封装 wx.request 和 wx.uploadFile，统一处理 401 登录过期
 */

// 是否正在跳转登录页：一旦置 true，本次会话内不再触发重复弹窗/跳转
// 仅在登录页 onLoad 时通过 resetLoginRedirectFlag 重置
let isRedirectingToLogin = false;

/**
 * 重置"正在跳转登录页"标志
 * 由登录页 onLoad 调用，确保下次 token 过期还能正常拦截
 */
const resetLoginRedirectFlag = () => {
  isRedirectingToLogin = false;
};

/**
 * 处理 401 登录过期：提示用户 → 清理缓存 → 跳转登录页
 * 整个 App 会话内只会触发一次，直到进入登录页后才允许下一次
 */
const handleUnauthorized = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;

  // 关闭可能存在的 loading/toast，避免覆盖 modal
  try { wx.hideLoading(); } catch (_e) { /* ignore */ }
  try { wx.hideToast(); } catch (_e) { /* ignore */ }

  // 立即清理本地缓存（token、用户信息等），防止后续逻辑读到过期数据
  try { wx.clearStorageSync(); } catch (_e) { /* ignore */ }

  wx.showModal({
    title: '登录过期',
    content: '当前登录状态已过期，请重新登录',
    showCancel: false,
    confirmText: '重新登录',
    success: () => {
      wx.reLaunch({
        url: '/pages/login/login'
        // 不在此重置 isRedirectingToLogin，由登录页 onLoad 重置
      });
    },
    fail: () => {
      // modal 异常时也强制跳转，避免卡死
      wx.reLaunch({ url: '/pages/login/login' });
    }
  });
};

/**
 * 检查是否为 401 未授权
 * 同时支持两种场景：
 * 1. HTTP 状态码为 401
 * 2. HTTP 状态码为 200，但响应体中 code 为 401
 * @param {Object} res - wx.request / wx.uploadFile 的响应对象
 * @returns {boolean} 是否为 401
 */
const checkUnauthorized = (res) => {
  // 场景1：HTTP 状态码 401
  if (res.statusCode === 401) {
    handleUnauthorized();
    return true;
  }

  // 场景2：响应体中 code 为 401（后端业务层返回的认证失败）
  const data = res.data;
  if (data) {
    // wx.request 返回的 data 已经是对象
    // wx.uploadFile 返回的 data 是字符串，需要解析
    let bodyData = data;
    if (typeof data === 'string') {
      try {
        bodyData = JSON.parse(data);
      } catch (_e) {
        return false;
      }
    }
    if (bodyData && bodyData.code === 401) {
      handleUnauthorized();
      return true;
    }
  }

  return false;
};

/**
 * 封装 wx.request，自动拦截 401
 * @param {Object} options - wx.request 的参数
 * @returns {Promise}
 */
const request = (options) => {
  // 已在跳转登录页过程中，直接拒绝后续请求，避免触发更多 401
  if (isRedirectingToLogin) {
    return Promise.reject(new Error('登录状态已过期'));
  }

  const originalSuccess = options.success;
  const originalFail = options.fail;

  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: (res) => {
        // 拦截 401（HTTP 状态码或响应体 code）
        if (checkUnauthorized(res)) {
          reject(new Error('登录状态已过期'));
          return;
        }
        // 如果调用方传了 success 回调，走回调模式
        if (originalSuccess) {
          originalSuccess(res);
          resolve(res);
        } else {
          resolve(res);
        }
      },
      fail: (err) => {
        if (originalFail) {
          originalFail(err);
          reject(err);
        } else {
          reject(err);
        }
      }
    });
  });
};

/**
 * 封装 wx.uploadFile，自动拦截 401
 * @param {Object} options - wx.uploadFile 的参数
 * @returns {Promise}
 */
const uploadFile = (options) => {
  // 已在跳转登录页过程中，直接拒绝后续请求
  if (isRedirectingToLogin) {
    return Promise.reject(new Error('登录状态已过期'));
  }

  const originalSuccess = options.success;
  const originalFail = options.fail;

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      ...options,
      success: (res) => {
        // 拦截 401（HTTP 状态码或响应体 code）
        if (checkUnauthorized(res)) {
          reject(new Error('登录状态已过期'));
          return;
        }
        if (originalSuccess) {
          originalSuccess(res);
          resolve(res);
        } else {
          resolve(res);
        }
      },
      fail: (err) => {
        if (originalFail) {
          originalFail(err);
          reject(err);
        } else {
          reject(err);
        }
      }
    });
  });
};

module.exports = {
  request,
  uploadFile,
  checkUnauthorized,
  handleUnauthorized,
  resetLoginRedirectFlag
};
