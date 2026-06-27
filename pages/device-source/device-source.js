// pages/device-source/device-source.js
const { API_ENDPOINTS, buildApiUrl } = require('../../config');
const { request, handleUnauthorized } = require('../../utils/request');

Page({
  data: {
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    isSubmitting: false
  },

  onLoad(options) {
    const { leaveInfoId, leaveName, leavePhoneNum } = options;
    this.setData({
      leaveInfoId: leaveInfoId || '',
      leaveName: decodeURIComponent(leaveName || ''),
      leavePhoneNum: leavePhoneNum || ''
    });
  },

  onShow() {
    // 登录状态检查
    if (this.checkLoginStatus()) return;
  },

  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    if (!token) {
      handleUnauthorized();
      return true;
    }
    return false;
  },

  // 返回留资页面
  handleBack() {
    wx.navigateBack();
  },

  // 返回留资页面（重新登记）
  handleBackToLeaveInfo() {
    wx.showModal({
      title: '重新登记',
      content: '确定要重新登记用户信息吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  // 选择设备来源
  handleSelectDeviceSource(e) {
    const { source } = e.currentTarget.dataset;
    const { leaveInfoId, leaveName, leavePhoneNum } = this.data;
    const name = encodeURIComponent(leaveName);
    const phone = leavePhoneNum;

    if (source === 'has_old') {
      // 有旧手机（正常）→ OCR 查询页
      wx.navigateTo({
        url: `/pages/device-ocr/device-ocr?leaveInfoId=${leaveInfoId}&leaveName=${name}&leavePhoneNum=${phone}`
      });
    } else if (source === 'has_old_damaged') {
      // 有旧手机但损坏/遗失 → 使用时长页
      wx.navigateTo({
        url: `/pages/usage-duration/usage-duration?leaveInfoId=${leaveInfoId}&leaveName=${name}&leavePhoneNum=${phone}&oldPhoneStatus=1`
      });
    } else if (source === 'no_old') {
      // 无旧手机：调 API 生成订单 → 直接跳签约页
      this.submitNoOldPhone(leaveInfoId, name, phone);
    }
  },

  async submitNoOldPhone(leaveInfoId, name, phone) {
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '生成订单中...' });
    try {
      const params = `infoId=${leaveInfoId}&skipApiCall=true&oldPhoneStatus=0`;
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryActiveInfo) + '?' + params,
        method: 'POST'
      });
      const data = res.data;
      if (data.code === 200) {
        const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) ? data.data : data;
        const orderId = resultData.id || data.data;
        if (!orderId) { wx.showToast({ title: '订单信息缺失，请重试', icon: 'none' }); return; }
        wx.navigateTo({
          url: `/pages/contract-sign/contract-sign?orderId=${encodeURIComponent(String(orderId))}`
        });
      } else {
        wx.showToast({ title: data.msg || '操作失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSubmitting: false });
    }
  }
});
