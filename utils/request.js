/**
 * 统一请求工具
 * 封装 wx.request 和 wx.uploadFile，统一处理 401 登录过期
 */

// 防止重复弹窗和跳转的标志
let isShowingLoginExpired = false;

/**
 * 处理 401 登录过期：提示用户 → 清理缓存 → 跳转登录页
 */
const handleUnauthorized = () => {
  if (isShowingLoginExpired) return;
  isShowingLoginExpired = true;

  wx.showModal({
    title: '登录过期',
    content: '当前登录状态已过期，请重新登录',
    showCancel: false,
    confirmText: '重新登录',
    complete: () => {
      // 清理本地缓存（token、用户信息等）
      wx.clearStorageSync();
      // 跳转到登录页
      wx.reLaunch({
        url: '/pages/login/login',
        complete: () => {
          isShowingLoginExpired = false;
        }
      });
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
  handleUnauthorized
};
