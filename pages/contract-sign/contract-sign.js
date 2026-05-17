// pages/contract-sign/contract-sign.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  getApiBase
} = require('../../config');
const { request, uploadFile } = require('../../utils/request');

Page({
  data: {
    statusBarHeight: 0,

    // 订单 id（从上一页传递）
    orderId: '',

    // 协议数据
    contractData: null,        // { id, name, version, filePath, ... }
    pdfUrl: '',               // 协议 PDF 远程链接
    localPdfPath: '',         // 已下载到本地的临时文件路径
    contractCountdown: 10,     // 倒计时秒数
    contractCountdownTimer: null,
    contractCanConfirm: false,
    hasOpenedContract: false,  // 是否已经查看过协议（点过"查看协议"按钮）

    // 下载/打开状态
    downloadingContract: false,

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

    // 阶段：'contract' = 查看协议，'signature' = 签名
    stage: 'contract'
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    const orderId = options.orderId || '';
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      orderId,
      apiBase: getApiBase(),
      stage: 'contract'
    });

    this.loadContract();
  },

  onUnload() {
    this.clearContractCountdown();
  },

  // ========== 协议相关 ==========

  // 加载协议数据
  async loadContract() {
    wx.showLoading({ title: '加载协议中...' });
    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.getContract),
        method: 'GET',
        header: {
          Authorization: 'Bearer ' + wx.getStorageSync('token'),
          'x-app-wechat': '5c89231b711447acbf995c28c435dc39'
        }
      });
      const data = res.data;
      wx.hideLoading();
      if (data.code === 200 && data.data) {
        const contract = data.data;
        const fileUrl = contract.filePath.startsWith('http')
          ? contract.filePath
          : getApiBase() + contract.filePath;

        this.setData({
          contractData: contract,
          pdfUrl: fileUrl,
          contractCountdown: 10,
          contractCanConfirm: false,
          hasOpenedContract: false,
          localPdfPath: ''
        });

        // 预下载协议 PDF（提升点击查看时的响应速度）
        this.preDownloadPDF(fileUrl);
      } else {
        wx.showToast({ title: '暂无生效协议', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('获取协议失败:', err);
      wx.showToast({ title: '加载协议失败', icon: 'none' });
    }
  },

  // 预下载 PDF 文件到本地（静默）
  preDownloadPDF(url) {
    if (!url) return;
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ localPdfPath: res.tempFilePath });
          console.log('PDF 预下载完成:', res.tempFilePath);
        } else {
          console.warn('PDF 预下载失败，statusCode:', res.statusCode);
        }
      },
      fail: (err) => {
        console.warn('PDF 预下载失败:', err);
      }
    });
  },

  // 点击"查看协议"按钮 → 调起系统/微信内置文件查看器
  handleViewContract() {
    const { localPdfPath, pdfUrl, downloadingContract } = this.data;
    if (downloadingContract) return;

    if (localPdfPath) {
      this.openPDF(localPdfPath);
      return;
    }

    if (!pdfUrl) {
      wx.showToast({ title: '协议链接为空', icon: 'none' });
      return;
    }

    this.setData({ downloadingContract: true });
    wx.showLoading({ title: '加载协议中...' });
    wx.downloadFile({
      url: pdfUrl,
      success: (res) => {
        wx.hideLoading();
        this.setData({ downloadingContract: false });
        if (res.statusCode === 200) {
          this.setData({ localPdfPath: res.tempFilePath });
          this.openPDF(res.tempFilePath);
        } else {
          wx.showToast({ title: '下载协议失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ downloadingContract: false });
        console.error('下载协议失败:', err);
        wx.showToast({ title: '下载协议失败', icon: 'none' });
      }
    });
  },

  // 调用 wx.openDocument 打开 PDF
  openPDF(filePath) {
    wx.openDocument({
      filePath,
      fileType: 'pdf',
      showMenu: true,
      success: () => {
        console.log('打开 PDF 成功');
        // 用户已查看过协议 → 启动倒计时
        if (!this.data.hasOpenedContract) {
          this.setData({ hasOpenedContract: true });
          this.startContractCountdown();
        }
      },
      fail: (err) => {
        console.error('打开 PDF 失败:', err);
        wx.showModal({
          title: '提示',
          content: '无法打开协议文件，请稍后重试',
          showCancel: false
        });
      }
    });
  },

  // 倒计时
  startContractCountdown() {
    this.clearContractCountdown();
    const timer = setInterval(() => {
      const newVal = this.data.contractCountdown - 1;
      if (newVal <= 0) {
        this.clearContractCountdown();
        this.setData({
          contractCountdown: 0,
          contractCanConfirm: true
        });
      } else {
        this.setData({ contractCountdown: newVal });
      }
    }, 1000);
    this.data.contractCountdownTimer = timer;
  },

  clearContractCountdown() {
    if (this.data.contractCountdownTimer) {
      clearInterval(this.data.contractCountdownTimer);
      this.data.contractCountdownTimer = null;
    }
  },

  // 取消查看协议
  handleCloseContract() {
    wx.navigateBack();
  },

  // 确认协议，进入签名阶段
  handleContractConfirm() {
    if (!this.data.contractCanConfirm) return;
    this.clearContractCountdown();
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

  // 取消签名，返回协议阶段
  handleCancelSignature() {
    this.setData({
      stage: 'contract',
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

  // 上传签名图片 + 提交协议签订（multipart/form-data，只调一次接口）
  async uploadSignature(tempFilePath) {
    const { contractData, orderId } = this.data;
    if (!contractData) {
      wx.showToast({ title: '协议信息缺失', icon: 'none' });
      return;
    }

    this.setData({ uploadingSignature: true });
    wx.showLoading({ title: '提交签订中...' });

    const uploadUrl = buildApiUrl(API_ENDPOINTS.signContract);
    // 后端接口字段：
    //   - signatureFile: 签名图片文件（MultipartFile）
    //   - signaturePath:  协议文件路径（String）
    //   - id / contractId / contractPath: 业务字段
    const formData = {
      id: orderId || '',
      contractId: contractData.id || '',
      contractPath: contractData.filePath || '',
      signaturePath: contractData.filePath || ''
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
        formData,
        header: {
          Authorization: 'Bearer ' + wx.getStorageSync('token'),
          'x-app-wechat': '5c89231b711447acbf995c28c435dc39'
        }
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
        wx.showToast({ title: '签署成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
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
  }
});
