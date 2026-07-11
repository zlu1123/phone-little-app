/**
 * 权限与认证工具模块
 * 统一管理下单权限校验等认证相关逻辑
 */

/**
 * 检查当前登录用户是否有下单权限
 * 从缓存 userInfo.canPlaceOrder 读取，仅当后端显式返回 false 时拦截
 *
 * @returns {boolean} true=允许下单，false=禁止下单
 */
const checkCanPlaceOrder = () => {
  try {
    const userInfo = wx.getStorageSync('userInfo') || {};
    // 仅当 canPlaceOrder 显式为 false 时拦截
    // null/undefined（旧缓存缺失该字段或后端未返回）均放行
    if (userInfo.canPlaceOrder === false) {
      wx.showToast({
        title: '您暂无下单权限',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    return true;
  } catch (_e) {
    // 缓存读取异常时放行，避免误伤
    return true;
  }
};

/**
 * 安全读取 canPlaceOrder，避免 || false 陷阱
 * @returns {boolean}
 */
const getCanPlaceOrder = () => {
  try {
    const userInfo = wx.getStorageSync('userInfo') || {};
    return userInfo.canPlaceOrder !== false;
  } catch (_e) {
    return true;
  }
};

module.exports = {
  checkCanPlaceOrder,
  getCanPlaceOrder
};
