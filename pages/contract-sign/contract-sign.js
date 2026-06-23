// pages/contract-sign/contract-sign.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  getApiBase
} = require('../../config');
const { request, uploadFile } = require('../../utils/request');

Page({
  data: {
    // 订单 id（从上一页传递）
    orderId: '',

    // 协议数据
    contractData: null,        // { id, name, version, content, ... }
    contractContent: '',       // 协议正文（HTML 富文本，由后端返回）
    contractLoaded: false,     // 协议是否加载完成
    // 「我已阅读并同意」需同时满足两个条件才可点击：
    //   1) 已滚动到协议底部（或内容本身就不需要滚动）
    //   2) 进入页面后已超过 10s（防止用户秒点）
    contractScrolledToBottom: false,
    contractCountdown: 10,     // 阅读倒计时秒数（≤0 视为已结束）
    contractCountdownTimer: null,
    contractCanConfirm: false, // 计算字段：scrolledToBottom && countdown<=0

    // 设备信息表单（阶段2：提交前填写）
    deviceForm: {
      imei: '',           // 对应后端 signature_imei
      sn: '',             // 与 IMEI 二选一（任一非空即可）
      phoneModel: ''      // 对应后端 signature_model
    },
    deviceSubmitting: false,   // 点击「下一步」后的 loading（防重复）

    // 签名
    signatureCanvasId: 'signature-canvas',
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    hasSigned: false,
    signedImagePath: '',
    uploadingSignature: false,

    // API 基础地址
    apiBase: '',

    // 阶段：'contract' = 查看协议，'device-info' = 填写设备信息，'signature' = 手写签名
    stage: 'contract',

    // 签署成功页底部 tabbar
    successTabActive: 0,
    successTabList: [
      { pagePath: '/pages/imei-query/imei-query', text: '首页', icon: 'wap-home-o' },
      { pagePath: '/pages/my/my', text: '我的', icon: 'contact-o' }
    ]
  },

  onLoad(options) {
    const orderId = options.orderId || '';

    // 从 URL 参数读取设备信息（无旧手机场景预填，跳过重复填写）
    const skipDeviceInfo = options.skipDeviceInfo === 'true';
    const prefillDevice = {
      imei: decodeURIComponent(options.imei || ''),
      sn: decodeURIComponent(options.sn || ''),
      phoneModel: decodeURIComponent(options.phoneModel || '')
    };

    this.setData({
      orderId,
      apiBase: getApiBase(),
      stage: 'contract',
      deviceForm: prefillDevice
    });

    // 标记是否需要跳过设备信息填写阶段
    this._skipDeviceInfo = skipDeviceInfo;

    this.loadContract();
  },

  // 页面卸载：清理倒计时 + 兼底恢复为竖屏，避免在上一个页面仍以横屏错位展示
  onUnload() {
    this.clearContractCountdown();
    this.setOrientation('portrait');
  },

  // 页面尺寸变化（含横竖屏切换）
  // 设备旋转动画完成后才会触发，这里才是重新初始化 canvas 的最佳时机
  // 避免设备还在转中就拿尺寸，导致画布拉伸变形
  onResize(res) {
    const orientation = res && res.size && res.size.windowWidth > res.size.windowHeight
      ? 'landscape'
      : 'portrait';
    console.log('[onResize] 新朝向 →', orientation, res && res.size);
    // 在签名阶段下，任何一次尺寸变化都重新初始化画布，以匹配新的宽高
    if (this.data.stage === 'signature') {
      // 让出一帧等 layout 换算完成再拿尺寸
      wx.nextTick(() => this.initSignatureCanvas());
    }
  },

  // 设置设备朝向：portrait | landscape
  // 封装为一个带容错的工具方法，以防：
  //  - 老版本基础库未提供 wx.setDeviceOrientation（< 2.27.3）
  //  - 某些机型上 setDeviceOrientation 报 fail （不应该阻断主流程）
  // 设置设备/页面朝向：portrait | landscape
  // 优先使用 wx.setPageOrientation（基础库 2.27.3+，比 setDeviceOrientation 更稳定）
  // 老版本基础库降级使用 wx.setDeviceOrientation
  // 注意：要让两者真正生效，app.json 需要配置 "resizable": true
  setOrientation(value) {
    const hasPageOrient = typeof wx.setPageOrientation === 'function';
    const hasDeviceOrient = typeof wx.setDeviceOrientation === 'function';
    console.log('[setOrientation] 调用 →', value, {
      hasPageOrient,
      hasDeviceOrient
    });

    if (!hasPageOrient && !hasDeviceOrient) {
      console.warn('[setOrientation] 当前基础库不支持横竖屏切换 API，跳过');
      return;
    }

    const apiName = hasPageOrient ? 'setPageOrientation' : 'setDeviceOrientation';
    try {
      wx[apiName]({
        value, // 兼容旧的 setDeviceOrientation
        orientation: value, // 兼容 setPageOrientation
        success: () => console.log(`[setOrientation] (${apiName}) 已切换为`, value),
        fail: (err) => {
          console.warn(`[setOrientation] (${apiName}) 切换失败 →`, value, err);
          // setPageOrientation 失败时，再尝试用 setDeviceOrientation 兜一次
          if (apiName === 'setPageOrientation' && hasDeviceOrient) {
            wx.setDeviceOrientation({
              value,
              orientation: value,
              success: () => console.log('[setOrientation] (fallback setDeviceOrientation) 已切换为', value),
              fail: (e2) => console.warn('[setOrientation] fallback 也失败 →', e2)
            });
          }
        }
      });
    } catch (err) {
      console.warn('[setOrientation] 调用异常 →', value, err);
    }
  },

  // ========== 协议相关 ==========

  // 加载协议数据（接口现已直接返回 HTML 富文本，无需再下载 PDF）
  async loadContract() {
    wx.showLoading({ title: '加载协议中...' });
    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.getContract),
        method: 'GET'
      });
      const data = res.data;
      wx.hideLoading();
      if (data.code === 200 && data.id) {
        const contract = data;
        // 后端返回的协议正文为 HTML 富文本，存放在 content 字段
        let rawContent = contract.content || '';

        // ---- 处理协议 HTML，使其在 rich-text 中能正确呈现表格 ----
        // 1) 剥离 docx 转 HTML 时常见的固定宽度/高度属性，避免在小屏内列宽失衡导致一列只能塞 1~2 个字
        rawContent = rawContent
          // 移除 <table>/<td>/<th>/<col> 上的 width、height 属性（数字或百分比都干掉）
          .replace(/<(table|td|th|tr|col|colgroup)([^>]*?)\s(width|height)=["'][^"']*["']/gi, '<$1$2')
          // 移除内联 style 中的 width/height（保留其它 style 暂不实现，简单粗暴去掉整段 style 上的宽高声明）
          .replace(/style=("|')([^"']*)\1/gi, (match, quote, styleStr) => {
            const cleaned = styleStr
              .replace(/(^|;)\s*(width|height|min-width|max-width|min-height|max-height)\s*:\s*[^;]+/gi, '')
              .replace(/^;\s*/, '')
              .trim();
            return cleaned ? `style=${quote}${cleaned}${quote}` : '';
          });

        // 2) 注入统一的表格样式：按内容真实宽度展示 + 单线边框 + 中英文混排自然换行
        //    word-break: normal 让中文按字符可换行（中文自然行为），英文按词换行；避免某列被超长中文撑爆
        rawContent = rawContent.replace(/<table\b/gi, '<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-spacing: 0; margin: 10px 0; font-size: 14px;"');
        rawContent = rawContent.replace(/<th\b/gi, '<th style="border: 1px solid #323233; padding: 6px 10px; background-color: #f5f5f5; text-align: center; vertical-align: middle; word-break: normal; overflow-wrap: break-word; white-space: normal; min-width: 48px; max-width: 140px; line-height: 1.6; box-sizing: border-box;"');
        rawContent = rawContent.replace(/<td\b/gi, '<td style="border: 1px solid #323233; padding: 6px 10px; text-align: center; vertical-align: middle; word-break: normal; overflow-wrap: break-word; white-space: normal; min-width: 48px; max-width: 140px; line-height: 1.6; box-sizing: border-box;"');

        this.setData({
          contractData: contract,
          contractContent: rawContent,
          contractLoaded: true,
          contractScrolledToBottom: false,
          contractCountdown: 10,
          contractCanConfirm: false
        });

        // 协议加载完成 → 立即启动 10s 阅读倒计时
        this.startContractCountdown();

        // 协议加载完成后，下一帧检查是否需要滚动
        // 若内容本身不足以撑满容器（无需滚动），直接视为「已滑到底」
        wx.nextTick(() => {
          this.checkContentScrollable();
        });
      } else {
        wx.showToast({ title: '暂无生效协议', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('获取协议失败:', err);
      wx.showToast({ title: '加载协议失败', icon: 'none' });
    }
  },

  // 检查协议正文是否需要滚动；若内容高度 ≤ 容器高度则视为已读到底
  checkContentScrollable() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.contract-scroll-view').boundingClientRect();
    query.select('.contract-rich-text').boundingClientRect();
    query.exec((res) => {
      const wrapperRect = res && res[0];
      const contentRect = res && res[1];
      if (!wrapperRect || !contentRect) return;
      // 容器高度上的容差，避免边界值导致永远点不了按钮
      const tolerance = 4;
      if (contentRect.height <= wrapperRect.height + tolerance) {
        this.markScrolledToBottom();
      }
    });
  },

  // 协议正文滚动到底部 → 标记「滑到底」并尝试解锁确认按钮
  handleContentScrollToLower() {
    this.markScrolledToBottom();
  },

  // 标记「滑到底」状态，并刷新合并的 contractCanConfirm
  markScrolledToBottom() {
    if (this.data.contractScrolledToBottom) return;
    this.setData({ contractScrolledToBottom: true });
    this.recomputeCanConfirm();
  },

  // 启动 10s 阅读倒计时；倒计时结束后再尝试解锁确认按钮
  startContractCountdown() {
    this.clearContractCountdown();
    const timer = setInterval(() => {
      const next = this.data.contractCountdown - 1;
      if (next <= 0) {
        this.clearContractCountdown();
        this.setData({ contractCountdown: 0 });
        this.recomputeCanConfirm();
      } else {
        this.setData({ contractCountdown: next });
      }
    }, 1000);
    this.data.contractCountdownTimer = timer;
  },

  // 清理倒计时 timer（页面卸载、确认进入下一阶段时调用）
  clearContractCountdown() {
    if (this.data.contractCountdownTimer) {
      clearInterval(this.data.contractCountdownTimer);
      this.data.contractCountdownTimer = null;
    }
  },

  // 综合「滑到底」与「倒计时已结束」两个条件，更新 contractCanConfirm
  recomputeCanConfirm() {
    const { contractScrolledToBottom, contractCountdown, contractCanConfirm } = this.data;
    const canConfirm = contractScrolledToBottom && contractCountdown <= 0;
    if (canConfirm !== contractCanConfirm) {
      this.setData({ contractCanConfirm: canConfirm });
    }
  },

  // 取消查看协议
  handleCloseContract() {
    wx.navigateBack();
  },

  // 确认协议，进入下一阶段（有设备信息则跳过填写直接签名）
  handleContractConfirm() {
    if (!this.data.contractCanConfirm) return;
    this.clearContractCountdown();
    // 无旧手机场景：设备信息已从上一页带入，跳过填写阶段
    if (this._skipDeviceInfo && this.validateDeviceForm() === '') {
      this.enterSignatureStage();
    } else {
      this.setData({ stage: 'device-info' });
    }
  },

  // ========== 设备信息阶段 ==========

  // 表单字段变更（多个字段复用一个处理器，通过 data-field 区分）
  handleDeviceFieldChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = (e.detail || '').toString().trim();
    if (!field) return;
    this.setData({
      [`deviceForm.${field}`]: value
    });
  },

  // 返回查看协议阶段
  handleBackToContract() {
    this.setData({ stage: 'contract' });
  },

  // 校验设备表单 → 返回错误提示（空串表示通过）
  validateDeviceForm() {
    const { imei, sn, phoneModel } = this.data.deviceForm;
    if (!phoneModel) return '请填写手机型号';
    if (phoneModel.length > 50) return '手机型号不能超过 50 个字符';
    if (!imei && !sn) return 'IMEI 与 SN 请至少填写一项';
    if (imei) {
      // IMEI：14-17 位纯数字（兼容 IMEI/MEID/IMEISV）
      if (!/^\d{14,17}$/.test(imei)) return 'IMEI 格式不正确（14-17 位纯数字）';
    }
    if (sn) {
      // SN：6-32 位字母数字（不区分大小写）
      if (!/^[A-Za-z0-9]{6,32}$/.test(sn)) return 'SN 格式不正确（6-32 位字母数字）';
    }
    return '';
  },

  // 设备信息 「下一步」→ 进入签名阶段
  handleDeviceInfoNext() {
    const errMsg = this.validateDeviceForm();
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }
    this.enterSignatureStage();
  },

  // 进入签名阶段（初始化画布，可被 handleContractConfirm 和 handleDeviceInfoNext 复用）
  enterSignatureStage() {
    this.setData({ stage: 'signature' });
    setTimeout(() => {
      this.initSignatureCanvas();
    }, 300);
  },

  // ========== 签名相关 ==========

  // 初始化签名画布
  initSignatureCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#signature-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) {
          console.warn('签名 canvas 未找到，重试...');
          setTimeout(() => this.initSignatureCanvas(), 200);
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.signatureCtx = ctx;
        this.signatureCanvas = canvas;
      });
  },

  // 触摸开始
  handleSignatureStart(e) {
    const touch = e.touches[0];
    this.setData({
      isDrawing: true,
      lastX: touch.x,
      lastY: touch.y,
      hasSigned: true
    });
  },

  // 触摸移动
  handleSignatureMove(e) {
    if (!this.data.isDrawing) return;
    const touch = e.touches[0];
    const ctx = this.signatureCtx || (this.signatureCanvas && this.signatureCanvas.getContext('2d'));
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(this.data.lastX, this.data.lastY);
    ctx.lineTo(touch.x, touch.y);
    ctx.stroke();
    this.setData({
      lastX: touch.x,
      lastY: touch.y
    });
  },

  // 触摸结束
  handleSignatureEnd() {
    this.setData({ isDrawing: false });
  },

  // 清除签名
  handleClearSignature() {
    const canvas = this.signatureCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.setData({ hasSigned: false });
  },

  // 取消签名：skipDeviceInfo 场景返回协议页，否则返回设备信息填写阶段
  handleCancelSignature() {
    this.setData({
      stage: this._skipDeviceInfo ? 'contract' : 'device-info',
      hasSigned: false,
      signedImagePath: ''
    });
  },

  // 确认签名，上传并提交
  async handleConfirmSignature() {
    if (!this.data.hasSigned) {
      wx.showToast({ title: '请先签名', icon: 'none' });
      return;
    }
    if (!this.signatureCanvas) {
      wx.showToast({ title: '签名画布未初始化', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存签名中...' });

    try {
      // 导出签名图片临时文件路径，作为 signatureFile 直接 uploadFile 上送给后端
      // 后端会保存图片并自行合成最终协议，前端不再做 HTML 字段回填
      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this.signatureCanvas,
          fileType: 'png',
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => reject(err)
        });
      });
      console.log('签名图片临时路径:', tempFilePath);
      this.setData({ signedImagePath: tempFilePath });
      wx.hideLoading();

      await this.uploadSignature(tempFilePath);
    } catch (err) {
      wx.hideLoading();
      console.error('导出签名失败:', err);
      wx.showToast({ title: '保存签名失败', icon: 'none' });
    }
  },

  // 将本地临时文件读为 base64（保留作为兜底工具，当前主流程不使用）
  fileToBase64(filePath) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(res.data),
        fail: (err) => reject(err)
      });
    });
  },

  // 上传签名图片 + 提交协议签订（multipart/form-data，只调一次接口）
  // 注意：小程序前端不再做协议 HTML 字段回填，contractContent 直接原样上送，
  //       后端拿到原始富文本 + signatureModel/Imei/Date/File 自行合成最终协议
  async uploadSignature(tempFilePath) {
    const { contractData, orderId } = this.data;
    if (!contractData) {
      wx.showToast({ title: '协议信息缺失', icon: 'none' });
      return;
    }

    this.setData({ uploadingSignature: true });
    wx.showLoading({ title: '提交签订中...' });

    const uploadUrl = buildApiUrl(API_ENDPOINTS.signContract);
    const { imei, sn, phoneModel } = this.data.deviceForm;
    const { contractContent } = this.data;
    // 协议中「设备 IMEI」一行后端要展示哪个值：IMEI 优先，否则 SN（用户二选一填写）
    const imeiOrSn = imei || sn;
    // 后端 signature_date 列为 DATE 类型，仅需 yyyy-MM-dd
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const signatureDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    // 后端接口字段（前端上传使用驼峰，后端变量存储为蛇形）：
    //   - signatureFile: 签名图片文件（MultipartFile）
    //   - id / contractId: 业务字段
    //   - contractPath / signaturePath: 兼容旧接口的兜底字段
    //   - contractContent  → contract_content（原始协议富文本，原样回传，不做替换）
    //   - signatureModel   → signature_model（协议签订设备型号）
    //   - signatureImei    → signature_imei（协议签订设备 IMEI 或 SN）
    //   - signatureDate    → signature_date（协议签订日期，yyyy-MM-dd）
    const formData = {
      id: orderId || '',
      contractId: contractData.id || '',
      contractPath: contractData.filePath || '',
      signaturePath: contractData.filePath || '',
      contractContent: contractContent || '',
      signatureModel: phoneModel || '',
      signatureImei: imeiOrSn || '',
      signatureDate
    };

    console.log('[signContract] 准备上传 →', {
      url: uploadUrl,
      filePath: tempFilePath,
      formData
    });

    try {
      const res = await uploadFile({
        url: uploadUrl,
        filePath: tempFilePath,
        name: 'signatureFile',
        formData
      });

      console.log('[signContract] 后端原始响应 →', {
        statusCode: res.statusCode,
        rawData: res.data
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`HTTP ${res.statusCode}：${res.data || '服务器错误'}`);
      }

      let data;
      try {
        data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } catch (parseErr) {
        throw new Error('返回数据非 JSON 格式：' + res.data);
      }

      console.log('[signContract] 后端解析后业务数据 →', data);

      if (data && data.code === 200) {
        wx.hideLoading();
        this.setData({ uploadingSignature: false });
        // 签署成功 → 展示成功结果页
        this.setData({ stage: 'success' });
      } else {
        const errMsg = (data && (data.msg || data.message)) || `签订失败（code=${data && data.code}）`;
        throw new Error(errMsg);
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ uploadingSignature: false });
      console.error('[signContract] 签订协议失败:', err);
      wx.showModal({
        title: '签订协议失败',
        content: (err && err.message) || '未知错误，请稍后重试',
        showCancel: false
      });
    }
  },

  // ========== 签署成功结果页 ==========

  // 返回首页（查询tab，默认无值状态）
  handleGoHome() {
    wx.reLaunch({ url: '/pages/imei-query/imei-query' });
  },

  // 查看本次订单 → 跳转到查询记录列表
  handleViewOrder() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  // 签署成功页底部 tabbar 切换
  handleSuccessTabChange(e) {
    const index = e.detail;
    const item = this.data.successTabList[index];
    if (item && item.pagePath) {
      wx.switchTab({ url: item.pagePath });
    }
  }
});
