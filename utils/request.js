/**
 * 统一请求工具
 * 封装 wx.request 和 wx.uploadFile，统一处理：
 * - 401 登录过期
 * - 公共请求头注入
 * - 响应体标准化（兼容 { data: {...} } 和扁平结构）
 */

const { buildApiUrl } = require('../config');

// 是否正在跳转登录页：一旦置 true，本次会话内不再触发重复弹窗/跳转
let isRedirectingToLogin = false;

/**
 * 重置"正在跳转登录页"标志
 */
const resetLoginRedirectFlag = () => {
  isRedirectingToLogin = false;
};

/**
 * 处理 401 登录过期
 */
const handleUnauthorized = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;

  try { wx.hideLoading(); } catch (_e) { /* ignore */ }
  try { wx.hideToast(); } catch (_e) { /* ignore */ }

  try { wx.clearStorageSync(); } catch (_e) { /* ignore */ }

  wx.showModal({
    title: '登录过期',
    content: '当前登录状态已过期，请重新登录',
    showCancel: false,
    confirmText: '重新登录',
    success: () => {
      wx.reLaunch({ url: '/pages/login/login' });
    },
    fail: () => {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  });
};

/**
 * 检查是否为 401
 */
const checkUnauthorized = (res) => {
  if (res.statusCode === 401) {
    handleUnauthorized();
    return true;
  }

  const data = res.data;
  if (data) {
    let bodyData = data;
    if (typeof data === 'string') {
      try { bodyData = JSON.parse(data); } catch (_e) { return false; }
    }
    if (bodyData && bodyData.code === 401) {
      handleUnauthorized();
      return true;
    }
  }

  return false;
};

/**
 * 获取公共请求头
 */
const getCommonHeaders = () => ({
  Authorization: 'Bearer ' + (wx.getStorageSync('token') || ''),
  'x-app-wechat': '5c89231b711447acbf995c28c435dc39'
});

/**
 * 标准化响应体
 * 兼容两种后端返回格式：
 *   { code: 200, data: { rows: [...], total: 2 } }   → 有 data 包裹
 *   { code: 200, rows: [...], total: 2 }              → 扁平结构
 * 统一为扁平结构 { code, msg, rows, total, ... }
 */
const normalizeResponse = (res) => {
  const body = res.data;

  // 如果 body 不是对象，直接返回
  if (!body || typeof body !== 'object') return res;

  // 如果存在 data 字段且为对象，将 data 的内容提升到 body 层级
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    const { data: wrapper, ...rest } = body;
    res.data = { ...rest, ...wrapper };
  }

  return res;
};

/**
 * 封装 wx.request，自动：
 * - 注入公共请求头
 * - 标准化响应体（兼容 data 包裹和扁平结构）
 * - 拦截 401
 *
 * @param {Object} options - wx.request 参数
 * @returns {Promise}
 */
const request = (options) => {
  if (isRedirectingToLogin) {
    return Promise.reject(new Error('登录状态已过期'));
  }

  const originalSuccess = options.success;
  const originalFail = options.fail;

  // 合并请求头：charset=UTF-8 避免中文乱码，自定义 header 优先级更高
  const mergedHeaders = {
    'Content-Type': 'application/json;charset=UTF-8',
    ...getCommonHeaders(),
    ...(options.header || {})
  };

  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      header: mergedHeaders,
      success: (res) => {
        if (checkUnauthorized(res)) {
          reject(new Error('登录状态已过期'));
          return;
        }

        // 标准化响应体
        normalizeResponse(res);

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
 * 便捷 GET 请求
 * @param {string} endpoint - API_ENDPOINTS 中定义的 key
 * @param {Object} params - URL 查询参数
 * @param {Object} extraOptions - 额外的 wx.request 参数（如 header）
 */
const get = (endpoint, params, extraOptions) => {
  return request({
    url: buildApiUrl(endpoint),
    method: 'GET',
    data: params,
    ...extraOptions
  });
};

/**
 * 便捷 POST 请求
 * @param {string} endpoint - API_ENDPOINTS 中定义的 key
 * @param {Object} data - 请求体
 * @param {Object} extraOptions - 额外的 wx.request 参数
 */
const post = (endpoint, data, extraOptions) => {
  const { header: extraHeader, ...restExtra } = extraOptions || {};
  return request({
    url: buildApiUrl(endpoint),
    method: 'POST',
    data,
    header: { 'content-type': 'application/json;charset=UTF-8', ...extraHeader },
    ...restExtra
  });
};

/**
 * 封装 wx.uploadFile，自动拦截 401
 */
const uploadFile = (options) => {
  if (isRedirectingToLogin) {
    return Promise.reject(new Error('登录状态已过期'));
  }

  const originalSuccess = options.success;
  const originalFail = options.fail;

  // 合并公共请求头（自定义 header 优先级更高）
  const mergedHeaders = { ...getCommonHeaders(), ...(options.header || {}) };

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      ...options,
      header: mergedHeaders,
      success: (res) => {
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
  get,
  post,
  uploadFile,
  getCommonHeaders,
  checkUnauthorized,
  handleUnauthorized,
  resetLoginRedirectFlag,
  isRedirectingToLogin: () => isRedirectingToLogin
};
