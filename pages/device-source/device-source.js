// pages/device-source/device-source.js
const { API_ENDPOINTS, buildApiUrl, SPECIAL_NEW_PHONE_MODELS } = require('../../config');
const { checkCanPlaceOrder } = require('../../utils/auth');
const { request, handleUnauthorized } = require('../../utils/request');

Page({
  data: {
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    isSubmitting: false,
    // 特殊新机机型（来自 config.js，后期在此维护）
    specialModels: Array.isArray(SPECIAL_NEW_PHONE_MODELS) ? SPECIAL_NEW_PHONE_MODELS : [],
    // 机型选择弹层
    showModelPicker: false
  },

  onLoad(options) {
    const { leaveInfoId, leaveName, leavePhoneNum } = options;
    const name = decodeURIComponent(leaveName || '');
    const phone = leavePhoneNum || '';
    if (!name && !phone) {
      wx.showToast({ title: '请先登记用户信息', icon: 'none', duration: 1500 });
      wx.switchTab({ url: '/pages/imei-query/imei-query' });
      return;
    }
    this.setData({
      leaveInfoId: leaveInfoId || '',
      leaveName: name,
      leavePhoneNum: phone
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
    // 检查是否允许下单
    if (!checkCanPlaceOrder()) return;

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

  // 新机对接亚丁：弹框选择机型
  handleOpenModelPicker() {
    if (!checkCanPlaceOrder()) return;
    if (!this.data.specialModels.length) {
      wx.showToast({ title: '暂无可选新机机型', icon: 'none' });
      return;
    }
    this.setData({ showModelPicker: true });
  },

  // 关闭机型选择弹层
  handleCloseModelPicker() {
    this.setData({ showModelPicker: false });
  },

  // 选择机型
  handlePickModel(e) {
    const { model } = e.currentTarget.dataset;
    const item = this.data.specialModels.find((m) => m.model === model);
    this.setData({ showModelPicker: false });
    if (item) this.confirmNewPhoneModel(item);
  },

  // 强制确认机型 → 建单 → 进入签约（手机型号自动带入、可修改），签约后走亚丁流程
  confirmNewPhoneModel(item) {
    wx.showModal({
      title: '请确认新机机型',
      content: `您选择的是「${item.title || item.model}」，请确认新机机型为 ${item.model}。`,
      confirmText: '确认无误',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        const { leaveInfoId, leaveName, leavePhoneNum } = this.data;
        this.submitNoOldPhone(leaveInfoId, encodeURIComponent(leaveName), leavePhoneNum, {
          redirectToYaDing: true,
          phoneModel: item.model,
          channel: item.channel
        });
      }
    });
  },

  // 阻止弹层内部点击/滑动冒泡
  handleNoop() {},

  async submitNoOldPhone(leaveInfoId, name, phone, options = {}) {
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '生成订单中...' });
    try {
      let params = `infoId=${leaveInfoId}&skipApiCall=true&oldPhoneStatus=0`;
      if (options.channel) params += `&channel=${encodeURIComponent(options.channel)}`;
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryActiveInfo) + '?' + params,
        method: 'POST'
      });
      const data = res.data;
      if (data.code === 200) {
        const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) ? data.data : data;
        const orderId = resultData.id || data.data;
        if (!orderId) { wx.showToast({ title: '订单信息缺失，请重试', icon: 'none' }); return; }
        // 进入签约：redirectToYaDing 让签约成功页出现「前往亚丁屏卫」，phoneModel 预填新机型号（可修改）
        const signParams = [`orderId=${encodeURIComponent(String(orderId))}`];
        if (options.redirectToYaDing) signParams.push('redirectToYaDing=true');
        if (options.phoneModel) signParams.push(`phoneModel=${encodeURIComponent(options.phoneModel)}`);
        wx.navigateTo({
          url: `/pages/contract-sign/contract-sign?${signParams.join('&')}`
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
