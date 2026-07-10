// pages/imei-query/imei-query.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  getApiBase
} = require('../../config');
const { request, get, handleUnauthorized } = require('../../utils/request');

Page({
  data: {
    // 权限控制
    hasWechatRole: true,
    isCheckingPermission: true,

    // 当前用户店面信息
    storeName: '',

    // 留资状态
    leaveInfoCompleted: false,
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    leaveSearchContext: '',
    leaveUserList: [],
    isLeaveSearching: false,
    isLeaveSubmitting: false,
    showLeaveForm: true
  },

  onLoad() {
    this.setData({
      leaveInfoCompleted: false,
      leaveInfoId: '',
      leaveName: '',
      leavePhoneNum: '',
      leaveSearchContext: '',
      leaveUserList: [],
      showLeaveForm: true
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
    this.checkPermission();
  },

  // 检查是否有 wechat 角色权限访问首页
  checkPermission() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const roles = userInfo.roles || [];
    const hasWechatRole = Array.isArray(roles) && roles.includes('wechat');
    const storeName = userInfo.storeName || '';

    this.setData({
      hasWechatRole,
      storeName,
      isCheckingPermission: false
    });

    // 如果没有 wechat 角色，给出提示
    if (!hasWechatRole) {
      wx.showToast({
        title: '您暂无访问权限',
        icon: 'none',
        duration: 2000
      });
    }
  },

  handleToggleLeaveMode() {
    const showForm = !this.data.showLeaveForm;
    const update = { showLeaveForm: showForm };
    // 切换到手动新增模式时，清空之前通过搜索选择带入的数据，确保表单干净
    if (showForm) {
      update.leaveName = '';
      update.leavePhoneNum = '';
    }
    this.setData(update);
  },

  handleLeaveNameChange(e) {
    this.setData({ leaveName: e.detail });
  },

  handleLeavePhoneNumChange(e) {
    this.setData({ leavePhoneNum: e.detail });
  },

  handleLeaveSearchChange(e) {
    this.setData({ leaveSearchContext: e.detail });
  },

  async handleLeaveSearch() {
    const context = this.data.leaveSearchContext.trim();
    if (!context) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    this.setData({ isLeaveSearching: true, leaveUserList: [] });

    try {
      const res = await get(API_ENDPOINTS.getLeaveInformationList, { context });

      const data = res.data;
      if (data.code === 200 && Array.isArray(data.rows)) {
        this.setData({ leaveUserList: data.rows });
      } else {
        this.setData({ leaveUserList: [] });
        if (data.rows && data.rows.length === 0) {
          // no results, that's ok
        } else {
          wx.showToast({ title: data.msg || '搜索失败', icon: 'none' });
        }
      }
    } catch (error) {
      console.error('搜索用户失败:', error);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ isLeaveSearching: false });
    }
  },

  handleSelectLeaveUser(e) {
    const { index } = e.currentTarget.dataset;
    const user = this.data.leaveUserList[index];
    if (!user) return;

    const id = user.id || '';
    const name = user.name || '';
    const phoneNum = user.phoneNum || '';

    this.setData({
      leaveInfoCompleted: true,
      leaveInfoId: id,
      leaveName: name,
      leavePhoneNum: phoneNum,
      leaveSearchContext: '',
      leaveUserList: []
    });

    wx.showToast({ title: '已选择用户', icon: 'success' });
    this.navigateToDeviceSource();
  },

  async handleLeaveInfoSubmit() {
    const name = this.data.leaveName.trim();
    const phoneNum = this.data.leavePhoneNum.trim();

    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return; }
    if (!phoneNum) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phoneNum)) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }

    this.setData({ isLeaveSubmitting: true });

    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.insertLeaveInformation),
        method: 'POST',
        data: { name, phoneNum }
      });

      const data = res.data;
      if (data.code === 200) {
        const userId = data.data != null ? String(data.data) : '';
        this.setData({
          leaveInfoCompleted: true,
          leaveInfoId: userId,
          leaveName: name,
          leavePhoneNum: phoneNum
        });
        wx.showToast({ title: '登记成功', icon: 'success' });
        this.navigateToDeviceSource();
      } else {
        wx.showToast({ title: data.msg || '提交失败', icon: 'none' });
      }
    } catch (error) {
      console.error('提交留资信息失败:', error);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ isLeaveSubmitting: false });
    }
  },

  navigateToDeviceSource() {
    const name = encodeURIComponent(this.data.leaveName);
    wx.navigateTo({
      url: `/pages/device-source/device-source?leaveInfoId=${this.data.leaveInfoId}&leaveName=${name}&leavePhoneNum=${this.data.leavePhoneNum}`
    });
  }
});
