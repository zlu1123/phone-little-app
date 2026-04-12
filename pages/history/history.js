const { API_ENDPOINTS, buildApiUrl } = require('../../config');

Page({
  data: {
    orderList: [],
    isLoading: true,
    // 分页相关
    pageNum: 1,
    pageSize: 10,
    finished: false,
    loadingMore: false
  },

  onLoad() {
    this.fetchOrderList(true);
  },

  onClickLeft() {
    wx.navigateBack();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.fetchOrderList(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.finished || this.data.loadingMore) return;
    this.fetchOrderList(false);
  },

  // 格式化订单数据
  formatOrderItem(item) {
    let isExpired = false;
    let warrantyStatus = '未知';

    if (item.activated) {
      if (item.coverage) {
        const coverageTime = new Date(item.coverage).getTime();
        // 使用系统返回的时间或者当前时间
        const sysTime = item.sysTime
          ? new Date(item.sysTime).getTime()
          : new Date().getTime();
        // 如果质保时间晚于系统时间，则未过保
        isExpired = coverageTime <= sysTime;
        warrantyStatus = isExpired ? '已过保' : '保修中';
      } else {
        warrantyStatus = '已激活';
      }
    } else {
      warrantyStatus = '未激活';
      isExpired = true;
    }

    return {
      ...item,
      isExpired,
      warrantyStatus
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
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: buildApiUrl(API_ENDPOINTS.queryOrderList),
          method: 'GET',
          data: {
            pageNum: currentPage,
            pageSize: this.data.pageSize
          },
          header: {
            Authorization: 'Bearer ' + wx.getStorageSync('token')
          },
          success: resolve,
          fail: reject
        });
      });

      const data = res.data;

      if (data.code === 200 && data.data && data.data.rows) {
        const rows = data.data.rows;
        const formattedList = rows.map(item => this.formatOrderItem(item));
        // 判断是否还有更多数据
        const total = data.data.total || 0;
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
