// pages/usage-duration/usage-duration.js
const { API_ENDPOINTS, buildApiUrl, BUSINESS_CONSTANTS } = require('../../config');
const { request } = require('../../utils/request');
const MONTHS_THRESHOLD = BUSINESS_CONSTANTS.OLD_PHONE_USAGE_MONTHS_THRESHOLD;

Page({
  data: {
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    oldPhoneStatus: '',
    isSubmitting: false,
    showOAModal: false
  },

  onLoad(options) {
    const { leaveInfoId, leaveName, leavePhoneNum, oldPhoneStatus } = options;
    this.setData({
      leaveInfoId: leaveInfoId || '',
      leaveName: decodeURIComponent(leaveName || ''),
      leavePhoneNum: leavePhoneNum || '',
      oldPhoneStatus: oldPhoneStatus || ''
    });
  },

  async handleChoice(e) {
    const { choice } = e.currentTarget.dataset;
    const oldPhoneStatus = this.data.oldPhoneStatus;
    const usageMonths = choice === 'over24' ? MONTHS_THRESHOLD : 0;

    if (choice === 'over24') {
      // 大于阈值：直接调 API 生成订单，然后弹亚丁弹窗
      this.setData({ isSubmitting: true });
      try {
        const params = [
          `infoId=${this.data.leaveInfoId}`,
          'skipApiCall=true',
          `oldPhoneStatus=${oldPhoneStatus}`,
          `oldPhoneUsageMonths=${usageMonths}`
        ].join('&');
        const res = await request({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo) + '?' + params,
          method: 'POST'
        });
        const data = res.data;
        if (data.code === 200) {
          this.setData({ showOAModal: true });
        } else {
          wx.showToast({ title: data.msg || '操作失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      } finally {
        this.setData({ isSubmitting: false });
      }
    } else {
      // ≤阈值：调 API 生成订单，直接跳签协议页面（协议→填新手机信息→签名）
      this.setData({ isSubmitting: true });
      try {
        const params = [
          `infoId=${this.data.leaveInfoId}`,
          'skipApiCall=true',
          `oldPhoneStatus=${oldPhoneStatus}`,
          `oldPhoneUsageMonths=${usageMonths}`
        ].join('&');
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
        this.setData({ isSubmitting: false });
      }
    }
  },

  handleCloseOAModal() { this.setData({ showOAModal: false }); },
  handleNoop() { },

  handleBack() { wx.navigateBack(); }
});
