// pages/imei-query/imei-query.js
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
    // 步骤条状态
    activeStep: 0,
    steps: [{ text: '上传识别' }, { text: '确认信息' }, { text: '查询结果' }],

    // 留资状态
    leaveInfoCompleted: false,
    leaveInfoId: '',
    leaveName: '',
    leavePhoneNum: '',
    leaveSearchContext: '',
    leaveUserList: [],
    isLeaveSearching: false,
    isLeaveSubmitting: false,
    showLeaveForm: true,

    // OCR相关数据
    isRecognizing: false,
    pictureList: [],
    isQuerying: false,
    queryResult: null,

    // 表单数据
    formData: {
      typeCode: '1',
      sn: '',
      imei: '',
      imei2: ''
    },

    // 手机型号选择
    showModelPicker: false,
    selectedModelName: '',
    modelOptions: [],
    isFetchingModel: true,

    // 公众号引导弹窗
    showOAModal: false,

    // 已签署协议信息（查询后展示）
    signedContractInfo: null,    // { contractId, contractPath, contractName, contractVersion, signaturePath }

    // 设备来源选择（留资完成后展示）
    showDeviceSource: false,

    // 无旧手机信息表单
    showNoOldPhoneForm: false,
    noOldPhoneIsDamaged: false,  // 旧手机是否损坏/丢失

    // 无旧手机 - 手机型号选择
    noOldPhoneShowModelPicker: false,
    noOldPhoneSelectedModelName: '',
    noOldPhoneTypeCode: '',

    // 无旧手机 - 手动输入信息
    noOldPhoneModelName: '',     // 手动输入手机型号
    noOldPhoneImei: '',          // IMEI
    noOldPhoneSn: '',            // SN

    // 旧手机使用时长输入
    showOldPhoneUsageInput: false,
    oldPhoneUsageMonths: '',

    // 无旧手机操作加载态
    isNoOldPhoneLoading: false,

    // API 基础地址（供 WXML 拼接协议文件完整 URL）
    apiBase: ''
  },

  onLoad() {
    // 每次真正进入页面（非从系统API返回）时，重置留资状态
    this.setData({
      leaveInfoCompleted: false,
      leaveInfoId: '',
      leaveName: '',
      leavePhoneNum: '',
      leaveSearchContext: '',
      leaveUserList: [],
      showLeaveForm: true,
      showDeviceSource: false,
      showNoOldPhoneForm: false,
      showOldPhoneUsageInput: false,
      noOldPhoneIsDamaged: false,
      noOldPhoneTypeCode: '',
      noOldPhoneSelectedModelName: '',
      noOldPhoneModelName: '',
      noOldPhoneImei: '',
      noOldPhoneSn: '',
      oldPhoneUsageMonths: '',
      activeStep: 0,
      pictureList: [],
      queryResult: null,
      signedContractInfo: null,
      formData: {
        typeCode: '1',
        sn: '',
        imei: '',
        imei2: ''
      }
    });
  },

  onShow() {
    // 同步自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
    // 将 apiBase 写入 data，供 WXML 拼接协议文件 URL
    this.setData({ apiBase: getApiBase() });
    // 识别环境：develop=开发版 / trial=体验版 时显示调试入口
    this.detectDevEnv();
    // 如果未完成留资，则不继续后续逻辑（onShow 不再重置留资状态，只在 onLoad 中重置）
    if (!this.data.leaveInfoCompleted) return;
    // 登录状态检查：若已过期，由 handleUnauthorized 统一接管跳转，本次 onShow 直接返回，
    // 避免与请求拦截器(401)双重跳转，导致登录页被加载多次
    if (this.checkLoginStatus()) return;
    // 获取手机型号列表
    this.fetchPhoneTypeList();
    // 用户从公众号 webview 页面返回后，主动弹出兑底引导
    this.checkOfficialAccountReturn();
  },

  // 返回留资页面（重新登记） - 仅在留资已完成时显示入口使用
  handleBackToLeaveInfo() {
    wx.showModal({
      title: '重新登记',
      content: '确定要重新登记用户信息吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            leaveInfoCompleted: false,
            leaveInfoId: '',
            leaveName: '',
            leavePhoneNum: '',
            leaveSearchContext: '',
            leaveUserList: [],
            showLeaveForm: true,
            showDeviceSource: false,
            showNoOldPhoneForm: false,
            showOldPhoneUsageInput: false,
            noOldPhoneIsDamaged: false,
            noOldPhoneTypeCode: '',
            noOldPhoneSelectedModelName: '',
            noOldPhoneModelName: '',
            noOldPhoneImei: '',
            noOldPhoneSn: '',
            oldPhoneUsageMonths: '',
            activeStep: 0,
            pictureList: [],
            queryResult: null,
            formData: {
              typeCode: this.data.formData.typeCode || '1',
              sn: '',
              imei: '',
              imei2: ''
            }
          });
        }
      }
    });
  },

  // ========== 留资相关方法 ==========

  // 切换留资模式：手动新增 / 搜索选择
  handleToggleLeaveMode() {
    this.setData({
      showLeaveForm: !this.data.showLeaveForm,
      leaveSearchContext: '',
      leaveUserList: []
    });
  },

  // 姓名输入
  handleLeaveNameChange(e) {
    this.setData({ leaveName: e.detail });
  },

  // 手机号输入
  handleLeavePhoneNumChange(e) {
    this.setData({ leavePhoneNum: e.detail });
  },

  // 搜索关键词输入
  handleLeaveSearchChange(e) {
    this.setData({ leaveSearchContext: e.detail });
  },

  // 模糊查询用户列表
  async handleLeaveSearch(e) {
    // van-search 的 bind:search 事件 e.detail 为搜索值
    const searchValue = (e && e.detail) ? e.detail : '';
    const context = (searchValue || this.data.leaveSearchContext || '').trim();
    if (!context) {
      wx.showToast({ title: '请输入姓名或手机号', icon: 'none' });
      return;
    }
    // 同步输入框的值
    if (searchValue && searchValue !== this.data.leaveSearchContext) {
      this.setData({ leaveSearchContext: searchValue });
    }

    this.setData({ isLeaveSearching: true, leaveUserList: [] });

    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.getLeaveInformationList),
        method: 'GET',
        data: { context }
      });

      const data = res.data;
      console.log('搜索用户列表返回:', data);
      if (data.code === 200 && Array.isArray(data.rows)) {
        this.setData({ leaveUserList: data.rows });
        if (data.rows.length === 0) {
          wx.showToast({ title: '未找到匹配的用户', icon: 'none' });
        }
      } else {
        wx.showToast({ title: data.msg || '查询失败', icon: 'none' });
      }
    } catch (error) {
      console.error('查询用户列表失败:', error);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ isLeaveSearching: false });
    }
  },

  // 从搜索结果中选择用户
  handleSelectLeaveUser(e) {
    const { index } = e.currentTarget.dataset;
    const user = this.data.leaveUserList[index];
    if (!user) return;

    const id = user.id != null ? String(user.id) : '';
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

    // 继续后续登录检查和初始化逻辑
    this.afterLeaveInfoComplete();
  },

  // 新增用户信息
  async handleLeaveInfoSubmit() {
    const name = this.data.leaveName.trim();
    const phoneNum = this.data.leavePhoneNum.trim();

    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!phoneNum) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phoneNum)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    this.setData({ isLeaveSubmitting: true });

    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.insertLeaveInformation),
        method: 'POST',
        data: { name, phoneNum },
        header: { 'content-type': 'application/json' }
      });

      const data = res.data;
      if (data.code === 200) {
        // 接口返回 {"code":200,"data":11}，data 直接就是 ID 值
        const userId = data.data != null ? String(data.data) : '';

        this.setData({
          leaveInfoCompleted: true,
          leaveInfoId: userId,
          leaveName: name,
          leavePhoneNum: phoneNum
        });

        wx.showToast({ title: '登记成功', icon: 'success' });

        // 继续后续登录检查和初始化逻辑
        this.afterLeaveInfoComplete();
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

  // 留资完成后的后续初始化
  afterLeaveInfoComplete() {
    // 展示设备来源选择，让用户选择「有旧手机」或「无旧手机」
    this.setData({ showDeviceSource: true });
  },

  // ========== 设备来源选择相关方法 ==========

  // 选择设备来源：有旧手机 / 无旧手机
  handleSelectDeviceSource(e) {
    const { source } = e.currentTarget.dataset;
    if (source === 'has_old') {
      // 有旧手机：继续现有流程
      this.setData({ showDeviceSource: false });
      if (this.checkLoginStatus()) return;
      this.fetchPhoneTypeList();
      this.checkOfficialAccountReturn();
    } else if (source === 'no_old') {
      // 无旧手机：直接展示手机信息表单
      this.setData({
        showDeviceSource: false,
        showNoOldPhoneForm: true,
        noOldPhoneIsDamaged: false,
        noOldPhoneTypeCode: '',
        noOldPhoneSelectedModelName: '',
        noOldPhoneModelName: '',
        noOldPhoneImei: '',
        noOldPhoneSn: ''
      });
      this.fetchPhoneTypeListForNoOldPhone();
    }
  },

  // 返回设备来源选择（从手机信息表单返回）
  handleBackToNoOldPhoneScenario() {
    this.setData({ showNoOldPhoneForm: false, showDeviceSource: true });
  },

  // 返回手机信息表单（从使用时长输入返回）
  handleBackToNoOldPhoneForm() {
    this.setData({ showOldPhoneUsageInput: false, showNoOldPhoneForm: true });
  },

  // 加载手机型号列表（无旧手机表单用）
  async fetchPhoneTypeListForNoOldPhone() {
    if (this.data.modelOptions.length > 0) return;

    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryPhoneTypeList),
        method: 'GET'
      });
      const data = res.data;
      if (data.code === 200 && Array.isArray(data.rows) && data.rows.length > 0) {
        this.setData({
          modelOptions: data.rows.map(item => ({ name: item.name, value: item.code }))
        });
      } else {
        this.setFallbackModelOptions();
      }
    } catch (error) {
      console.error('获取手机型号列表异常:', error);
      this.setFallbackModelOptions();
    }
  },

  // ========== 无旧手机 - 手机型号选择器 ==========

  handleNoOldPhoneShowModelPicker() {
    this.setData({ noOldPhoneShowModelPicker: true });
  },

  handleNoOldPhoneCloseModelPicker() {
    this.setData({ noOldPhoneShowModelPicker: false });
  },

  handleNoOldPhoneSelectModel(e) {
    const { value: selected, index } = e.detail || {};
    const item = (selected && typeof selected === 'object')
      ? selected
      : (this.data.modelOptions[index] || {});

    if (!item || !item.value) {
      this.setData({ noOldPhoneShowModelPicker: false });
      return;
    }

    this.setData({
      noOldPhoneSelectedModelName: item.name,
      noOldPhoneTypeCode: item.value,
      noOldPhoneShowModelPicker: false
    });
  },

  // ========== 无旧手机 - 表单输入事件 ==========

  handleNoOldPhoneModelNameInput(e) {
    this.setData({ noOldPhoneModelName: e.detail });
  },

  handleNoOldPhoneImeiInput(e) {
    this.setData({ noOldPhoneImei: e.detail });
  },

  handleNoOldPhoneSnInput(e) {
    this.setData({ noOldPhoneSn: e.detail });
  },

  // ========== 无旧手机 - 损坏/丢失开关 ==========

  handleDamagedToggle(e) {
    this.setData({ noOldPhoneIsDamaged: e.detail });
  },

  // ========== 无旧手机 - 提交表单，生成订单 ==========

  async handleNoOldPhoneFormSubmit() {
    const { noOldPhoneTypeCode, noOldPhoneImei, noOldPhoneSn, noOldPhoneIsDamaged } = this.data;

    if (!noOldPhoneTypeCode) {
      wx.showToast({ title: '请选择手机类型', icon: 'none' });
      return;
    }
    const code = noOldPhoneSn || noOldPhoneImei;
    if (!code) {
      wx.showToast({ title: '请输入IMEI或SN', icon: 'none' });
      return;
    }

    // 如果勾选了「旧手机损坏/丢失」，需要先确认使用时长
    if (noOldPhoneIsDamaged) {
      this.setData({
        showNoOldPhoneForm: false,
        showOldPhoneUsageInput: true,
        oldPhoneUsageMonths: ''
      });
      return;
    }

    // 新增用户：直接生成订单
    this.doCreateOrderAndSign();
  },

  // 旧手机使用时长输入
  handleOldPhoneUsageInput(e) {
    this.setData({ oldPhoneUsageMonths: e.detail });
  },

  // 确认旧手机使用时长
  handleConfirmOldPhoneUsage() {
    const months = parseInt(this.data.oldPhoneUsageMonths, 10);
    if (isNaN(months) || months <= 0) {
      wx.showToast({ title: '请输入有效的使用月数', icon: 'none' });
      return;
    }

    if (months > 24) {
      // 大于24个月 → 跳转亚丁屏卫
      this.setData({ showOldPhoneUsageInput: false, showOAModal: true });
    } else {
      // 小于等于24个月 → 生成订单并签协议
      this.doCreateOrderAndSign();
    }
  },

  // 调用接口生成订单，获取 orderId 后跳转签协议页
  async doCreateOrderAndSign() {
    this.setData({
      isNoOldPhoneLoading: true,
      showOldPhoneUsageInput: false
    });

    try {
      const infoId = this.data.leaveInfoId;
      const { noOldPhoneTypeCode, noOldPhoneImei, noOldPhoneSn } = this.data;
      const code = noOldPhoneSn || noOldPhoneImei;

      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryActiveInfo),
        method: 'POST',
        data: {
          typeCode: noOldPhoneTypeCode,
          code: code,
          infoId: infoId,
          skipApiCall: true
        },
        header: { 'content-type': 'application/x-www-form-urlencoded' }
      });

      const data = res.data;
      if (data.code === 200) {
        const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
          ? data.data
          : data;
        const orderId = resultData.id || data.data;
        if (!orderId) {
          wx.showToast({ title: '订单信息缺失，请重试', icon: 'none' });
          return;
        }

        // 将已填写的设备信息传给签约页，避免重复填写
        const { noOldPhoneImei: passedImei, noOldPhoneSn: passedSn, noOldPhoneModelName, noOldPhoneSelectedModelName } = this.data;
        const phoneModel = noOldPhoneModelName || noOldPhoneSelectedModelName || '';
        const queryParts = [
          'orderId=' + encodeURIComponent(String(orderId)),
          'imei=' + encodeURIComponent(passedImei || ''),
          'sn=' + encodeURIComponent(passedSn || ''),
          'phoneModel=' + encodeURIComponent(phoneModel),
          'skipDeviceInfo=true'
        ];

        wx.navigateTo({
          url: '/pages/contract-sign/contract-sign?' + queryParts.join('&')
        });
      } else {
        wx.showToast({ title: data.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('生成订单失败:', error);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ isNoOldPhoneLoading: false });
    }
  },

  // 返回手机信息表单（从使用时长输入返回）
  handleBackToNoOldPhoneForm() {
    this.setData({
      showOldPhoneUsageInput: false,
      showNoOldPhoneForm: true
    });
  },

  // ========== 设备来源选择相关方法 END ==========

  // ========== 留资相关方法 END ==========

  // 检测是否为开发/体验环境，控制调试入口可见性
  detectDevEnv() {
    if (this.data.isDev) return;
    let isDev = false;
    try {
      const accountInfo = (typeof wx.getAccountInfoSync === 'function')
        ? wx.getAccountInfoSync()
        : null;
      const envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion;
      isDev = envVersion === 'develop' || envVersion === 'trial';
    } catch (e) {
      isDev = false;
    }
    if (isDev) this.setData({ isDev: true });
  },

  // 从接口获取手机型号列表
  async fetchPhoneTypeList() {
    // 如果已经加载过，不重复请求
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
      if (data.code === 200 && Array.isArray(data.rows) && data.rows.length > 0) {
        const modelOptions = data.rows.map(item => ({
          name: item.name,
          value: item.code
        }));

        // 默认选中第一个
        this.setData({
          modelOptions,
          selectedModelName: modelOptions[0].name,
          'formData.typeCode': modelOptions[0].value
        });
      } else {
        console.warn('获取手机型号列表失败:', data.msg);
        // 接口失败时使用兜底数据
        this.setFallbackModelOptions();
      }
    } catch (error) {
      console.error('获取手机型号列表异常:', error);
      // 网络异常时使用兜底数据
      this.setFallbackModelOptions();
    } finally {
      this.setData({ isFetchingModel: false });
    }
  },

  // 兜底手机型号数据
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

  // 检查登录状态
  // 返回值：true 表示已过期已交由 handleUnauthorized 统一处理，调用方应中断后续逻辑；false 表示登录态正常
  checkLoginStatus() {
    const isGuest = wx.getStorageSync('isGuest');
    if (isGuest) return false; // 游客模式不拦截

    const token = wx.getStorageSync('token');
    const tokenExpireTime = wx.getStorageSync('tokenExpireTime');
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = wx.getStorageSync('isLoggedIn');

    const now = Date.now();

    // 如果没有 token、用户信息，或者 token 已过期
    if (
      !isLoggedIn ||
      !token ||
      !userInfo ||
      !tokenExpireTime ||
      now > tokenExpireTime
    ) {
      // 复用统一的登录过期处理：内部有去重标志，整个会话只会触发一次 modal + reLaunch
      // 由其内部统一执行清缓存、跳转登录页等操作，避免与请求拦截器双重跳转
      handleUnauthorized();
      return true;
    }
    return false;
  },

  // 删除图片回调
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

  // 上传图片后回调
  afterRead(e) {
    const { file } = e.detail;
    const pictureList = this.data.pictureList;

    // 校验是否已选择手机型号
    if (!this.data.formData.typeCode) {
      wx.showToast({
        title: '请先选择手机型号',
        icon: 'none'
      });
      return;
    }

    // 限制只能上传一张图片
    if (pictureList.length >= 1) {
      wx.showToast({
        title: '只能上传一张图片',
        icon: 'none'
      });
      return;
    }

    // 添加图片到列表
    pictureList.push({
      url: file.url,
      path: file.path
    });

    this.setData({
      pictureList
    });

    // 开始OCR识别
    this.startOCR(file);
  },

  // 开始OCR识别
  async startOCR(file) {
    // 重置状态
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

    wx.showLoading({
      title: '正在识别...',
      mask: true
    });

    try {
      // 1. 首选微信小程序OCR（云函数）
      if (isWechatOcrEnabled()) {
        console.log('开始微信小程序OCR识别...');
        const wechatOCRResult = await this.tryWechatOCR(file);

        if (wechatOCRResult.success) {
          console.log('微信小程序OCR识别成功');
          this.parseOCRResultToForm(wechatOCRResult.text);
          this.handleOCRSuccess();
          return;
        }

        // 2. 微信OCR失败，尝试后端接口
        console.log('微信OCR失败，尝试后端接口...');
      } else {
        // 开发者工具等场景：跳过微信服务市场OCR，直接走后端
        console.log(
          '已禁用微信OCR（当前环境不支持/已关闭开关），直接尝试后端接口...'
        );
      }
      const backendOCRResult = await this.tryBackendOCR(file);

      if (backendOCRResult.success) {
        console.log('后端接口OCR识别成功');
        this.parseOCRResultToForm(backendOCRResult.text);
        this.handleOCRSuccess();
        return;
      }

      // 3. 所有OCR服务都失败，提示用户重试（不再使用 mock 兜底，便于全链路测试暴露真实问题）
      console.error('所有OCR服务失败');
      this.setData({ isRecognizing: false });
      wx.showToast({
        title: 'OCR识别失败，请重试或手动输入',
        icon: 'none',
        duration: 2000
      });
    } catch (error) {
      console.error('OCR识别流程失败:', error);
      this.setData({ isRecognizing: false });
      wx.showToast({
        title: error.message || 'OCR识别失败',
        icon: 'none',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 下载网络图片到本地临时文件
  downloadImageToTempFile(url) {
    return new Promise((resolve, reject) => {
      // 从 URL 中提取扩展名作为兜底，避免 iOS 自动生成的临时文件无后缀
      const extMatch = url.match(/\.(jpe?g|png|gif|bmp|webp)(\?|#|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
      const filePath = `${wx.env.USER_DATA_PATH}/download_${Date.now()}.${ext}`;

      wx.downloadFile({
        url,
        filePath,
        success(res) {
          if (
            res.statusCode >= 200 &&
            res.statusCode < 300 &&
            res.tempFilePath
          ) {
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

  // 尝试微信小程序OCR
  // 微信小程序OCR识别
  async tryWechatOCR(file) {
    console.log('🚀 ~ file:', file);
    try {
      if (!wx.serviceMarket || !wx.serviceMarket.invokeService) {
        throw new Error('服务市场API不可用');
      }

      const startTime = Date.now();
      console.log('开始调用微信OCR服务...');

      const originalFilePath =
        file?.path || file?.tempFilePath || file?.url || file;
      if (!originalFilePath) {
        throw new Error('未获取到可识别的图片路径');
      }

      const localFilePath = /^https?:\/\//i.test(originalFilePath)
        ? await this.downloadImageToTempFile(originalFilePath)
        : originalFilePath;

      // 使用 wx.serviceMarket.CDN 上传本地文件并获取 URL
      // 注意：data_type: 3 表示 URL 形式的图片，img_url 字段名不能改
      const res = await wx.serviceMarket.invokeService({
        service: 'wx79ac3de8be320b71',
        api: 'OcrAllInOne',
        data: {
          // 使用 CDN 方法标记要上传的文件，微信会自动转换成 HTTP URL
          img_url: new wx.serviceMarket.CDN({
            type: 'filePath',
            filePath: localFilePath
          }),
          data_type: 3, // 3 表示 URL 形式的图片
          ocr_type: 8 // 8 表示通用 OCR 识别
        }
      });

      const costTime = Date.now() - startTime;
      console.log(`微信OCR服务调用成功，耗时: ${costTime}ms`, res);
      const result = res.data || res.result || res;
      let text = '';

      if (result && result.ocr_comm_res && result.ocr_comm_res.items) {
        text = result.ocr_comm_res.items
          .map(item => item.text || item.content)
          .filter(Boolean)
          .join('\n');
      } else if (result && result.items) {
        text = result.items
          .map(item => item.text || item.content)
          .filter(Boolean)
          .join('\n');
      } else if (result && result.text) {
        text = result.text;
      } else if (typeof result === 'string') {
        text = result;
      } else {
        console.warn('未知的微信OCR返回结构:', result);
        text = this.extractTextFromResult(result);
      }

      console.log('微信OCR识别到的文本:', text);

      if (!text || text.length < 5) {
        throw new Error('未识别到有效文字');
      }

      return { success: true, text };
    } catch (error) {
      console.error('微信小程序OCR失败:', error);

      const errMsg = error.errMsg || error.message || String(error);
      const errCode = error.errCode || '';

      if (errMsg.includes('9301010') || errCode === 9301010) {
        return {
          success: false,
          error: 'OCR服务未开通或余额不足，请在微信公众平台-服务市场购买'
        };
      }

      return { success: false, error: errMsg };
    }
  },

  // 从复杂结构中提取文本
  extractTextFromResult(result) {
    if (!result) return '';

    // 递归提取所有text字段
    const texts = [];
    const extract = obj => {
      if (typeof obj === 'string') {
        texts.push(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(extract);
      } else if (typeof obj === 'object' && obj !== null) {
        if (obj.text) texts.push(obj.text);
        if (obj.content) texts.push(obj.content);
        Object.values(obj).forEach(extract);
      }
    };

    extract(result);
    return [...new Set(texts)].join('\n'); // 去重后拼接
  },

  // 尝试后端接口OCR
  async tryBackendOCR(file) {
    try {
      console.log('调用后端OCR接口...');
      const originalFilePath =
        file?.path || file?.tempFilePath || file?.url || file;

      if (!originalFilePath) {
        throw new Error('未获取到图片路径');
      }

      // wx.uploadFile 只能上传本地文件路径，如果是网络图先下载
      const localFilePath = /^https?:\/\//i.test(originalFilePath)
        ? await this.downloadImageToTempFile(originalFilePath)
        : originalFilePath;

      return new Promise(resolve => {
        uploadFile({
          url: buildApiUrl(API_ENDPOINTS.ocrImageCheck),
          filePath: localFilePath,
          name: 'file',
          formData: {
            typeCode: this.data.formData.typeCode || '1'
          },
          success: res => {
            console.log('后端OCR接口返回:', res);
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(res.data);
                let text = '';

                // 尝试从常见的数据结构中提取文本
                if (data.data && typeof data.data === 'string') {
                  text = data.data;
                } else if (data.text) {
                  text = data.text;
                } else {
                  text = this.extractTextFromResult(data);
                }

                if (!text || text.length < 5) {
                  resolve({ success: false, error: '后端接口未返回有效文字' });
                } else {
                  resolve({ success: true, text: text });
                }
              } catch (e) {
                // 如果解析JSON失败，直接将返回内容作为文本
                resolve({ success: true, text: res.data });
              }
            } else {
              let errorMsg = `请求失败，状态码：${res.statusCode}`;
              try {
                if (res.data && typeof res.data === 'string') {
                  const parsed = JSON.parse(res.data);
                  errorMsg =
                    parsed.desc || parsed.message || parsed.status || errorMsg;
                }
              } catch (e) {
                // 解析失败则忽略，使用默认错误信息
              }
              resolve({
                success: false,
                error: errorMsg
              });
            }
          },
          fail: err => {
            console.warn('后端接口OCR请求失败:', err);
            resolve({ success: false, error: err.errMsg || '网络请求失败' });
          }
        });
      });
    } catch (error) {
      console.warn('后端接口OCR失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  // OCR识别成功处理
  handleOCRSuccess() {
    this.setData({
      activeStep: 1,
      isRecognizing: false
    });

    wx.showToast({
      title: '识别完成',
      icon: 'success',
      duration: 1500
    });

    // 滚动到步骤2
    this.scrollToElement('#step-2-card');
  },

  // 解析OCR结果填充表单
  parseOCRResultToForm(text) {
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);

    const formData = { ...this.data.formData };

    // 正则表达式优化
    // 1. 带标签的序列号：支持 SN, S/N, Serial, Serial No, Serial Number, 序列号 等前缀
    //    注意：排除 PESN/MEID 等非 SN 标签，SN 值长度放宽到 8-20 位
    const snLabelRegex =
      /(?:^|[^A-Z])(?:SN|S\/N|Serial(?:\s+(?:No\.?|Number))?|序列号)[\s:：]*([A-Z0-9]{8,20})/i;

    // 2. 纯序列号：8-20位大写字母和数字组合，排除纯数字
    const snPureRegex = /\b([A-Z0-9]{8,20})\b/;

    // 3. 带标签的 IMEI（支持 IMEI、IMEI1、IMEI2）
    const imei1LabelRegex = /IMEI(?:1)?[\s:：]*(\d{15})/i;
    const imei2LabelRegex = /IMEI2[\s:：]*(\d{15})/i;

    // 4. 纯 IMEI：15位数字
    const imeiPureRegex = /\b(\d{15})\b/;

    // 分别存储 IMEI1 和 IMEI2
    let foundImei1 = '';
    let foundImei2 = '';
    let foundSn = false;

    lines.forEach(line => {
      // 优先匹配带标签的序列号（排除 PESN、MEID 等干扰项）
      if (!formData.sn) {
        const snLabelMatch = line.match(snLabelRegex);
        if (snLabelMatch) {
          formData.sn = snLabelMatch[1];
          foundSn = true;
        }
      }

      // 优先匹配带标签的 IMEI2（先匹配 IMEI2，避免被 IMEI1 正则误匹配）
      if (!foundImei2) {
        const imei2Match = line.match(imei2LabelRegex);
        if (imei2Match) {
          foundImei2 = imei2Match[1];
          return; // 已匹配 IMEI2，跳过本行
        }
      }

      // 匹配 IMEI 或 IMEI1
      if (!foundImei1) {
        const imei1Match = line.match(imei1LabelRegex);
        if (imei1Match) {
          foundImei1 = imei1Match[1];
        }
      }
    });

    // 如果没有找到带标签的 IMEI，尝试匹配纯数字 IMEI
    if (!foundImei1 && !foundImei2) {
      const pureImeis = [];
      lines.forEach(line => {
        const imeiMatch = line.match(imeiPureRegex);
        if (imeiMatch && !pureImeis.includes(imeiMatch[1])) {
          pureImeis.push(imeiMatch[1]);
        }
      });
      if (pureImeis.length > 0) foundImei1 = pureImeis[0];
      if (pureImeis.length > 1) foundImei2 = pureImeis[1];
    }

    // 如果没有找到带标签的序列号，再尝试匹配纯序列号
    if (!foundSn && !formData.sn) {
      for (const line of lines) {
        const snMatch = line.match(snPureRegex);
        // 确保不是纯数字，且不是IMEI（15位数字），且不是已识别的 IMEI 值
        if (
          snMatch &&
          !/^\d+$/.test(snMatch[1]) &&
          snMatch[1] !== foundImei1 &&
          snMatch[1] !== foundImei2
        ) {
          formData.sn = snMatch[1];
          break; // 找到一个疑似序列号就停止
        }
      }
    }

    // 填充 IMEI
    if (foundImei1) formData.imei = foundImei1;
    if (foundImei2) formData.imei2 = foundImei2;

    console.log('解析后的表单数据:', formData);
    this.setData({ formData });
  },

  // 表单输入事件
  onSnChange(e) {
    this.setData({
      'formData.sn': e.detail
    });
  },

  onImeiChange(e) {
    this.setData({
      'formData.imei': e.detail
    });
  },

  onImei2Change(e) {
    this.setData({
      'formData.imei2': e.detail
    });
  },

  // 显示手机型号选择器
  onShowModelPicker() {
    this.setData({ showModelPicker: true });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ isHidden: true });
    }
  },

  // 关闭手机型号选择器
  onCloseModelPicker() {
    this.setData({ showModelPicker: false });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ isHidden: false });
    }
  },

  // 选择手机型号
  // van-picker 的 confirm 事件回调：e.detail = { value: <整行对象>, index: <下标> }
  // 这里 value 实际是 modelOptions[index]，形如 { name, value }，需再次取字段
  onSelectModel(e) {
    const { value: selected, index } = e.detail || {};
    // 优先使用回调里的整行对象；兜底用 index 从 modelOptions 取，避免 undefined
    const item = (selected && typeof selected === 'object')
      ? selected
      : (this.data.modelOptions[index] || {});

    if (!item || !item.value) {
      this.setData({ showModelPicker: false });
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ isHidden: false });
      }
      return;
    }

    this.setData({
      selectedModelName: item.name,
      'formData.typeCode': item.value,
      showModelPicker: false
    });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ isHidden: false });
    }
  },

  // 查询保修信息
  async handleQuery() {
    const { sn, imei, typeCode } = this.data.formData;

    if (!sn && !imei) {
      wx.showToast({
        title: '请输入序列号或IMEI',
        icon: 'none'
      });
      return;
    }

    // 获取图片路径（imageUrl），用于上传 img 字段
    const imageUrl = this.data.pictureList.length > 0
      ? (this.data.pictureList[0].path || this.data.pictureList[0].url)
      : '';

    this.setData({
      isQuerying: true
    });

    try {
      // 构建 formData 参数：code 必传，优先使用 SN，其次使用 IMEI
      const formData = {
        typeCode,
        code: sn || imei
      };
      const infoId = this.data.leaveInfoId;
      if (infoId) formData.infoId = infoId;
      if (imei) formData.imei = imei;

      let data;

      if (imageUrl) {
        // 有图片时：使用 uploadFile 发送 POST multipart/form-data，图片字段为 img
        // wx.uploadFile 需要本地文件路径，如果是网络图先下载
        const localFilePath = /^https?:\/\//i.test(imageUrl)
          ? await this.downloadImageToTempFile(imageUrl)
          : imageUrl;

        const res = await uploadFile({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo),
          filePath: localFilePath,
          name: 'img',
          formData
        });

        // uploadFile 返回的 data 是字符串，需要解析
        data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } else {
        // 无图片时：使用普通 POST 请求，Content-Type 为 multipart/form-data 无法不带文件
        // 降级为普通 POST 请求
        const res = await request({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo),
          method: 'POST',
          data: formData,
          header: { 'Content-Type': 'multipart/form-data' }
        });
        data = res.data;
      }

      // 兼容两种响应格式：uploadFile 返回可能有 data 包裹，request 已标准化为扁平结构
      const resultData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
        ? data.data
        : data;
      if (data.code === 200) {
        const coverageDate = resultData.coverage;
        let isExpired = false;
        let warrantyStatus = '未知';

        if (resultData.activated) {
          if (coverageDate) {
            // 使用 iOS 兼容的解析方式，避免 "yyyy-MM-dd HH:mm:ss" 在 iOS 下解析为 NaN
            const coverageTime = parseDateTime(coverageDate);
            // 优先使用后端返回的系统时间，无则回退到本机时间
            const sysTime = resultData.sysTime
              ? parseDateTime(resultData.sysTime)
              : Date.now();
            console.log("🚀 ~ sysTime:", sysTime, "coverageTime:", coverageTime);
            // 防御：任一时间解析失败时，按 "未过保" 处理，避免 NaN 比较导致误判
            if (Number.isNaN(coverageTime) || Number.isNaN(sysTime)) {
              isExpired = false;
              warrantyStatus = '保修中';
            } else {
              // 如果质保时间晚于系统时间，则未过保，可以跳转亚丁屏卫
              isExpired = coverageTime <= sysTime;
              warrantyStatus = isExpired ? '已过保' : '保修中';
            }
          } else {
            warrantyStatus = '已激活';
          }
        } else {
          warrantyStatus = '未激活';
          isExpired = true;
        }

        const queryResultData = {
          id: resultData.id || '', // 订单id，用于 signContract 接口
          productName: resultData.model || '未知设备',
          activationDate: resultData.activateDate || '未知',
          coverageDate: coverageDate || '未知',
          isExpired: isExpired,
          warrantyStatus: warrantyStatus,
          contractPath: resultData.contractPath || '',
          signaturePath: resultData.signaturePath || '',
          contractName: resultData.contractName || '',
          contractVersion: resultData.contractVersion || ''
        };

        this.setData({
          queryResult: queryResultData,
          activeStep: 2,
          isQuerying: false
        });

        wx.showToast({
          title: '查询成功',
          icon: 'success'
        });

        // 滚动到步骤3
        this.scrollToElement('#step-3-card');
      } else {
        throw new Error(data.msg || '查询失败');
      }
    } catch (error) {
      this.setData({
        isQuerying: false
      });

      wx.showToast({
        title: error.message || '查询失败，请重试',
        icon: 'none'
      });

      console.error(error);
    }
  },

  // 兼容保留：用户从公众号 webview 返回时的兜底引导（当前流程已不再使用 webview 跳转，保留空实现避免调用报错）
  checkOfficialAccountReturn() {
    if (!this._pendingOAReturn) return;
    this._pendingOAReturn = false;
  },

  // ========== 跳转公众号入口：弹出自定义 Modal，由用户选择跳转方式 ==========
  handleJumpToOfficialAccount() {
    const { queryResult } = this.data;

    if (!queryResult || queryResult.isExpired) {
      wx.showToast({
        title: '设备已过保，无法跳转',
        icon: 'none'
      });
      return;
    }

    this.setData({ showOAModal: true });
  },

  // 关闭公众号引导 Modal
  handleCloseOAModal() {
    this.setData({ showOAModal: false });
  },

  // 阻止内部点击事件冒泡到遮罩层
  handleNoop() { },

  // 重置查询
  handleReset() {
    // 重置时保留当前型号列表，默认选中第一个
    const firstModel = this.data.modelOptions[0] || { name: '', value: '' };
    this.setData({
      activeStep: 0,
      pictureList: [],
      queryResult: null,
      formData: {
        typeCode: firstModel.value,
        sn: '',
        imei: '',
        imei2: ''
      },
      selectedModelName: firstModel.name,
      isRecognizing: false,
      isQuerying: false
    });

    // 滚动到顶部
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    });
  },

  // 滚动到指定元素
  scrollToElement(selector) {
    // 延时等待 wx:if 条件渲染完成后再获取元素位置
    setTimeout(() => {
      const query = wx.createSelectorQuery();
      query.select(selector).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec(res => {
        const rect = res[0];
        const scrollInfo = res[1];
        if (rect && scrollInfo) {
          // rect.top 是相对视口的位置，加上当前滚动偏移得到绝对位置
          wx.pageScrollTo({
            scrollTop: scrollInfo.scrollTop + rect.top - 20,
            duration: 300
          });
        }
      });
    }, 300);
  },

  // 清除签名 Canvas 引用
  clearSignatureCanvas() {
    this.signatureCtx = null;
    this.signatureCanvas = null;
  },

  // ========== 查看协议并签名：跳转到协议签订页 ==========
  handleShowContract() {
    const { queryResult } = this.data;

    // 防御：必须有真实查询结果且未过保
    if (!queryResult) {
      wx.showToast({ title: '请先完成查询', icon: 'none' });
      return;
    }

    const orderId = queryResult.id;
    if (!orderId) {
      wx.showToast({ title: '订单信息缺失，请重新查询', icon: 'none' });
      return;
    }

    // 新手机场景：设备信息已查询完毕，直接带入签约页，跳过重复填写
    const { imei, sn } = this.data.formData;
    const phoneModel = queryResult.productName || '';
    const queryParts = [
      'orderId=' + encodeURIComponent(String(orderId)),
      'imei=' + encodeURIComponent(imei || ''),
      'sn=' + encodeURIComponent(sn || ''),
      'phoneModel=' + encodeURIComponent(phoneModel),
      'skipDeviceInfo=true'
    ];

    wx.navigateTo({
      url: '/pages/contract-sign/contract-sign?' + queryParts.join('&')
    });
  },

});
