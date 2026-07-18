const { API_ENDPOINTS, buildApiUrl, getApiBase } = require('../../config');
const { parseDateTime, formatDateTime } = require('../../utils/date');
const { request } = require('../../utils/request');

Page({
  data: {
    orderList: [],
    isLoading: true,
    isRefreshing: false,
    // 分页相关
    pageNum: 1,
    pageSize: 10,
    finished: false,
    loadingMore: false,
    // 弹窗相关
    showSignedDialog: false,
    currentSignedItem: null,
    apiBase: ''
  },

  onLoad() {
    this.setData({ apiBase: getApiBase() });
    this.fetchOrderList(true);
  },

  onClickLeft() {
    wx.navigateBack();
  },

  // 查看已签署协议
  handleViewSignedContract(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showSignedDialog: true,
      currentSignedItem: item
    });
  },

  // 关闭已签署协议弹窗
  onCloseSignedDialog() {
    this.setData({
      showSignedDialog: false,
      currentSignedItem: null
    });
  },

  // 预览签名图片
  previewSignature() {
    const { currentSignedItem } = this.data;
    if (currentSignedItem && currentSignedItem.fullSignaturePath) {
      wx.previewImage({
        urls: [currentSignedItem.fullSignaturePath]
      });
    }
  },

  // scroll-view 下拉刷新
  onRefresh() {
    this.setData({ isRefreshing: true });
    this.fetchOrderList(true).then(() => {
      this.setData({ isRefreshing: false });
    }).catch(() => {
      this.setData({ isRefreshing: false });
    });
  },

  // scroll-view 触底加载更多
  onScrollToLower() {
    if (this.data.finished || this.data.loadingMore) return;
    this.fetchOrderList(false);
  },

  // 格式化订单数据
  formatOrderItem(item) {
    let isExpired = false;
    let warrantyStatus = '未知';
    // 通过 sysTime 和 coverage 对比，判断操作时手机是否已激活
    let activatedAtQuery = false;

    if (item.activated) {
      if (item.coverage) {
        // 使用 iOS 兼容的解析方式，避免 "yyyy-MM-dd HH:mm:ss" 在 iOS 下解析为 NaN
        const coverageTime = parseDateTime(item.coverage);
        // 优先使用后端返回的系统时间，无则回退到本机时间
        const sysTime = item.sysTime
          ? parseDateTime(item.sysTime)
          : Date.now();
        // 防御：解析失败时按 "未过保" 处理，避免 NaN 比较导致误判
        if (Number.isNaN(coverageTime) || Number.isNaN(sysTime)) {
          isExpired = false;
          warrantyStatus = '保修中';
        } else {
          // 如果质保时间晚于系统时间，则未过保
          isExpired = coverageTime <= sysTime;
          warrantyStatus = isExpired ? '已过保' : '保修中';
        }
        // 操作时手机已激活（有 coverage 说明已激活）
        activatedAtQuery = true;
      } else {
        // 有 activated 但无 coverage，根据 sysTime 判断
        warrantyStatus = '已激活';
        activatedAtQuery = true;
      }
    } else {
      // 未激活：通过 sysTime 和 coverage 对比确认
      if (item.sysTime && item.coverage) {
        const coverageTime = parseDateTime(item.coverage);
        const sysTime = parseDateTime(item.sysTime);
        if (Number.isNaN(coverageTime) || Number.isNaN(sysTime)) {
          // 解析失败时保持未激活的默认语义
          warrantyStatus = '未激活';
          isExpired = true;
          activatedAtQuery = false;
        } else {
          // 即使 activated 为 false，如果 sysTime 在 coverage 之前，说明当时可能已激活
          activatedAtQuery = sysTime <= coverageTime;
          if (activatedAtQuery) {
            warrantyStatus = '保修中';
            isExpired = false;
          } else {
            warrantyStatus = '已过保';
            isExpired = true;
          }
        }
      } else {
        warrantyStatus = '未激活';
        isExpired = true;
        activatedAtQuery = false;
      }
    }

    // 判断是否已签约：signatureDate, signatureImei, signatureModel 均存在即为已签约
    const isSigned = !!(item.signatureDate && item.signatureImei && item.signatureModel);

    // 根据 skipApiCall 判断登记类型
    const isNewPhoneRegister = item.skipApiCall === true || item.skipApiCall === 1;
    const registerTypeLabel = isNewPhoneRegister ? '新手机登记' : '旧手机识别';

    // 处理签名图片完整路径
    let fullSignaturePath = '';
    if (item.signaturePath) {
      const apiBase = getApiBase();
      fullSignaturePath = item.signaturePath.startsWith('http') ? item.signaturePath : `${apiBase}${item.signaturePath}`;
    }

    return {
      ...item,
      createTime: formatDateTime(item.createTime, ''),
      activateDate: formatDateTime(item.activateDate, '未知'),
      coverage: formatDateTime(item.coverage, ''),
      signatureDate: formatDateTime(item.signatureDate, ''),
      isExpired,
      warrantyStatus,
      activatedAtQuery,
      isSigned,
      isNewPhoneRegister,
      registerTypeLabel,
      fullSignaturePath
    };
  },

  /**
   * 获取订单列表
   * @param {boolean} isRefresh - 是否为刷新（重置分页）
   */
  async fetchOrderList(isRefresh = false) {
    if (isRefresh) {
      this.setData({
        isLoading: true,
        pageNum: 1,
        finished: false,
        loadingMore: false
      });
    } else {
      this.setData({ loadingMore: true });
    }

    const currentPage = isRefresh ? 1 : this.data.pageNum;

    try {
      const res = await request({
        url: buildApiUrl(API_ENDPOINTS.queryOrderList),
        method: 'GET',
        data: {
          pageNum: currentPage,
          pageSize: this.data.pageSize
        }
      });

      const data = res.data;

      if (data.code === 200 && data.rows) {
        const rows = data.rows;
        const formattedList = rows.map(item => this.formatOrderItem(item));
        // 判断是否还有更多数据
        const total = data.total || 0;
        const newList = isRefresh
          ? formattedList
          : [...this.data.orderList, ...formattedList];
        const finished =
          newList.length >= total || rows.length < this.data.pageSize;

        this.setData({
          orderList: newList,
          isLoading: false,
          loadingMore: false,
          finished: finished,
          pageNum: currentPage + 1
        });
      } else {
        throw new Error(data.msg || '获取记录失败');
      }
    } catch (error) {
      this.setData({
        isLoading: false,
        loadingMore: false
      });
      wx.showToast({
        title: error.message || '获取记录失败，请重试',
        icon: 'none'
      });
      console.error('获取查询记录失败:', error);
    }
  }
});
