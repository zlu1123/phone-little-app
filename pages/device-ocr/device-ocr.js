// pages/device-ocr/device-ocr.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  getApiBase,
  isWechatOcrEnabled
} = require('../../config');
const { parseDateTime } = require('../../utils/date');
const { request, uploadFile, handleUnauthorized } = require('../../utils/request');

Page({
  data: {
    activeStep: 0,
    steps: [{ text: '上传识别' }, { text: '确认信息' }, { text: '查询结果' }],

    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',

    isRecognizing: false,
    pictureList: [],
    isQuerying: false,
    queryResult: null,

    formData: {
      typeCode: '1',
      sn: '',
      imei: '',
      imei2: ''
    },

    showModelPicker: false,
    selectedModelName: '',
    modelOptions: [],
    isFetchingModel: true,

    showOAModal: false,
    signedContractInfo: null,
    apiBase: ''
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
    this.setData({ apiBase: getApiBase() });
    if (this.checkLoginStatus()) return;
    this.fetchPhoneTypeList();
  },

  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    if (!token) {
      handleUnauthorized();
      return true;
    }
    return false;
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
        const modelOptions = data.data.map(item => ({
          name: item.name,
          value: item.code
        }));
        this.setData({
          modelOptions,
          selectedModelName: modelOptions[0].name,
          'formData.typeCode': modelOptions[0].value
        });
      } else {
        this.setFallbackModelOptions();
      }
    } catch (error) {
      this.setFallbackModelOptions();
    } finally {
      this.setData({ isFetchingModel: false });
    }
  },

  setFallbackModelOptions() {
    const fallbackOptions = [
      { name: '苹果', value: '1' },
      { name: '小米/红米', value: '2' },
      { name: '华为/荣耀', value: '3' }
    ];
    this.setData({
      modelOptions: fallbackOptions,
      selectedModelName: fallbackOptions[0].name,
      'formData.typeCode': fallbackOptions[0].value
    });
  },

  onDelete() {
    this.setData({
      pictureList: [],
      activeStep: 0,
      queryResult: null,
      formData: {
        typeCode: this.data.formData.typeCode || '1',
        sn: '',
        imei: '',
        imei2: ''
      }
    });
  },

  afterRead(e) {
    const { file } = e.detail;
    const pictureList = this.data.pictureList;
    if (!this.data.formData.typeCode) {
      wx.showToast({ title: '请先选择手机型号', icon: 'none' });
      return;
    }
    if (pictureList.length >= 1) {
      wx.showToast({ title: '只能上传一张图片', icon: 'none' });
      return;
    }
    pictureList.push({ url: file.url, path: file.path });
    this.setData({ pictureList });
    this.startOCR(file);
  },

  async startOCR(file) {
    this.setData({
      activeStep: 0,
      queryResult: null,
      formData: {
        typeCode: this.data.formData.typeCode || '1',
        sn: '',
        imei: '',
        imei2: ''
      },
      isRecognizing: true
    });
    wx.showLoading({ title: '正在识别...', mask: true });
    try {
      if (isWechatOcrEnabled()) {
        const wechatOCRResult = await this.tryWechatOCR(file);
        if (wechatOCRResult.success) {
          this.parseOCRResultToForm(wechatOCRResult.text);
          this.handleOCRSuccess();
          return;
        }
      }
      const backendOCRResult = await this.tryBackendOCR(file);
      if (backendOCRResult.success) {
        this.parseOCRResultToForm(backendOCRResult.text);
        this.handleOCRSuccess();
        return;
      }
      this.setData({ isRecognizing: false });
      wx.showToast({ title: 'OCR识别失败，请重试或手动输入', icon: 'none', duration: 2000 });
    } catch (error) {
      this.setData({ isRecognizing: false });
      wx.showToast({ title: error.message || 'OCR识别失败', icon: 'none', duration: 2000 });
    } finally {
      wx.hideLoading();
    }
  },

  isExternalUrl(url) {
    return /^https?:\/\//i.test(url) && !/^https?:\/\/(tmp|usr|store|wxfile)\//i.test(url);
  },

  downloadImageToTempFile(url) {
    return new Promise((resolve, reject) => {
      const extMatch = url.match(/\.(jpe?g|png|gif|bmp|webp)(\?|#|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
      const filePath = `${wx.env.USER_DATA_PATH}/download_${Date.now()}.${ext}`;
      wx.downloadFile({
        url,
        filePath,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
            resolve(res.tempFilePath);
            return;
          }
          reject(new Error(`下载图片失败，状态码：${res.statusCode}`));
        },
        fail(err) {
          reject(new Error(err.errMsg || '下载网络图片失败'));
        }
      });
    });
  },

  async tryWechatOCR(file) {
    try {
      if (!wx.serviceMarket || !wx.serviceMarket.invokeService) {
        throw new Error('服务市场API不可用');
      }
      const originalFilePath = file?.path || file?.tempFilePath || file?.url || file;
      if (!originalFilePath) throw new Error('未获取到可识别的图片路径');

      const localFilePath = this.isExternalUrl(originalFilePath)
        ? await this.downloadImageToTempFile(originalFilePath)
        : originalFilePath;

      const res = await wx.serviceMarket.invokeService({
        service: 'wx79ac3de8be320b71',
        api: 'OcrAllInOne',
        data: {
          img_url: new wx.serviceMarket.CDN({ type: 'filePath', filePath: localFilePath }),
          data_type: 3,
          ocr_type: 8
        }
      });

      const result = res.data || res.result || res;
      let text = '';
      if (result && result.ocr_comm_res && result.ocr_comm_res.items) {
        text = result.ocr_comm_res.items.map(item => item.text || item.content).filter(Boolean).join('\n');
      } else if (result && result.items) {
        text = result.items.map(item => item.text || item.content).filter(Boolean).join('\n');
      } else if (result && result.text) {
        text = result.text;
      } else if (typeof result === 'string') {
        text = result;
      } else {
        text = this.extractTextFromResult(result);
      }
      if (!text || text.length < 5) throw new Error('未识别到有效文字');
      return { success: true, text };
    } catch (error) {
      const errMsg = error.errMsg || error.message || String(error);
      const errCode = error.errCode || '';
      if (errMsg.includes('9301010') || errCode === 9301010) {
        return { success: false, error: 'OCR服务未开通或余额不足，请在微信公众平台-服务市场购买' };
      }
      return { success: false, error: errMsg };
    }
  },

  extractTextFromResult(result) {
    if (!result) return '';
    const texts = [];
    const extract = obj => {
      if (typeof obj === 'string') { texts.push(obj); return; }
      if (Array.isArray(obj)) { obj.forEach(extract); return; }
      if (typeof obj === 'object' && obj !== null) {
        if (obj.text) texts.push(obj.text);
        if (obj.content) texts.push(obj.content);
        Object.values(obj).forEach(extract);
      }
    };
    extract(result);
    return texts.join('\n');
  },

  async tryBackendOCR(file) {
    try {
      const originalFilePath = file?.path || file?.tempFilePath || file?.url || file;
      if (!originalFilePath) throw new Error('未获取到图片路径');
      const localFilePath = this.isExternalUrl(originalFilePath)
        ? await this.downloadImageToTempFile(originalFilePath)
        : originalFilePath;

      return new Promise(resolve => {
        uploadFile({
          url: buildApiUrl(API_ENDPOINTS.ocrImageCheck),
          filePath: localFilePath,
          name: 'file',
          formData: { typeCode: this.data.formData.typeCode || '1' },
          success: res => {
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(res.data);
                let text = '';
                if (data.data && typeof data.data === 'string') text = data.data;
                else if (data.text) text = data.text;
                else text = this.extractTextFromResult(data);
                if (!text || text.length < 5) { resolve({ success: false, error: '后端接口未返回有效文字' }); }
                else { resolve({ success: true, text }); }
              } catch (e) { resolve({ success: true, text: res.data }); }
            } else {
              let errorMsg = `请求失败，状态码：${res.statusCode}`;
              try {
                if (res.data && typeof res.data === 'string') {
                  const parsed = JSON.parse(res.data);
                  errorMsg = parsed.desc || parsed.message || parsed.status || errorMsg;
                }
              } catch (e) { }
              resolve({ success: false, error: errorMsg });
            }
          },
          fail: err => { resolve({ success: false, error: err.errMsg || '网络请求失败' }); }
        });
      });
    } catch (error) { return { success: false, error: error.message }; }
  },

  handleOCRSuccess() {
    this.setData({ activeStep: 1, isRecognizing: false });
    wx.showToast({ title: '识别完成', icon: 'success', duration: 1500 });
  },

  parseOCRResultToForm(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const formData = { ...this.data.formData };
    const snLabelRegex = /(?:^|[^A-Z])(?:SN|S\/N|Serial(?:\s+(?:No\.?|Number))?|序列号)[\s:：]*([A-Z0-9]{8,20})/i;
    const snPureRegex = /\b([A-Z0-9]{8,20})\b/;
    const imei1LabelRegex = /IMEI(?:1)?[\s:：]*(\d{15})/i;
    const imei2LabelRegex = /IMEI2[\s:：]*(\d{15})/i;
    const imeiPureRegex = /\b(\d{15})\b/;

    let foundImei1 = '', foundImei2 = '', foundSn = false;

    lines.forEach(line => {
      if (!formData.sn) {
        const snLabelMatch = line.match(snLabelRegex);
        if (snLabelMatch) { formData.sn = snLabelMatch[1]; foundSn = true; }
      }
      if (!foundImei2) {
        const imei2Match = line.match(imei2LabelRegex);
        if (imei2Match) { foundImei2 = imei2Match[1]; return; }
      }
      if (!foundImei1) {
        const imei1Match = line.match(imei1LabelRegex);
        if (imei1Match) foundImei1 = imei1Match[1];
      }
    });

    if (!foundImei1 && !foundImei2) {
      const pureImeis = [];
      lines.forEach(line => {
        const imeiMatch = line.match(imeiPureRegex);
        if (imeiMatch && !pureImeis.includes(imeiMatch[1])) pureImeis.push(imeiMatch[1]);
      });
      if (pureImeis.length > 0) foundImei1 = pureImeis[0];
      if (pureImeis.length > 1) foundImei2 = pureImeis[1];
    }

    if (!foundSn && !formData.sn) {
      for (const line of lines) {
        const snMatch = line.match(snPureRegex);
        if (snMatch && !/^\d+$/.test(snMatch[1]) && snMatch[1] !== foundImei1 && snMatch[1] !== foundImei2) {
          formData.sn = snMatch[1];
          break;
        }
      }
    }
    if (foundImei1) formData.imei = foundImei1;
    if (foundImei2) formData.imei2 = foundImei2;
    this.setData({ formData });
  },

  onSnChange(e) { this.setData({ 'formData.sn': e.detail }); },
  onImeiChange(e) { this.setData({ 'formData.imei': e.detail }); },
  onImei2Change(e) { this.setData({ 'formData.imei2': e.detail }); },

  onShowModelPicker() { this.setData({ showModelPicker: true }); },
  onCloseModelPicker() { this.setData({ showModelPicker: false }); },

  onSelectModel(e) {
    const { value: selected, index } = e.detail || {};
    const item = (selected && typeof selected === 'object') ? selected : (this.data.modelOptions[index] || {});
    if (!item || !item.value) { this.setData({ showModelPicker: false }); return; }
    this.setData({
      selectedModelName: item.name,
      'formData.typeCode': item.value,
      showModelPicker: false
    });
  },

  async handleQuery() {
    const { sn, imei, typeCode } = this.data.formData;
    if (!sn && !imei) { wx.showToast({ title: '请输入序列号或IMEI', icon: 'none' }); return; }
    const imageUrl = this.data.pictureList.length > 0 ? (this.data.pictureList[0].path || this.data.pictureList[0].url) : '';
    this.setData({ isQuerying: true });
    try {
      const formData = { typeCode, code: sn || imei };
      const infoId = this.data.leaveInfoId;
      if (infoId) formData.infoId = infoId;
      if (imei) formData.imei = imei;
      let data;
      if (imageUrl) {
        const localFilePath = this.isExternalUrl(imageUrl) ? await this.downloadImageToTempFile(imageUrl) : imageUrl;
        const res = await uploadFile({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo),
          filePath: localFilePath, name: 'img', formData
        });
        data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } else {
        const queryParts = [`typeCode=${encodeURIComponent(formData.typeCode || '')}`, `code=${encodeURIComponent(formData.code || '')}`];
        if (formData.infoId) queryParts.push(`infoId=${encodeURIComponent(formData.infoId)}`);
        if (formData.imei) queryParts.push(`imei=${encodeURIComponent(formData.imei)}`);
        const res = await request({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo) + '?' + queryParts.join('&'),
          method: 'POST'
        });
        data = res.data;
      }
      const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) ? data.data : data;
      if (data.code === 200) {
        const coverageDate = resultData.coverage;
        let isExpired = false, warrantyStatus = '未知';
        if (resultData.activated) {
          if (coverageDate) {
            const coverageTime = parseDateTime(coverageDate);
            const sysTime = resultData.sysTime ? parseDateTime(resultData.sysTime) : Date.now();
            if (Number.isNaN(coverageTime) || Number.isNaN(sysTime)) {
              isExpired = false; warrantyStatus = '保修中';
            } else {
              isExpired = coverageTime <= sysTime;
              warrantyStatus = isExpired ? '已过保' : '保修中';
            }
          } else { warrantyStatus = '已激活'; }
        } else { warrantyStatus = '未激活'; isExpired = true; }
        const queryResultData = {
          id: resultData.id || '',
          productName: resultData.model || '未知设备',
          activationDate: resultData.activateDate || '未知',
          coverageDate: coverageDate || '未知',
          isExpired, warrantyStatus,
          contractPath: resultData.contractPath || '',
          signaturePath: resultData.signaturePath || '',
          contractName: resultData.contractName || '',
          contractVersion: resultData.contractVersion || ''
        };
        this.setData({ queryResult: queryResultData, activeStep: 2, isQuerying: false });
        wx.showToast({ title: '查询成功', icon: 'success' });
      } else { throw new Error(data.msg || '查询失败'); }
    } catch (error) {
      this.setData({ isQuerying: false });
      wx.showToast({ title: error.message || '查询失败，请重试', icon: 'none' });
    }
  },

  handleReset() {
    const firstModel = this.data.modelOptions[0] || { name: '', value: '' };
    this.setData({
      activeStep: 0, pictureList: [], queryResult: null,
      formData: { typeCode: firstModel.value, sn: '', imei: '', imei2: '' },
      selectedModelName: firstModel.name, isRecognizing: false, isQuerying: false
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  handleJumpToOfficialAccount() {
    const { queryResult } = this.data;
    if (!queryResult || queryResult.isExpired) { wx.showToast({ title: '设备已过保，无法跳转', icon: 'none' }); return; }
    const orderId = queryResult.id;
    if (!orderId) { wx.showToast({ title: '订单信息缺失，请重新查询', icon: 'none' }); return; }
    // 跳转签约页，签约成功后自动弹出亚丁弹窗
    wx.navigateTo({ url: `/pages/contract-sign/contract-sign?orderId=${orderId}&redirectToYaDing=true` });
  },

  handleCloseOAModal() { this.setData({ showOAModal: false }); },
  handleNoop() { },

  handleShowContract() {
    const { queryResult } = this.data;
    if (!queryResult) { wx.showToast({ title: '请先完成查询', icon: 'none' }); return; }
    const orderId = queryResult.id;
    if (!orderId) { wx.showToast({ title: '订单信息缺失，请重新查询', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/contract-sign/contract-sign?orderId=' + orderId });
  },

  handleBackToDeviceSource() {
    wx.navigateBack();
  },

  checkOfficialAccountReturn() { }
});
