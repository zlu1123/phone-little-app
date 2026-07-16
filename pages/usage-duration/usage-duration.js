// pages/usage-duration/usage-duration.js
const { API_ENDPOINTS, buildApiUrl, BUSINESS_CONSTANTS } = require('../../config');
const { checkCanPlaceOrder } = require('../../utils/auth');
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
    // 检查是否允许下单
    if (!checkCanPlaceOrder()) return;

    const { choice } = e.currentTarget.dataset;
    const oldPhoneStatus = this.data.oldPhoneStatus;
    const usageMonths = choice === 'over24' ? MONTHS_THRESHOLD : 0;

    if (choice === 'over24') {
      // 大于阈值：调 API 生成订单，跳签协议页面
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
    } else {
      // ≤阈值：调 API 生成订单，跳签协议页面并支持跳转亚丁
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
            url: `/pages/contract-sign/contract-sign?orderId=${encodeURIComponent(String(orderId))}&redirectToYaDing=true`
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
