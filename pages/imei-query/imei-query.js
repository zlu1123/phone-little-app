// pages/imei-query/imei-query.js
const {
  API_ENDPOINTS,
  buildApiUrl,
  isWechatOcrEnabled
} = require('../../config');

Page({
  data: {
    // 步骤条状态
    activeStep: 0,
    steps: [{ text: '上传识别' }, { text: '确认信息' }, { text: '查询结果' }],

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
    selectedModelName: '苹果',
    modelOptions: [
      { name: '苹果', value: '1' },
      { name: '小米/红米', value: '2' },
      { name: '华为/荣耀', value: '3' }
    ]
  },

  onShow() {
    // 同步自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const isGuest = wx.getStorageSync('isGuest');
    if (isGuest) return; // 游客模式不拦截

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
      // 清除可能过期的状态
      wx.removeStorageSync('token');
      wx.removeStorageSync('tokenExpireTime');
      wx.removeStorageSync('isLoggedIn');
      wx.removeStorageSync('userInfo');

      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });

      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/login'
        });
      }, 1000);
    }
  },

  // 上传图片后回调
  afterRead(e) {
    const { file } = e.detail;
    const pictureList = this.data.pictureList;

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

      // 3. 所有OCR服务都失败，使用模拟数据
      console.log('所有OCR服务失败，使用模拟数据...');
      wx.showToast({
        title: 'OCR服务不可用，使用模拟数据',
        icon: 'none',
        duration: 2000
      });
      this.mockOCR(file);
    } catch (error) {
      console.error('OCR识别流程失败:', error);
      wx.showToast({
        title: error.message || 'OCR识别失败',
        icon: 'none',
        duration: 2000
      });
      // 最终兜底：使用模拟数据
      this.mockOCR(file);
    } finally {
      wx.hideLoading();
    }
  },

  // 下载网络图片到本地临时文件
  downloadImageToTempFile(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
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
        wx.uploadFile({
          url: buildApiUrl(API_ENDPOINTS.ocrImageCheck),
          filePath: localFilePath,
          name: 'file',
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

  // 模拟OCR识别（前端mock）
  mockOCR(_file) {
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

    wx.showToast({
      title: '使用模拟数据...',
      icon: 'none',
      duration: 1000
    });

    // 模拟OCR识别延迟
    setTimeout(() => {
      // 模拟识别结果
      const mockText =
        'SN: ABC123DEF456\nIMEI: 353456789012345\nIMEI2: 353456789012346';

      // 解析OCR结果
      this.parseOCRResultToForm(mockText);

      // 识别成功，进入下一步
      this.setData({
        activeStep: 1,
        isRecognizing: false
      });

      wx.showToast({
        title: '识别完成',
        icon: 'success',
        duration: 1500
      });

      this.scrollToElement('#step-2-card');
    }, 1000);
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
    const snLabelRegex =
      /(?:SN|S\/N|Serial(?:\s+(?:No\.?|Number))?|序列号)[\s:：]*([A-Z0-9]{8,15})/i;

    // 2. 纯序列号：8-15位大写字母和数字组合，排除纯数字
    const snPureRegex = /\b([A-Z0-9]{8,15})\b/;

    // 3. 带标签的 IMEI
    const imeiLabelRegex = /IMEI(?:2)?[\s:：]*(\d{15})/i;

    // 4. 纯 IMEI：15位数字
    const imeiPureRegex = /\b(\d{15})\b/;

    // 临时存储找到的 IMEI
    const foundImeis = new Set();
    let foundSn = false;

    lines.forEach(line => {
      // 优先匹配带标签的序列号
      if (!formData.sn) {
        const snLabelMatch = line.match(snLabelRegex);
        if (snLabelMatch) {
          formData.sn = snLabelMatch[1];
          foundSn = true;
        }
      }

      // 优先匹配带标签的 IMEI
      const imeiLabelMatch = line.match(imeiLabelRegex);
      if (imeiLabelMatch) {
        foundImeis.add(imeiLabelMatch[1]);
      }
    });

    // 如果没有找到带标签的 IMEI，尝试匹配纯数字 IMEI
    if (foundImeis.size === 0) {
      lines.forEach(line => {
        const imeiMatch = line.match(imeiPureRegex);
        if (imeiMatch) {
          foundImeis.add(imeiMatch[1]);
        }
      });
    }

    // 如果没有找到带标签的序列号，再尝试匹配纯序列号
    if (!foundSn && !formData.sn) {
      for (const line of lines) {
        const snMatch = line.match(snPureRegex);
        // 确保不是纯数字，且不是IMEI（15位数字）
        if (snMatch && !/^\d+$/.test(snMatch[1])) {
          formData.sn = snMatch[1];
          break; // 找到一个疑似序列号就停止
        }
      }
    }

    // 填充IMEI
    const imeiArray = Array.from(foundImeis);
    if (imeiArray.length > 0) formData.imei = imeiArray[0];
    if (imeiArray.length > 1) formData.imei2 = imeiArray[1];

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
  },

  // 关闭手机型号选择器
  onCloseModelPicker() {
    this.setData({ showModelPicker: false });
  },

  // 选择手机型号
  onSelectModel(e) {
    const { name, value } = e.detail;
    this.setData({
      selectedModelName: name,
      'formData.typeCode': value,
      showModelPicker: false
    });
  },

  // 查询保修信息
  async handleQuery() {
    const { sn, imei, typeCode } = this.data.formData;

    // 优先使用序列号，其次使用IMEI
    const queryKey = sn || imei;

    if (!queryKey) {
      wx.showToast({
        title: '请输入序列号或IMEI',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isQuerying: true
    });

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: buildApiUrl(API_ENDPOINTS.queryActiveInfo),
          method: 'GET',
          data: {
            typeCode: typeCode,
            code: queryKey
          },
          header: {
            Authorization: 'Bearer ' + wx.getStorageSync('token')
          },
          success: resolve,
          fail: reject
        });
      });

      const data = res.data;

      if (data.code === 200 && data.data) {
        const resultData = data.data;
        const coverageDate = resultData.coverage;
        let isExpired = false;
        let warrantyStatus = '未知';

        if (resultData.activated) {
          if (coverageDate) {
            const coverageTime = new Date(coverageDate).getTime();
            // 使用系统返回的时间或者当前时间
            const sysTime = resultData.systemTime
              ? new Date(resultData.systemTime).getTime()
              : new Date().getTime();
            // 如果质保时间晚于系统时间，则未过保，可以跳转亚丁屏卫
            isExpired = coverageTime <= sysTime;
            warrantyStatus = isExpired ? '已过保' : '保修中';
          } else {
            warrantyStatus = '已激活';
          }
        } else {
          warrantyStatus = '未激活';
          isExpired = true;
        }

        const mockData = {
          productName: resultData.model || '未知设备',
          activationDate: resultData.activateDate || '未知',
          coverageDate: coverageDate || '未知',
          isExpired: isExpired,
          warrantyStatus: warrantyStatus
        };

        this.setData({
          queryResult: mockData,
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

  // 跳转到公众号
  handleJumpToOfficialAccount() {
    const { queryResult } = this.data;

    if (!queryResult || queryResult.isExpired) {
      wx.showToast({
        title: '设备已过保，无法跳转',
        icon: 'none'
      });
      return;
    }

    // 小程序无法直接跳转公众号主页链接
    // 方案：复制公众号名称并提示用户搜索
    wx.setClipboardData({
      data: '亚丁屏卫',
      success: () => {
        wx.hideToast(); // 隐藏复制成功的默认提示
        wx.showModal({
          title: '即将前往微信搜索',
          content:
            '由于小程序限制，无法直接跳转。已为您复制公众号名称“亚丁屏卫”，请在微信首页搜索框粘贴并关注。',
          confirmText: '我知道了',
          showCancel: false
        });
      }
    });
  },

  // 重置查询
  handleReset() {
    this.setData({
      activeStep: 0,
      pictureList: [],
      queryResult: null,
      formData: {
        typeCode: '1',
        sn: '',
        imei: '',
        imei2: ''
      },
      selectedModelName: '苹果',
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
    wx.createSelectorQuery()
      .select(selector)
      .boundingClientRect(rect => {
        if (rect) {
          wx.pageScrollTo({
            scrollTop: rect.top - 100,
            duration: 300
          });
        }
      })
      .exec();
  }
});
