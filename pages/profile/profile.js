Page({
  data: {
    statusBarHeight: 0,
    roleDisplay: '无',
    userInfo: {
      nickName: '微信用户',
      avatarUrl: '',
      phone: '',
      userName: '',
      userId: '',
      roles: [],
      storeName: '',
      storeId: ''
    }
  },

  // 角色名称映射表
  roleMap: {
    wechat: '小程序',
    admin: '管理员',
    user: '普通用户'
  },

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20
    });

    // 从缓存读取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 映射角色显示名称
      const roleName = (userInfo.roles && userInfo.roles[0]) || '';
      const roleDisplay = this.roleMap[roleName] || roleName || '无';
      this.setData({ userInfo, roleDisplay });
    }
  },

  // 返回上一页
  handleBack() {
    wx.navigateBack();
  }
});
