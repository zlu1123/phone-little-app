// pages/device-form/device-form.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  BUSINESS_CONSTANTS
} = require('../../config');
const MONTHS_THRESHOLD = BUSINESS_CONSTANTS.OLD_PHONE_USAGE_MONTHS_THRESHOLD;
const IMEI_REQUIRED_BRANDS = BUSINESS_CONSTANTS.IMEI_REQUIRED_BRANDS;
const DEFAULT_PHONE_BRANDS = BUSINESS_CONSTANTS.DEFAULT_PHONE_BRANDS;
const { checkCanPlaceOrder } = require('../../utils/auth');
const { request } = require('../../utils/request');

Page({
  data: {
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    isDamaged: false,
    oldPhoneStatus: null,
    oldPhoneUsageMonths: null,

    // 手机类型选择
    showModelPicker: false,
    selectedModelName: '',
    typeCode: '',
    modelOptions: [],
    isFetchingModel: true,

    // 手动输入
    modelName: '',
    imei: '',
    sn: '',

    // 加载态
    isSubmitting: false,

    // 亚丁 OA 弹窗
    showOAModal: false,

    // IMEI 必填标识（OPPO/VIVO）
    isImeiRequired: false
  },

  onLoad(options) {
    const { leaveInfoId, leaveName, leavePhoneNum, isDamaged, oldPhoneStatus, oldPhoneUsageMonths } = options;
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
      leavePhoneNum: phone,
      isDamaged: isDamaged === '1',
      oldPhoneStatus: oldPhoneStatus != null ? Number(oldPhoneStatus) : null,
      oldPhoneUsageMonths: oldPhoneUsageMonths != null ? Number(oldPhoneUsageMonths) : null
    });
    this.fetchPhoneTypeList();
  },

  async fetchPhoneTypeList() {
    if (this.data.modelOptions.length > 0) {
      this.setData({ isFetchingModel: false });
      return;
    }
    this.setData({ isFetchingModel: true });
    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryPhoneTypeList),
        method: 'GET'
      });
      const data = res.data;
      if (data.code === 200 && Array.isArray(data.data) && data.data.length > 0) {
        const options = data.data.map(item => ({ name: item.name, value: item.code }));
        this.setData({ modelOptions: options });
      } else {
        this.setData({ modelOptions: DEFAULT_PHONE_BRANDS });
      }
    } catch (e) {
      this.setData({ modelOptions: DEFAULT_PHONE_BRANDS });
    } finally {
      this.setData({ isFetchingModel: false });
    }
  },

  showModelPicker() { this.setData({ showModelPicker: true }); },
  closeModelPicker() { this.setData({ showModelPicker: false }); },

  onSelectModel(e) {
    const { value: selected, index } = e.detail || {};
    const item = (selected && typeof selected === 'object') ? selected : (this.data.modelOptions[index] || {});
    if (!item || !item.value) { this.setData({ showModelPicker: false }); return; }
    this.setData({
      selectedModelName: item.name,
      typeCode: item.value,
      showModelPicker: false,
      isImeiRequired: IMEI_REQUIRED_BRANDS.includes(item.value)
    });
  },

  onModelNameInput(e) { this.setData({ modelName: e.detail }); },
  onImeiInput(e) { this.setData({ imei: e.detail }); },
  onSnInput(e) { this.setData({ sn: e.detail }); },

  async handleSubmit() {
    const { typeCode, imei, sn, oldPhoneStatus, oldPhoneUsageMonths } = this.data;
    if (!typeCode) { wx.showToast({ title: '请选择手机类型', icon: 'none' }); return; }
    const code = IMEI_REQUIRED_BRANDS.includes(typeCode) ? imei : (sn || imei);
    if (!code) { wx.showToast({ title: '请输入IMEI或SN', icon: 'none' }); return; }
    // OPPO/VIVO 必须使用 IMEI
    if (IMEI_REQUIRED_BRANDS.includes(typeCode) && !imei) {
      wx.showToast({ title: '该品牌必须输入IMEI', icon: 'none' });
      return;
    }

    // 检查是否允许下单
    if (!checkCanPlaceOrder()) return;

    const infoId = this.data.leaveInfoId;
    if (!infoId) {
      wx.showToast({ title: '缺少留资信息，请重新登记', icon: 'none' });
      wx.switchTab({ url: '/pages/imei-query/imei-query' });
      return;
    }

    this.setData({ isSubmitting: true });
    try {
      const queryParts = [`typeCode=${encodeURIComponent(typeCode)}`, `code=${encodeURIComponent(code)}`, `infoId=${encodeURIComponent(infoId)}`, 'skipApiCall=true'];
      if (imei) queryParts.push(`imei=${encodeURIComponent(imei)}`);
      if (oldPhoneStatus != null) queryParts.push(`oldPhoneStatus=${oldPhoneStatus}`);
      if (oldPhoneUsageMonths != null) queryParts.push(`oldPhoneUsageMonths=${oldPhoneUsageMonths}`);

      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryActiveInfo) + '?' + queryParts.join('&'),
        method: 'POST'
      });
      const data = res.data;
      if (data.code === 200) {
        const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) ? data.data : data;

        // Scene 3.1: oldPhoneUsageMonths >= 阈值 → 亚丁
        const returnedMonths = resultData.oldPhoneUsageMonths;
        if (returnedMonths != null && returnedMonths >= MONTHS_THRESHOLD) {
          this.setData({ isSubmitting: false, showOAModal: true });
          return;
        }

        const orderId = resultData.id || data.data;
        if (!orderId) { wx.showToast({ title: '订单信息缺失，请重试', icon: 'none' }); return; }

        const phoneModel = this.data.modelName || this.data.selectedModelName || '';
        wx.navigateTo({
          url: `/pages/contract-sign/contract-sign?orderId=${encodeURIComponent(String(orderId))}&imei=${encodeURIComponent(imei || '')}&sn=${encodeURIComponent(sn || '')}&phoneModel=${encodeURIComponent(phoneModel)}&skipDeviceInfo=true`
        });
      } else {
        wx.showToast({ title: data.msg || '操作失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  handleCloseOAModal() { this.setData({ showOAModal: false }); },
  handleNoop() { },

  handleBack() { wx.navigateBack(); }
});
