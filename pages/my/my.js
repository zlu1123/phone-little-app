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
      navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height;
    }

    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      navBarHeight: navBarHeight || 44
    });
  },

  onShow() {
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const isLoggedIn = wx.getStorageSync('isLoggedIn') || false;
    const isGuest = wx.getStorageSync('isGuest') || false;
    const userInfo = wx.getStorageSync('userInfo') || {
      nickName: '微信用户',
      avatarUrl: ''
    };

    this.setData({
      isLoggedIn,
      isGuest,
      userInfo
    });

    // 如果未登录且不是游客模式，跳转到登录页
    if (!isLoggedIn && !isGuest) {
      wx.navigateTo({
        url: '/pages/login/login'
      });
    }
  },

  // 处理点击头像区域
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

          // 跳转到登录页
          wx.navigateTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});
