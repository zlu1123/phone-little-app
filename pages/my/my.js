const { API_ENDPOINTS, buildApiUrl } = require('../../config');
const { request, resetLoginRedirectFlag } = require('../../utils/request');

Page({
  data: {
    userInfo: {
      nickName: '微信用户',
      avatarUrl: '',
      phone: '',
      userName: '',
      userId: '',
      roles: [],
      storeName: '',
      storeId: '',
      canPlaceOrder: false
    },
    statusBarHeight: 0,
    navBarHeight: 44,
    isLoggedIn: false,
    isGuest: false,
    hasUserRole: false,
    hasWechatRole: false,
    canPlaceOrder: false
  },

  onLoad() {
    // 重置"正在跳转登录页"标志
    resetLoginRedirectFlag();

    // 获取系统信息，设置状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    let menuButtonInfo = null;
    try {
      menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    } catch (e) {
      console.error('获取胶囊按钮信息失败', e);
    }

    let navBarHeight = 44;
    if (menuButtonInfo) {
      navBarHeight =
        (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 +
        menuButtonInfo.height;
    }

    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      navBarHeight: navBarHeight || 44
    });
  },

  onShow() {
    // 同步自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 });
    }
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const isGuest = wx.getStorageSync('isGuest') || false;
    const isLoggedIn = wx.getStorageSync('isLoggedIn') || false;
    const token = wx.getStorageSync('token');
    const tokenExpireTime = wx.getStorageSync('tokenExpireTime');
    const userInfo = wx.getStorageSync('userInfo') || {
      nickName: '微信用户',
      avatarUrl: '',
      phone: '',
      userName: '',
      userId: '',
      roles: [],
      storeName: '',
      storeId: '',
      canPlaceOrder: false
    };

    const now = Date.now();
    let isValidLogin = isLoggedIn;

    // 如果不是游客，且 token 不存在或已过期，则视为未登录
    if (!isGuest && (!token || !tokenExpireTime || now > tokenExpireTime)) {
      isValidLogin = false;
      // 清除过期状态
      wx.removeStorageSync('token');
      wx.removeStorageSync('tokenExpireTime');
      wx.removeStorageSync('isLoggedIn');
      wx.removeStorageSync('userInfo');
    }

    const defaultUserInfo = { nickName: '微信用户', avatarUrl: '', phone: '', userName: '', userId: '', roles: [], storeName: '', storeId: '', canPlaceOrder: false };

    this.setData({
      isLoggedIn: isValidLogin,
      isGuest,
      userInfo: isValidLogin || isGuest ? userInfo : defaultUserInfo
    });

    // 判断是否包含 user 角色，用于展示待审核列表入口
    const roles = (isValidLogin && userInfo.roles) || [];
    this.setData({
      hasUserRole: Array.isArray(roles) && roles.includes('user'),
      hasWechatRole: Array.isArray(roles) && roles.includes('wechat'),
      canPlaceOrder: isValidLogin && userInfo.canPlaceOrder !== false
    });

    // 如果未登录且不是游客模式，跳转到登录页
    if (!isValidLogin && !isGuest) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/login'
        });
      }, 1000);
      return;
    }

    // 已登录用户通过查询手机型号列表接口前置校验 token 是否真正有效
    if (isValidLogin && !isGuest) {
      this.verifyTokenByApi();
    }
  },

  // 通过查询手机型号列表接口校验 token 有效性
  verifyTokenByApi() {
    request({
      url: buildApiUrl(API_ENDPOINTS.queryPhoneTypeList),
      method: 'GET'
    }).then(res => {
      const data = res.data;
      if (data && data.code === 200) {
        console.log('Token 校验通过，服务端连接正常');
      }
    }).catch(err => {
      // 若返回 401 等异常，全局拦截器 handleUnauthorized 已统一处理清缓存 + 跳转登录页
      console.log('Token 校验失败:', err.message);
    });
  },

  handleUserInfo() {
    if (this.data.isLoggedIn) {
      // 已登录，跳转到个人信息页面
      wx.navigateTo({
        url: '/pages/profile/profile'
      });
    } else {
      // 未登录，跳转到登录页
      wx.navigateTo({
        url: '/pages/login/login'
      });
    }
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: res => {
        if (res.confirm) {
          // 清除登录状态
          wx.removeStorageSync('isLoggedIn');
          wx.removeStorageSync('isGuest');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('token');
          wx.removeStorageSync('tokenExpireTime');

          // 跳转到登录页
          wx.navigateTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  // 【测试用】新签协议入口（orderId=39），上线前请删除
  handleTestSignContract() {
    wx.navigateTo({
      url: '/pages/contract-sign/contract-sign?orderId=39'
    });
  },

  // 跳转已签约待赔付订单页面
  handleOpenCompensationOrder() {
    wx.navigateTo({
      url: '/pages/compensation-order/compensation-order'
    });
  },

  // 跳转待审核列表页面
  handleOpenReviewList() {
    wx.navigateTo({
      url: '/pages/review-list/review-list'
    });
  }
});
