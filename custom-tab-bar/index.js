Component({
  data: {
    active: 0,
    list: [
      {
        pagePath: '/pages/imei-query/imei-query',
        text: '查询',
        icon: 'search'
      },
      {
        pagePath: '/pages/my/my',
        text: '我的',
        icon: 'contact'
      }
    ]
  },

  methods: {
    onChange(e) {
      const index = e.detail;
      const item = this.data.list[index];
      wx.switchTab({
        url: item.pagePath
      });
    },

    init() {
      const page = getCurrentPages().pop();
      if (page) {
        const route = '/' + page.route;
        const index = this.data.list.findIndex(item => item.pagePath === route);
        if (index !== -1) {
          this.setData({ active: index });
        }
      }
    }
  }
});
