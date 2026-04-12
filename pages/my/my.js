Page({
  data: {
    userInfo: {
      nickName: '微信用户',
      avatarUrl: ''
    },
    statusBarHeight: 0,
    navBarHeight: 44,
    isLoggedIn: false,
    isGuest: false
  },

  onLoad() {
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
      avatarUrl: ''
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

    this.setData({
      isLoggedIn: isValidLogin,
      isGuest,
      userInfo:
        isValidLogin || isGuest
          ? userInfo
          : { nickName: '微信用户', avatarUrl: '' }
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
    }
  },

  handleUserInfo() {
    if (this.data.isLoggedIn) {
      // 已登录，可以编辑用户信息或其他操作
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
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
  }
});
